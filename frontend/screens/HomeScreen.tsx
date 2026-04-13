import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";

import { MapContainer } from "../components/map/MapContainer";
import { useAuth } from "../context/AuthContext";
import { CheckinsScreen } from "./CheckinsScreen";
import { SavedScreen, type SavedSpotMeta } from "./SavedScreen";
import { getNearbyCheckinPrompt } from "../services/checkinService";
import {
  getCurrentCoordinatesIfPermitted,
  requestForegroundCoordinates,
} from "../services/deviceLocationService";
import { getLocationAvailability, getLocations, logLocationInteraction } from "../services/locationService";
import {
  requestNotificationPermission,
  sendCheckinPromptNotification,
} from "../services/notificationService";
import type { CheckinAvailability, CheckinPrompt } from "../types/checkin";
import type { Location, UserCoordinates } from "../types/location";

type HomeTab = "map" | "checkins" | "saved" | "profile";
const TAB_BAR_RESERVED_HEIGHT = 80;
const CHECKIN_PROMPT_POLL_MS = 60 * 1000;
const NOTIFICATION_COOLDOWN_MS = 15 * 60 * 1000;
const INTERACTION_DEDUP_MS = 5_000;

function isUnauthorizedError(message: string | null | undefined): boolean {
  const normalized = (message ?? "").toLowerCase();
  return normalized.includes("unauthorized") || normalized.includes("credential") || normalized.includes("token");
}

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
  const [preferredCheckinLocationId, setPreferredCheckinLocationId] = useState<string | null>(null);
  const lastNotificationRef = useRef<{ key: string; sentAt: number } | null>(null);
  const lastInteractionRef = useRef<Record<string, number>>({});

  const loadLocations = useCallback(async (coords: UserCoordinates | null) => {
    try {
      setLoading(true);
      setError(null);
      const primaryParams = coords
        ? {
            lat: coords.lat,
            lng: coords.lng,
            limit: 45,
            sort: "distance" as const,
          }
        : { limit: 45, sort: "name" as const };

      const primaryResponse = await getLocations(primaryParams);
      if (primaryResponse.success && primaryResponse.data) {
        setLocations(primaryResponse.data);
        return;
      }

      // Fallback to a simpler query when the distance recommendation call is slow/unavailable.
      const fallbackResponse = await getLocations({ limit: 45, sort: "name" });
      if (fallbackResponse.success && fallbackResponse.data) {
        setLocations(fallbackResponse.data);
        setError(null);
        return;
      }

      setLocations([]);
      setError(primaryResponse.error ?? fallbackResponse.error ?? "Failed to load locations");
    } catch {
      try {
        const fallbackResponse = await getLocations({ limit: 45, sort: "name" });
        if (fallbackResponse.success && fallbackResponse.data) {
          setLocations(fallbackResponse.data);
          setError(null);
          return;
        }
      } catch {
        // no-op; final error set below
      }
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
        if (isUnauthorizedError(response.error)) {
          setAccessToken(null);
        }
        setNearbyPrompt(null);
        return;
      }

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

  const handleLogLocationInteraction = useCallback(async (locationId: string, interactionType: "view" | "click") => {
    const key = `${locationId}:${interactionType}`;
    const now = Date.now();
    const lastLoggedAt = lastInteractionRef.current[key] ?? 0;
    if (now - lastLoggedAt < INTERACTION_DEDUP_MS) {
      return;
    }
    lastInteractionRef.current[key] = now;
    try {
      await logLocationInteraction(locationId, interactionType);
    } catch {
      // no-op: analytics should not block user actions
    }
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

  const promptLocationId = nearbyPrompt?.location_id ?? null;

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
          onAuthExpired={() => setAccessToken(null)}
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
          onLogLocationInteraction={handleLogLocationInteraction}
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
        {nearbyPrompt && nearbyPrompt.should_prompt && promptLocationId ? (
          <View style={styles.checkinPromptCard}>
            <Text style={styles.checkinPromptTitle}>
              {`Studying at ${nearbyPrompt.location_name ?? "this spot"}?`}
            </Text>
            <Text style={styles.checkinPromptMeta}>
              {nearbyPrompt.distance_meters
                ? `Make sure to check in. About ${Math.round(nearbyPrompt.distance_meters)}m away.`
                : "Make sure to check in."}
            </Text>
            <Pressable
              onPress={() => openCheckinsForLocation(promptLocationId)}
              style={({ pressed }) => [
                styles.checkinPromptActionButton,
                pressed && styles.checkinPromptActionButtonPressed,
              ]}
            >
              <Text style={styles.checkinPromptActionText}>Check In At This Spot</Text>
            </Pressable>
          </View>
        ) : null}

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
  checkinPromptActionButton: {
    marginTop: 4,
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#c9b28a",
    backgroundColor: "#fffdf8",
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  checkinPromptActionButtonPressed: {
    opacity: 0.8,
  },
  checkinPromptActionText: {
    color: "#5a4931",
    fontSize: 12,
    fontWeight: "800",
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
