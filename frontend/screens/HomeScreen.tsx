import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Image, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";

import { MapContainer } from "../components/map/MapContainer";
import { useAuth } from "../context/AuthContext";
import { CheckinsScreen } from "./CheckinsScreen";
import { LeaderboardScreen } from "./LeaderboardScreen";
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
import { getFollowingLeaderboard } from "../services/sessionService";
import {
  followUser,
  getCurrentUserProfile,
  getMyFollowers,
  getMyFollowing,
  getMyProfileStats,
  getUserProfileStats,
  unfollowUser,
} from "../services/userService";
import type { CheckinAvailability, CheckinPrompt } from "../types/checkin";
import type { Location, UserCoordinates } from "../types/location";
import type { CurrentUserProfile, FollowUser, UserProfileStats } from "../types/user";

type HomeTab = "map" | "checkins" | "saved" | "leaderboard" | "profile";
const TAB_BAR_RESERVED_HEIGHT = 80;
const CHECKIN_PROMPT_POLL_MS = 60 * 1000;
const NOTIFICATION_COOLDOWN_MS = 15 * 60 * 1000;
const INTERACTION_DEDUP_MS = 5_000;

function isUnauthorizedError(message: string | null | undefined): boolean {
  const normalized = (message ?? "").toLowerCase();
  return normalized.includes("unauthorized") || normalized.includes("credential") || normalized.includes("token");
}

function formatStudyMinutes(totalMinutes: number | null | undefined): string {
  const safeMinutes = Math.max(0, Math.floor(totalMinutes ?? 0));
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
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
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<CurrentUserProfile | null>(null);
  const [followers, setFollowers] = useState<FollowUser[]>([]);
  const [following, setFollowing] = useState<FollowUser[]>([]);
  const [viewedProfile, setViewedProfile] = useState<FollowUser | null>(null);
  const [updatingFollow, setUpdatingFollow] = useState(false);
  const [profileStats, setProfileStats] = useState<UserProfileStats | null>(null);
  const [profileRank, setProfileRank] = useState<number | null>(null);
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

  const loadFollowProfile = useCallback(async () => {
    if (!accessToken) {
      setCurrentUserProfile(null);
      setFollowers([]);
      setFollowing([]);
      setViewedProfile(null);
      return;
    }

    setProfileLoading(true);
    setProfileMessage(null);

    const [meResponse, followersResponse, followingResponse] = await Promise.all([
      getCurrentUserProfile(accessToken),
      getMyFollowers(accessToken),
      getMyFollowing(accessToken),
    ]);

    if (!meResponse.success || !meResponse.data) {
      if (isUnauthorizedError(meResponse.error)) {
        setAccessToken(null);
      } else {
        setProfileMessage(meResponse.error ?? "Failed to load profile.");
      }
      setProfileLoading(false);
      return;
    }

    if (!followersResponse.success || !followingResponse.success) {
      const firstError = followersResponse.error ?? followingResponse.error;
      if (isUnauthorizedError(firstError)) {
        setAccessToken(null);
      } else {
        setProfileMessage(firstError ?? "Failed to load followers.");
      }
      setProfileLoading(false);
      return;
    }

    const nextFollowers = followersResponse.data ?? [];
    const nextFollowing = followingResponse.data ?? [];

    setCurrentUserProfile(meResponse.data);
    setFollowers(nextFollowers);
    setFollowing(nextFollowing);

    setViewedProfile((previous) => {
      if (!previous) {
        return null;
      }
      const merged = [...nextFollowers, ...nextFollowing].find((entry) => entry.id === previous.id);
      return merged ?? previous;
    });

    setProfileLoading(false);
  }, [accessToken, setAccessToken]);

  useEffect(() => {
    if (activeTab !== "profile") {
      return;
    }
    void loadFollowProfile();
  }, [activeTab, loadFollowProfile]);

  const viewedUser = viewedProfile
    ? viewedProfile
    : currentUserProfile
      ? {
          id: currentUserProfile.id,
          name: currentUserProfile.name,
          profilePicture: currentUserProfile.profilePicture,
        }
      : null;
  const isViewingSelf = Boolean(
    currentUserProfile && viewedUser && currentUserProfile.id === viewedUser.id,
  );
  const isFollowingViewedUser = Boolean(
    viewedUser && following.some((user) => user.id === viewedUser.id),
  );

  useEffect(() => {
    if (activeTab !== "profile" || !accessToken || !currentUserProfile) {
      if (activeTab !== "profile") {
        setProfileStats(null);
        setProfileRank(null);
      }
      return;
    }

    const targetUserId = viewedUser?.id ?? currentUserProfile.id;
    let cancelled = false;

    const loadStats = async () => {
      setProfileLoading(true);
      setProfileMessage(null);

      const statsResponse =
        targetUserId === currentUserProfile.id
          ? await getMyProfileStats(accessToken)
          : await getUserProfileStats(accessToken, targetUserId);

      if (!statsResponse.success || !statsResponse.data) {
        if (isUnauthorizedError(statsResponse.error)) {
          setAccessToken(null);
        } else if (!cancelled) {
          setProfileMessage(statsResponse.error ?? "Failed to load profile stats.");
        }
        if (!cancelled) {
          setProfileLoading(false);
        }
        return;
      }

      const leaderboardResponse = await getFollowingLeaderboard(accessToken);
      if (!cancelled) {
        setProfileStats(statsResponse.data);
        if (leaderboardResponse.success && leaderboardResponse.data) {
          const match = leaderboardResponse.data.find((entry) => entry.user_id === targetUserId);
          setProfileRank(match?.rank ?? null);
        } else {
          setProfileRank(null);
        }
        setProfileLoading(false);
      }
    };

    void loadStats();
    return () => {
      cancelled = true;
    };
  }, [accessToken, activeTab, currentUserProfile, setAccessToken, viewedUser]);

  const handleFollowToggle = useCallback(async () => {
    if (!accessToken || !viewedUser || !currentUserProfile || currentUserProfile.id === viewedUser.id) {
      return;
    }

    setUpdatingFollow(true);
    const response = isFollowingViewedUser
      ? await unfollowUser(accessToken, viewedUser.id)
      : await followUser(accessToken, viewedUser.id);

    if (!response.success) {
      if (isUnauthorizedError(response.error)) {
        setAccessToken(null);
      } else {
        setProfileMessage(response.error ?? "Follow action failed.");
      }
      setUpdatingFollow(false);
      return;
    }

    await loadFollowProfile();
    setUpdatingFollow(false);
  }, [
    accessToken,
    currentUserProfile,
    isFollowingViewedUser,
    loadFollowProfile,
    setAccessToken,
    viewedUser,
  ]);

  const handleOpenProfileFromLeaderboard = useCallback((user: { id: string; name: string | null }) => {
    setViewedProfile({
      id: user.id,
      name: user.name,
      profilePicture: null,
    });
    setActiveTab("profile");
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

    if (activeTab === "leaderboard") {
      return (
        <LeaderboardScreen
          accessToken={accessToken}
          onAuthExpired={() => setAccessToken(null)}
          onOpenProfile={handleOpenProfileFromLeaderboard}
        />
      );
    }

    if (activeTab === "profile") {
      const mostStudiedLocation = profileStats?.most_studied_location?.name ?? "—";
      const averageFocus =
        typeof profileStats?.average_focus_level === "number"
          ? profileStats.average_focus_level.toFixed(1)
          : "—";

      return (
        <ScrollView contentContainerStyle={styles.profileSurface} showsVerticalScrollIndicator={false}>
          <View style={styles.profileHero}>
            <Text style={styles.profileEyebrow}>{isViewingSelf ? "My Profile" : "User Profile"}</Text>
            <Text style={styles.profileName}>{profileStats?.name ?? viewedUser?.name ?? "Unnamed user"}</Text>
            <Text style={styles.profileMeta}>
              This Week: {formatStudyMinutes(profileStats?.study_time_last_7_days)}
              {profileRank ? `  •  Rank #${profileRank}` : ""}
            </Text>
            <View style={styles.profileCountsRow}>
              <View style={styles.profileCountCard}>
                <Text style={styles.profileCountValue}>{followers.length}</Text>
                <Text style={styles.profileCountLabel}>Followers</Text>
              </View>
              <View style={styles.profileCountCard}>
                <Text style={styles.profileCountValue}>{following.length}</Text>
                <Text style={styles.profileCountLabel}>Following</Text>
              </View>
            </View>

            {!isViewingSelf && viewedUser ? (
              <Pressable
                disabled={updatingFollow}
                onPress={() => void handleFollowToggle()}
                style={({ pressed }) => [
                  styles.followButton,
                  isFollowingViewedUser ? styles.unfollowButton : styles.followButtonActive,
                  pressed && styles.followButtonPressed,
                  updatingFollow && styles.followButtonDisabled,
                ]}
              >
                <Text
                  style={[
                    styles.followButtonText,
                    isFollowingViewedUser && styles.unfollowButtonText,
                  ]}
                >
                  {updatingFollow ? "Saving..." : isFollowingViewedUser ? "Unfollow" : "Follow"}
                </Text>
              </Pressable>
            ) : null}

            {!isViewingSelf && currentUserProfile ? (
              <Pressable onPress={() => setViewedProfile(null)} style={styles.backToMeButton}>
                <Text style={styles.backToMeText}>View My Profile</Text>
              </Pressable>
            ) : null}

            {profileLoading ? <Text style={styles.profileInfoText}>Loading profile...</Text> : null}
            {profileMessage ? <Text style={styles.profileErrorText}>{profileMessage}</Text> : null}
          </View>

          <View style={styles.profileSection}>
            <Text style={styles.profileSectionTitle}>Study Stats</Text>
            <View style={styles.statsGrid}>
              <View style={styles.statCell}>
                <Text style={styles.statLabel}>Total Study Time</Text>
                <Text style={styles.statValue}>{formatStudyMinutes(profileStats?.total_study_time)}</Text>
              </View>
              <View style={styles.statCell}>
                <Text style={styles.statLabel}>This Week</Text>
                <Text style={styles.statValue}>{formatStudyMinutes(profileStats?.study_time_last_7_days)}</Text>
              </View>
              <View style={styles.statCell}>
                <Text style={styles.statLabel}>Sessions</Text>
                <Text style={styles.statValue}>{profileStats?.total_sessions ?? 0}</Text>
              </View>
              <View style={styles.statCell}>
                <Text style={styles.statLabel}>Unique Locations</Text>
                <Text style={styles.statValue}>{profileStats?.unique_locations ?? 0}</Text>
              </View>
              <View style={styles.statCellWide}>
                <Text style={styles.statLabel}>Most Studied Spot</Text>
                <Text style={styles.statValue}>{mostStudiedLocation}</Text>
              </View>
              <View style={styles.statCell}>
                <Text style={styles.statLabel}>Average Focus</Text>
                <Text style={styles.statValue}>{averageFocus}</Text>
              </View>
              <View style={styles.statCell}>
                <Text style={styles.statLabel}>Current Streak</Text>
                <Text style={styles.statValue}>{profileStats?.current_streak_days ?? 0}d</Text>
              </View>
            </View>
          </View>

          {profileStats?.recent_photos?.length ? (
            <View style={styles.profileSection}>
              <Text style={styles.profileSectionTitle}>Recent Study Photos</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoRow}>
                {profileStats.recent_photos.map((photo) => (
                  <Image key={`${photo.image_url}-${photo.created_at}`} source={{ uri: photo.image_url }} style={styles.profilePhoto} />
                ))}
              </ScrollView>
            </View>
          ) : null}

          <View style={styles.profileSection}>
            <Text style={styles.profileSectionTitle}>Followers</Text>
            {followers.length ? (
              followers.map((user) => (
                <Pressable
                  key={`follower-${user.id}`}
                  onPress={() => setViewedProfile(user)}
                  style={({ pressed }) => [styles.profileListItem, pressed && styles.profileListItemPressed]}
                >
                  <Text style={styles.profileListName}>{user.name ?? "Unnamed user"}</Text>
                  <Text style={styles.profileListMeta}>@{user.id.slice(0, 8)}</Text>
                </Pressable>
              ))
            ) : (
              <Text style={styles.profileEmptyText}>No followers yet.</Text>
            )}
          </View>

          <View style={styles.profileSection}>
            <Text style={styles.profileSectionTitle}>Following</Text>
            {following.length ? (
              following.map((user) => (
                <Pressable
                  key={`following-${user.id}`}
                  onPress={() => setViewedProfile(user)}
                  style={({ pressed }) => [styles.profileListItem, pressed && styles.profileListItemPressed]}
                >
                  <Text style={styles.profileListName}>{user.name ?? "Unnamed user"}</Text>
                  <Text style={styles.profileListMeta}>@{user.id.slice(0, 8)}</Text>
                </Pressable>
              ))
            ) : (
              <Text style={styles.profileEmptyText}>Not following anyone yet.</Text>
            )}
          </View>
        </ScrollView>
      );
    }

    return (
        <MapContainer
          accessToken={accessToken}
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
            onPress={() => setActiveTab("leaderboard")}
            style={({ pressed }) => [
              styles.tabItem,
              activeTab === "leaderboard" && styles.tabItemActive,
              pressed && styles.tabItemPressed,
            ]}
          >
            <Text style={[styles.tabIcon, activeTab === "leaderboard" && styles.tabIconActive]}>≣</Text>
            <Text style={[styles.tabLabel, activeTab === "leaderboard" && styles.tabLabelActive]}>Leaders</Text>
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
  profileSurface: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 112,
    gap: 12,
  },
  profileHero: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#d9cab4",
    backgroundColor: "#fff7ea",
    padding: 14,
    gap: 8,
  },
  profileEyebrow: {
    color: "#6b5f4d",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1,
    fontWeight: "800",
  },
  profileName: {
    color: "#2f4232",
    fontSize: 24,
    fontWeight: "800",
  },
  profileMeta: {
    color: "#6f6556",
    fontSize: 12,
  },
  profileCountsRow: {
    marginTop: 4,
    flexDirection: "row",
    gap: 10,
  },
  profileCountCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#decfb8",
    backgroundColor: "#fffdf8",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  profileCountValue: {
    color: "#3a4f38",
    fontSize: 22,
    fontWeight: "800",
  },
  profileCountLabel: {
    color: "#786a58",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  followButton: {
    marginTop: 4,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 9,
    alignSelf: "flex-start",
  },
  followButtonActive: {
    backgroundColor: "#2f6b57",
    borderColor: "#2f6b57",
  },
  unfollowButton: {
    backgroundColor: "#fffaf2",
    borderColor: "#d4c2a6",
  },
  followButtonPressed: {
    opacity: 0.85,
  },
  followButtonDisabled: {
    opacity: 0.65,
  },
  followButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800",
  },
  unfollowButtonText: {
    color: "#615342",
  },
  backToMeButton: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  backToMeText: {
    color: "#2f6b57",
    fontSize: 12,
    fontWeight: "700",
    textDecorationLine: "underline",
  },
  profileInfoText: {
    color: "#676355",
    fontSize: 12,
    fontWeight: "700",
  },
  profileErrorText: {
    color: "#9f3d33",
    fontSize: 12,
    fontWeight: "700",
  },
  profileSection: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#dfd2bf",
    backgroundColor: "#fffdf9",
    padding: 12,
    gap: 8,
  },
  profileSectionTitle: {
    color: "#334632",
    fontSize: 17,
    fontWeight: "800",
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  statCell: {
    minWidth: "47%",
    flexGrow: 1,
    backgroundColor: "#fffaf2",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 2,
  },
  statCellWide: {
    width: "100%",
    backgroundColor: "#fffaf2",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 2,
  },
  statLabel: {
    color: "#7d725f",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    fontWeight: "700",
  },
  statValue: {
    color: "#304532",
    fontSize: 16,
    fontWeight: "800",
  },
  photoRow: {
    gap: 10,
    paddingTop: 2,
    paddingBottom: 4,
  },
  profilePhoto: {
    width: 82,
    height: 82,
    borderRadius: 14,
    backgroundColor: "#efe6d8",
  },
  profileListItem: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e6dccd",
    backgroundColor: "#fffaf2",
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 2,
  },
  profileListItemPressed: {
    opacity: 0.8,
  },
  profileListName: {
    color: "#334632",
    fontSize: 14,
    fontWeight: "700",
  },
  profileListMeta: {
    color: "#7d725f",
    fontSize: 11,
  },
  profileEmptyText: {
    color: "#7d725f",
    fontSize: 13,
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
