import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";

import { MapContainer } from "../components/map/MapContainer";
import { useAuth } from "../context/AuthContext";
import { CheckinsScreen } from "./CheckinsScreen";
import { SavedScreen, type SavedSpotMeta } from "./SavedScreen";
import { createCheckin, getNearbyCheckinPrompt } from "../services/checkinService";
import {
  getCurrentCoordinatesIfPermitted,
  requestForegroundCoordinates,
} from "../services/deviceLocationService";
import { getLocationAvailability, getLocations } from "../services/locationService";
import {
  requestNotificationPermission,
  sendCheckinPromptNotification,
} from "../services/notificationService";
import {
  DEFAULT_OCCUPANCY_OPTIONS,
  type CheckinAvailability,
  type CheckinPrompt,
  type OccupancyPercent,
} from "../types/checkin";
import type { Location, UserCoordinates } from "../types/location";

type HomeTab = "map" | "checkins" | "saved" | "profile";
const TAB_BAR_RESERVED_HEIGHT = 80;
const CHECKIN_PROMPT_POLL_MS = 60 * 1000;
const NOTIFICATION_COOLDOWN_MS = 15 * 60 * 1000;

export function HomeScreen() {
  const { accessToken, setAccessToken } = useAuth();
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<HomeTab>("map");
  const [savedSpotsById, setSavedSpotsById] = useState<Record<string, SavedSpotMeta>>({});
  const [userCoordinates, setUserCoordinates] = useState<UserCoordinates | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const [nearbyPrompt, setNearbyPrompt] = useState<CheckinPrompt | null>(null);
  const [checkinSubmitting, setCheckinSubmitting] = useState(false);
  const [checkinMessage, setCheckinMessage] = useState<string | null>(null);
  const [preferredCheckinLocationId, setPreferredCheckinLocationId] = useState<string | null>(null);
  const [occupancyOptions, setOccupancyOptions] = useState<OccupancyPercent[]>(DEFAULT_OCCUPANCY_OPTIONS);
  const lastNotificationRef = useRef<{ key: string; sentAt: number } | null>(null);

  const loadLocations = useCallback(async (coords: UserCoordinates | null) => {
    try {
      setLoading(true);
      setError(null);
      const response = await getLocations(
        coords
          ? {
              lat: coords.lat,
              lng: coords.lng,
              limit: 100,
              sort: "distance",
            }
          : { limit: 100, sort: "name" },
      );

      if (!response.success || !response.data) {
        setLocations([]);
        setError(response.error ?? "Failed to load locations");
        return;
      }

      setLocations(response.data);
    } catch {
      setLocations([]);
      setError("Failed to load locations");
    } finally {
      setLoading(false);
    }
  }, []);

  const requestLocationAndLoad = useCallback(async () => {
    setLocationLoading(true);
    setLocationMessage(null);

    try {
      const coords = await requestForegroundCoordinates();
      if (!coords) {
        setUserCoordinates(null);
        setLocationMessage("Location permission denied. Showing all spots.");
        await loadLocations(null);
        return;
      }

      setUserCoordinates(coords);
      setLocationMessage("Using your location for nearby recommendations.");
      await loadLocations(coords);
    } catch {
      setUserCoordinates(null);
      setLocationMessage("Could not get your location. Showing all spots.");
      await loadLocations(null);
    } finally {
      setLocationLoading(false);
    }
  }, [loadLocations]);

  useEffect(() => {
    void requestLocationAndLoad();
  }, [requestLocationAndLoad]);

  const pollCheckinPrompt = useCallback(async () => {
    if (!accessToken) {
      setNearbyPrompt(null);
      return;
    }

    try {
      const freshCoords = await getCurrentCoordinatesIfPermitted();
      if (!freshCoords) {
        setNearbyPrompt(null);
        return;
      }

      setUserCoordinates(freshCoords);
      const response = await getNearbyCheckinPrompt(accessToken, {
        lat: freshCoords.lat,
        lng: freshCoords.lng,
      });
      if (!response.success || !response.data) {
        setNearbyPrompt(null);
        return;
      }

      setOccupancyOptions(response.data.occupancy_options);
      setNearbyPrompt(response.data);
      if (!response.data.should_prompt || !response.data.location_id || !response.data.location_name) {
        return;
      }

      const canNotify = await requestNotificationPermission();
      if (!canNotify) {
        return;
      }

      const now = Date.now();
      const key = response.data.location_id;
      if (
        lastNotificationRef.current &&
        lastNotificationRef.current.key === key &&
        now - lastNotificationRef.current.sentAt < NOTIFICATION_COOLDOWN_MS
      ) {
        return;
      }

      await sendCheckinPromptNotification(response.data.location_name);
      lastNotificationRef.current = { key, sentAt: now };
    } catch {
      setNearbyPrompt(null);
    }
  }, [accessToken]);

  useEffect(() => {
    void pollCheckinPrompt();
    if (!accessToken) {
      return;
    }

    const timer = setInterval(() => {
      void pollCheckinPrompt();
    }, CHECKIN_PROMPT_POLL_MS);

    return () => clearInterval(timer);
  }, [accessToken, pollCheckinPrompt]);

  const handleCheckinSubmit = useCallback(
    async (occupancyPercent: OccupancyPercent, locationId?: string) => {
      const targetLocationId = locationId ?? nearbyPrompt?.location_id;
      if (!accessToken || !targetLocationId) {
        return;
      }
      if (!userCoordinates) {
        setCheckinMessage("Turn on location services to check in.");
        return;
      }

      setCheckinSubmitting(true);
      setCheckinMessage(null);
      try {
        const response = await createCheckin(accessToken, {
          location_id: targetLocationId,
          occupancy_percent: occupancyPercent,
          lat: userCoordinates.lat,
          lng: userCoordinates.lng,
        });
        if (!response.success) {
          setCheckinMessage(response.error ?? "Failed to check in");
          return;
        }

        const estimatedOccupancy = response.data?.availability.occupancy_percent;
        setCheckinMessage(
          estimatedOccupancy !== undefined
            ? `Checked in. Estimated occupancy: ${estimatedOccupancy}%`
            : "Checked in successfully.",
        );
        setNearbyPrompt((previous) =>
          previous
            ? {
                ...previous,
                should_prompt: false,
              }
            : previous,
        );
      } catch {
        setCheckinMessage("Failed to check in");
      } finally {
        setCheckinSubmitting(false);
      }
    },
    [accessToken, nearbyPrompt, userCoordinates],
  );

  const loadLocationAvailability = useCallback(async (locationId: string) => {
    const response = await getLocationAvailability(locationId);
    if (!response.success || !response.data) {
      return {
        availability: null as CheckinAvailability | null,
        error: response.error ?? "Failed to load availability",
      };
    }

    return {
      availability: response.data,
      error: null,
    };
  }, []);

  const openCheckinsForLocation = useCallback((locationId: string) => {
    setPreferredCheckinLocationId(locationId);
    setActiveTab("checkins");
  }, []);

  const handleSaveSpot = useCallback((locationId: string) => {
    setSavedSpotsById((prev) => {
      if (prev[locationId]) return prev;
      return {
        ...prev,
        [locationId]: {
          rating: null,
          comment: "",
        },
      };
    });
  }, []);

  const handleRemoveSpot = useCallback((locationId: string) => {
    setSavedSpotsById((prev) => {
      if (!prev[locationId]) return prev;
      const next = { ...prev };
      delete next[locationId];
      return next;
    });
  }, []);

  const handleRateSpot = useCallback((locationId: string, rating: number) => {
    setSavedSpotsById((prev) => ({
      ...prev,
      [locationId]: {
        rating,
        comment: prev[locationId]?.comment ?? "",
      },
    }));
  }, []);

  const handleUpdateComment = useCallback((locationId: string, comment: string) => {
    setSavedSpotsById((prev) => ({
      ...prev,
      [locationId]: {
        rating: prev[locationId]?.rating ?? null,
        comment,
      },
    }));
  }, []);

  const renderContent = () => {
    if (activeTab === "saved") {
      return (
        <SavedScreen
          locations={locations}
          onRateSpot={handleRateSpot}
          onRemoveSpot={handleRemoveSpot}
          onSaveSpot={handleSaveSpot}
          onUpdateComment={handleUpdateComment}
          savedSpotsById={savedSpotsById}
        />
      );
    }

    if (activeTab === "checkins") {
      return (
        <CheckinsScreen
          accessToken={accessToken}
          locations={locations}
          onConsumePreferredLocation={() => setPreferredCheckinLocationId(null)}
          preferredLocationId={preferredCheckinLocationId}
          userCoordinates={userCoordinates}
        />
      );
    }

    if (activeTab === "profile") {
      return (
        <View style={styles.placeholderSurface}>
          <Text style={styles.placeholderTitle}>Your Profile</Text>
          <Text style={styles.placeholderBody}>
            Public profile and social visibility controls will show here in the next iteration.
          </Text>
        </View>
      );
    }

    return (
      <MapContainer
        canCheckIn={Boolean(accessToken)}
        error={error}
        loading={loading}
        locations={locations}
        onOpenCheckinsForLocation={openCheckinsForLocation}
        onLoadAvailability={loadLocationAvailability}
        onRetry={() => void loadLocations(userCoordinates)}
        userCoordinates={userCoordinates}
      />
    );
  };

  return (
    <View style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.screen}>
        <SafeAreaView style={styles.headerSafeArea}>
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>StudySpot</Text>
              <Text style={styles.subtitle}>Find your ideal study space</Text>
              {locationMessage ? (
                <Text style={styles.locationMessage}>
                  {locationLoading ? "Checking location..." : locationMessage}
                </Text>
              ) : null}
              {!userCoordinates && !locationLoading ? (
                <Pressable onPress={() => void requestLocationAndLoad()}>
                  <Text style={styles.locationLink}>Enable location for nearby results</Text>
                </Pressable>
              ) : null}
            </View>
            <Pressable onPress={() => setAccessToken(null)} style={styles.logoutButton}>
              <Text style={styles.logoutButtonText}>Sign Out</Text>
            </Pressable>
          </View>
        </SafeAreaView>
        {nearbyPrompt?.should_prompt && nearbyPrompt.location_id ? (
          <View style={styles.checkinPromptCard}>
            <Text style={styles.checkinPromptTitle}>
              {nearbyPrompt.message ?? "Studying nearby? Make sure to check in!"}
            </Text>
            <Text style={styles.checkinPromptMeta}>
              {nearbyPrompt.distance_meters
                ? `About ${Math.round(nearbyPrompt.distance_meters)}m away`
                : "Nearby location detected"}
            </Text>
            <View style={styles.checkinOptionsRow}>
              {occupancyOptions.map((option) => (
                <Pressable
                  key={option}
                  disabled={checkinSubmitting}
                  onPress={() => void handleCheckinSubmit(option)}
                  style={({ pressed }) => [
                    styles.occupancyButton,
                    checkinSubmitting && styles.occupancyButtonDisabled,
                    pressed && styles.occupancyButtonPressed,
                  ]}
                >
                  <Text style={styles.occupancyButtonText}>{option}%</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
        {checkinMessage ? <Text style={styles.checkinMessage}>{checkinMessage}</Text> : null}

        <View style={styles.contentSurface}>{renderContent()}</View>

        <View style={styles.tabBar}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setActiveTab("map")}
            style={({ pressed }) => [
              styles.tabItem,
              activeTab === "map" && styles.tabItemActive,
              pressed && styles.tabItemPressed,
            ]}
          >
            <Text style={[styles.tabIcon, activeTab === "map" && styles.tabIconActive]}>⌖</Text>
            <Text style={[styles.tabLabel, activeTab === "map" && styles.tabLabelActive]}>Map</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => setActiveTab("checkins")}
            style={({ pressed }) => [
              styles.tabItem,
              activeTab === "checkins" && styles.tabItemActive,
              pressed && styles.tabItemPressed,
            ]}
          >
            <Text style={[styles.tabIcon, activeTab === "checkins" && styles.tabIconActive]}>✓</Text>
            <Text style={[styles.tabLabel, activeTab === "checkins" && styles.tabLabelActive]}>Check-Ins</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => setActiveTab("saved")}
            style={({ pressed }) => [
              styles.tabItem,
              activeTab === "saved" && styles.tabItemActive,
              pressed && styles.tabItemPressed,
            ]}
          >
            <Text style={[styles.tabIcon, activeTab === "saved" && styles.tabIconActive]}>☆</Text>
            <Text style={[styles.tabLabel, activeTab === "saved" && styles.tabLabelActive]}>Saved</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => setActiveTab("profile")}
            style={({ pressed }) => [
              styles.tabItem,
              activeTab === "profile" && styles.tabItemActive,
              pressed && styles.tabItemPressed,
            ]}
          >
            <Text style={[styles.tabIcon, activeTab === "profile" && styles.tabIconActive]}>◌</Text>
            <Text style={[styles.tabLabel, activeTab === "profile" && styles.tabLabelActive]}>Profile</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#efe8dc",
  },
  screen: {
    flex: 1,
  },
  headerSafeArea: {
    backgroundColor: "#efe8dc",
  },
  header: {
    paddingTop: 8,
    paddingBottom: 10,
    paddingHorizontal: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  title: {
    fontSize: 30,
    fontWeight: "800",
    color: "#2f4a30",
    letterSpacing: 0.2,
  },
  subtitle: {
    marginTop: 1,
    color: "#6c6b61",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1.6,
  },
  locationMessage: {
    marginTop: 4,
    color: "#4b5f45",
    fontSize: 12,
    fontWeight: "600",
  },
  locationLink: {
    marginTop: 4,
    color: "#3f5b35",
    fontSize: 12,
    fontWeight: "700",
    textDecorationLine: "underline",
  },
  logoutButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#cdbd9f",
    backgroundColor: "#fbf7ee",
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  logoutButtonText: {
    color: "#4b5f45",
    fontWeight: "700",
    fontSize: 12,
  },
  contentSurface: {
    flex: 1,
    borderRadius: 0,
    overflow: "hidden",
    backgroundColor: "#ffffff",
    marginBottom: TAB_BAR_RESERVED_HEIGHT,
  },
  checkinPromptCard: {
    marginHorizontal: 12,
    marginBottom: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#d5c5a9",
    backgroundColor: "#fff5e3",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
  checkinPromptTitle: {
    color: "#4a3b27",
    fontSize: 14,
    fontWeight: "800",
  },
  checkinPromptMeta: {
    color: "#7a6d58",
    fontSize: 12,
    fontWeight: "600",
  },
  checkinOptionsRow: {
    marginTop: 4,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  occupancyButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#c9b28a",
    backgroundColor: "#fffdf8",
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  occupancyButtonPressed: {
    opacity: 0.8,
  },
  occupancyButtonDisabled: {
    opacity: 0.5,
  },
  occupancyButtonText: {
    color: "#5a4931",
    fontSize: 12,
    fontWeight: "800",
  },
  checkinMessage: {
    marginHorizontal: 14,
    marginBottom: 8,
    color: "#4c5f44",
    fontSize: 12,
    fontWeight: "700",
  },
  placeholderSurface: {
    flex: 1,
    backgroundColor: "#f5efe2",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  placeholderTitle: {
    color: "#334A33",
    fontSize: 26,
    fontWeight: "800",
    textAlign: "center",
  },
  placeholderBody: {
    marginTop: 8,
    color: "#6F685D",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  tabBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#fcf8ef",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: TAB_BAR_RESERVED_HEIGHT,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    borderTopWidth: 1,
    borderTopColor: "#dacdb7",
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    borderRadius: 14,
    minHeight: 64,
  },
  tabItemActive: {
    backgroundColor: "#f3e8d7",
  },
  tabItemPressed: {
    opacity: 0.8,
  },
  tabIcon: {
    fontSize: 33,
    color: "#7d7a70",
  },
  tabIconActive: {
    color: "#ad7237",
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#7d7a70",
  },
  tabLabelActive: {
    color: "#ad7237",
  },
});
