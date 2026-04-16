import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Image, Linking, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

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
import { getFriendsLeaderboard } from "../services/sessionService";
import { PRIVACY_POLICY_URL } from "../services/api";
import { deleteMyAccount } from "../services/authService";
import {
  acceptFriendRequest,
  cancelOrDeclineFriendRequest,
  getCurrentUserProfile,
  getIncomingFriendRequests,
  getMyFriends,
  getOutgoingFriendRequests,
  getMyProfileStats,
  removeFriend,
  sendFriendRequest,
  getUserProfileStats,
} from "../services/userService";
import type { CheckinAvailability, CheckinPrompt } from "../types/checkin";
import type { Location, UserCoordinates } from "../types/location";
import type { CurrentUserProfile, FriendRelationshipStatus, FriendUser, UserProfileStats } from "../types/user";

type HomeTab = "map" | "checkins" | "saved" | "leaderboard" | "profile";
const TAB_BAR_RESERVED_HEIGHT = 80;
const CHECKIN_PROMPT_POLL_MS = 60 * 1000;
const NOTIFICATION_COOLDOWN_MS = 15 * 60 * 1000;
const INTERACTION_DEDUP_MS = 5_000;
const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "") ??
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ??
  "http://localhost:8000";

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

function resolveMediaUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) {
    try {
      const parsed = new URL(value);
      if (parsed.pathname.includes("/uploads/session_photos/")) {
        return `${API_BASE_URL}${parsed.pathname}${parsed.search}`;
      }
      if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
        return `${API_BASE_URL}${parsed.pathname}${parsed.search}`;
      }
      return value;
    } catch {
      return value;
    }
  }
  if (value.startsWith("/")) return `${API_BASE_URL}${value}`;
  return `${API_BASE_URL}/${value}`;
}

function TrophyIcon({ active = false }: { active?: boolean }) {
  const color = active ? "#ad7237" : "#7d7a70";
  return (
    <View style={styles.trophyIconWrap}>
      <View style={[styles.trophyCup, { borderColor: color }]}>
        <View style={[styles.trophyHandleLeft, { borderColor: color }]} />
        <View style={[styles.trophyHandleRight, { borderColor: color }]} />
      </View>
      <View style={[styles.trophyStem, { backgroundColor: color }]} />
      <View style={[styles.trophyBase, { backgroundColor: color }]} />
    </View>
  );
}

function ProfileIcon({ active = false }: { active?: boolean }) {
  const color = active ? "#ad7237" : "#7d7a70";
  return (
    <View style={styles.profileIconWrap}>
      <View style={[styles.profileIconHead, { borderColor: color }]} />
      <View style={[styles.profileIconBody, { borderColor: color }]} />
    </View>
  );
}

export function HomeScreen() {
  const { accessToken, setAccessToken, logout } = useAuth();
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<HomeTab>("map");
  const [savedSpotsById, setSavedSpotsById] = useState<Record<string, SavedSpotMeta>>({});
  const [userCoordinates, setUserCoordinates] = useState<UserCoordinates | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const [nearbyPrompt, setNearbyPrompt] = useState<CheckinPrompt | null>(null);
  const [dismissedPromptLocationId, setDismissedPromptLocationId] = useState<string | null>(null);
  const [preferredCheckinLocationId, setPreferredCheckinLocationId] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<CurrentUserProfile | null>(null);
  const [friends, setFriends] = useState<FriendUser[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<FriendUser[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<FriendUser[]>([]);
  const [viewedProfile, setViewedProfile] = useState<FriendUser | null>(null);
  const [updatingFriendship, setUpdatingFriendship] = useState(false);
  const [profileStats, setProfileStats] = useState<UserProfileStats | null>(null);
  const [profileRank, setProfileRank] = useState<number | null>(null);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteConfirmStepActive, setDeleteConfirmStepActive] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
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
    const initializeLocations = async () => {
      setLocationLoading(true);
      setLocationMessage(null);
      try {
        const coords = await getCurrentCoordinatesIfPermitted();
        if (coords) {
          setUserCoordinates(coords);
          setLocationMessage("Using your location for nearby recommendations.");
          await loadLocations(coords);
          return;
        }

        setUserCoordinates(null);
        await loadLocations(null);
      } catch {
        setUserCoordinates(null);
        await loadLocations(null);
      } finally {
        setLocationLoading(false);
      }
    };

    void initializeLocations();
  }, [loadLocations]);

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
  const promptLocationName = nearbyPrompt?.location_name ?? "this spot";
  const promptDistanceMeters = nearbyPrompt?.distance_meters ?? null;
  const shouldShowPrompt =
    Boolean(nearbyPrompt?.should_prompt && promptLocationId) &&
    promptLocationId !== dismissedPromptLocationId;

  useEffect(() => {
    if (!promptLocationId) {
      setDismissedPromptLocationId(null);
      return;
    }
    if (dismissedPromptLocationId && dismissedPromptLocationId !== promptLocationId) {
      setDismissedPromptLocationId(null);
    }
  }, [dismissedPromptLocationId, promptLocationId]);

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

  const loadFriendProfile = useCallback(async () => {
    if (!accessToken) {
      setCurrentUserProfile(null);
      setFriends([]);
      setIncomingRequests([]);
      setOutgoingRequests([]);
      setViewedProfile(null);
      return;
    }

    setProfileMessage(null);

    const [meResponse, friendsResponse, incomingResponse, outgoingResponse] = await Promise.all([
      getCurrentUserProfile(accessToken),
      getMyFriends(accessToken),
      getIncomingFriendRequests(accessToken),
      getOutgoingFriendRequests(accessToken),
    ]);

    if (!meResponse.success || !meResponse.data) {
      if (isUnauthorizedError(meResponse.error)) {
        setAccessToken(null);
      } else {
        setProfileMessage(meResponse.error ?? "Failed to load profile.");
      }
      return;
    }

    if (!friendsResponse.success || !incomingResponse.success || !outgoingResponse.success) {
      const firstError = friendsResponse.error ?? incomingResponse.error ?? outgoingResponse.error;
      if (isUnauthorizedError(firstError)) {
        setAccessToken(null);
      } else {
        setProfileMessage(firstError ?? "Failed to load friends.");
      }
      return;
    }

    const nextFriends = friendsResponse.data ?? [];
    const nextIncoming = incomingResponse.data ?? [];
    const nextOutgoing = outgoingResponse.data ?? [];

    setCurrentUserProfile(meResponse.data);
    setFriends(nextFriends);
    setIncomingRequests(nextIncoming);
    setOutgoingRequests(nextOutgoing);

    setViewedProfile((previous) => {
      if (!previous) {
        return null;
      }
      const merged = [...nextFriends, ...nextIncoming, ...nextOutgoing].find((entry) => entry.id === previous.id);
      return merged ?? previous;
    });

  }, [accessToken, setAccessToken]);

  useEffect(() => {
    if (activeTab !== "profile") {
      return;
    }
    void loadFriendProfile();
  }, [activeTab, loadFriendProfile]);

  const viewedUser = useMemo(
    () =>
      viewedProfile
        ? viewedProfile
        : currentUserProfile
          ? {
              id: currentUserProfile.id,
              name: currentUserProfile.name,
              profilePicture: currentUserProfile.profilePicture,
            }
          : null,
    [currentUserProfile, viewedProfile],
  );
  const isViewingSelf = Boolean(
    currentUserProfile && viewedUser && currentUserProfile.id === viewedUser.id,
  );
  const viewedFriendshipStatus: FriendRelationshipStatus = useMemo(() => {
    if (!viewedUser || !currentUserProfile) return "none";
    if (currentUserProfile.id === viewedUser.id) return "self";
    if (friends.some((user) => user.id === viewedUser.id)) return "friends";
    if (incomingRequests.some((user) => user.id === viewedUser.id)) return "incoming_request";
    if (outgoingRequests.some((user) => user.id === viewedUser.id)) return "outgoing_request";
    return "none";
  }, [currentUserProfile, friends, incomingRequests, outgoingRequests, viewedUser]);

  const targetProfileUserId = viewedUser?.id ?? currentUserProfile?.id ?? null;

  useEffect(() => {
    if (activeTab !== "profile" || !accessToken || !currentUserProfile) {
      if (activeTab !== "profile") {
        setProfileStats(null);
        setProfileRank(null);
      }
      return;
    }

    if (!targetProfileUserId) {
      return;
    }

    let cancelled = false;

    const loadStats = async () => {
      setProfileLoading(true);
      setProfileMessage(null);

      const statsResponse =
        targetProfileUserId === currentUserProfile.id
          ? await getMyProfileStats(accessToken)
          : await getUserProfileStats(accessToken, targetProfileUserId);

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

      const leaderboardResponse = await getFriendsLeaderboard(accessToken);
      if (!cancelled) {
        setProfileStats(statsResponse.data);
        if (leaderboardResponse.success && leaderboardResponse.data) {
          const match = leaderboardResponse.data.find((entry) => entry.user_id === targetProfileUserId);
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
  }, [accessToken, activeTab, currentUserProfile, setAccessToken, targetProfileUserId]);

  const handleFriendAction = useCallback(async () => {
    if (!accessToken || !viewedUser || !currentUserProfile || currentUserProfile.id === viewedUser.id) {
      return;
    }

    setUpdatingFriendship(true);
    const response =
      viewedFriendshipStatus === "friends"
        ? await removeFriend(accessToken, viewedUser.id)
        : viewedFriendshipStatus === "incoming_request"
          ? await acceptFriendRequest(accessToken, viewedUser.id)
          : viewedFriendshipStatus === "outgoing_request"
            ? await cancelOrDeclineFriendRequest(accessToken, viewedUser.id)
            : await sendFriendRequest(accessToken, viewedUser.id);

    if (!response.success) {
      if (isUnauthorizedError(response.error)) {
        setAccessToken(null);
      } else {
        setProfileMessage(response.error ?? "Friend action failed.");
      }
      setUpdatingFriendship(false);
      return;
    }

    await loadFriendProfile();
    setUpdatingFriendship(false);
  }, [
    acceptFriendRequest,
    accessToken,
    cancelOrDeclineFriendRequest,
    currentUserProfile,
    loadFriendProfile,
    removeFriend,
    sendFriendRequest,
    setAccessToken,
    viewedFriendshipStatus,
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

  const handleOpenPrivacyPolicy = useCallback(async () => {
    try {
      const isSupported = await Linking.canOpenURL(PRIVACY_POLICY_URL);
      if (!isSupported) {
        setProfileMessage("Unable to open the privacy policy right now.");
        return;
      }
      await Linking.openURL(PRIVACY_POLICY_URL);
    } catch {
      setProfileMessage("Unable to open the privacy policy right now.");
    }
  }, []);

  const runDeleteAccount = useCallback(async () => {
    if (!accessToken || deletingAccount) {
      return;
    }

    setDeletingAccount(true);
    setProfileMessage(null);
    const response = await deleteMyAccount(accessToken);

    if (!response.success) {
      if (isUnauthorizedError(response.error)) {
        setAccessToken(null);
      } else {
        setProfileMessage(response.error ?? "Failed to delete account.");
      }
      setDeletingAccount(false);
      return;
    }

    await logout();
    setDeletingAccount(false);
  }, [accessToken, deletingAccount, logout, setAccessToken]);

  const handleDeleteAccount = useCallback(() => {
    if (!accessToken || deletingAccount) {
      return;
    }

    Alert.alert(
      "Delete account?",
      "This will permanently remove your StudySpot account and data.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Continue",
          style: "destructive",
          onPress: () => {
            Alert.alert(
              "This cannot be undone",
              "You will lose your check-ins, sessions, friends, and saved spots.",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Continue",
                  style: "destructive",
                  onPress: () => {
                    setDeleteConfirmText("");
                    setDeleteConfirmStepActive(true);
                  },
                },
              ],
            );
          },
        },
      ],
    );
  }, [accessToken, deletingAccount]);

  const canSubmitDeleteTypedConfirmation = deleteConfirmText.trim().toUpperCase() === "DELETE";

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
      const weeklyMinutes = profileStats?.study_time_last_7_days ?? 0;
      const weeklyDailyAverage = Math.round(weeklyMinutes / 7);
      const averageSessionLength =
        profileStats && profileStats.total_sessions > 0
          ? Math.round(profileStats.total_study_time / profileStats.total_sessions)
          : 0;

      return (
        <ScrollView contentContainerStyle={styles.profileSurface} showsVerticalScrollIndicator={false}>
          <View style={styles.profileHero}>
            <View style={styles.profileTitleRow}>
              <ProfileIcon active />
              <Text style={styles.profileEyebrow}>{isViewingSelf ? "My Profile" : "User Profile"}</Text>
            </View>
            <Text style={styles.profileName}>{profileStats?.name ?? viewedUser?.name ?? "Unnamed user"}</Text>
            <View style={styles.profileEmphasisRow}>
              <View style={styles.profileEmphasisCard}>
                <Text style={styles.profileEmphasisLabel}>This Week</Text>
                <Text style={styles.profileEmphasisValue}>{formatStudyMinutes(weeklyMinutes)}</Text>
              </View>
              <View style={styles.profileEmphasisCard}>
                <Text style={styles.profileEmphasisLabel}>Rank</Text>
                <Text style={styles.profileEmphasisValue}>{profileRank ? `#${profileRank}` : "—"}</Text>
              </View>
            </View>
            <Text style={styles.profileSocialMeta}>
              {friends.length} friends • {incomingRequests.length} incoming requests
            </Text>

            {!isViewingSelf && viewedUser ? (
              <Pressable
                disabled={updatingFriendship}
                onPress={() => void handleFriendAction()}
                style={({ pressed }) => [
                  styles.followButton,
                  viewedFriendshipStatus === "friends" || viewedFriendshipStatus === "outgoing_request"
                    ? styles.unfollowButton
                    : styles.followButtonActive,
                  pressed && styles.followButtonPressed,
                  updatingFriendship && styles.followButtonDisabled,
                ]}
              >
                <Text
                  style={[
                    styles.followButtonText,
                    (viewedFriendshipStatus === "friends" || viewedFriendshipStatus === "outgoing_request") &&
                      styles.unfollowButtonText,
                  ]}
                >
                  {updatingFriendship
                    ? "Saving..."
                    : viewedFriendshipStatus === "friends"
                      ? "Remove Friend"
                      : viewedFriendshipStatus === "incoming_request"
                        ? "Accept Friend Request"
                        : viewedFriendshipStatus === "outgoing_request"
                          ? "Cancel Request"
                          : "Add Friend"}
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
              <View style={styles.statCell}>
                <Text style={styles.statLabel}>Daily Avg (7d)</Text>
                <Text style={styles.statValue}>{formatStudyMinutes(weeklyDailyAverage)}</Text>
              </View>
              <View style={styles.statCell}>
                <Text style={styles.statLabel}>Avg Session</Text>
                <Text style={styles.statValue}>{formatStudyMinutes(averageSessionLength)}</Text>
              </View>
            </View>
          </View>

          {profileStats?.recent_photos?.length ? (
            <View style={styles.profileSection}>
              <Text style={styles.profileSectionTitle}>Recent Study Photos</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoRow}>
                {profileStats.recent_photos.map((photo) => {
                  const uri = resolveMediaUrl(photo.image_url);
                  if (!uri) return null;
                  return <Image key={`${photo.image_url}-${photo.created_at}`} source={{ uri }} style={styles.profilePhoto} />;
                })}
              </ScrollView>
            </View>
          ) : null}

          <View style={styles.profileSection}>
            <Text style={styles.profileSectionTitle}>Friends</Text>
            {friends.length ? (
              friends.map((user) => (
                <Pressable
                  key={`friend-${user.id}`}
                  onPress={() => setViewedProfile(user)}
                  style={({ pressed }) => [styles.profileListItem, pressed && styles.profileListItemPressed]}
                >
                  <Text style={styles.profileListName}>{user.name ?? "Unnamed user"}</Text>
                  <Text style={styles.profileListMeta}>@{user.id.slice(0, 8)}</Text>
                </Pressable>
              ))
            ) : (
              <Text style={styles.profileEmptyText}>No friends yet.</Text>
            )}
          </View>

          <View style={styles.profileSection}>
            <Text style={styles.profileSectionTitle}>Incoming Requests</Text>
            {incomingRequests.length ? (
              incomingRequests.map((user) => (
                <Pressable
                  key={`incoming-${user.id}`}
                  onPress={() => setViewedProfile(user)}
                  style={({ pressed }) => [styles.profileListItem, pressed && styles.profileListItemPressed]}
                >
                  <Text style={styles.profileListName}>{user.name ?? "Unnamed user"}</Text>
                  <Text style={styles.profileListMeta}>@{user.id.slice(0, 8)}</Text>
                </Pressable>
              ))
            ) : (
              <Text style={styles.profileEmptyText}>No incoming requests.</Text>
            )}
          </View>

          <View style={styles.profileSection}>
            <Text style={styles.profileSectionTitle}>Outgoing Requests</Text>
            {outgoingRequests.length ? (
              outgoingRequests.map((user) => (
                <Pressable
                  key={`outgoing-${user.id}`}
                  onPress={() => setViewedProfile(user)}
                  style={({ pressed }) => [styles.profileListItem, pressed && styles.profileListItemPressed]}
                >
                  <Text style={styles.profileListName}>{user.name ?? "Unnamed user"}</Text>
                  <Text style={styles.profileListMeta}>@{user.id.slice(0, 8)}</Text>
                </Pressable>
              ))
            ) : (
              <Text style={styles.profileEmptyText}>No outgoing requests.</Text>
            )}
          </View>

          <View style={styles.profileSection}>
            <Text style={styles.profileSectionTitle}>Legal</Text>
            <Pressable onPress={() => void handleOpenPrivacyPolicy()} style={styles.legalLinkButton}>
              <Text style={styles.legalLinkText}>Privacy Policy</Text>
            </Pressable>
          </View>

          {isViewingSelf ? (
            <View style={styles.profileSection}>
              <Text style={styles.profileSectionTitle}>Account</Text>
              <Text style={styles.deleteAccountWarningText}>
                Permanently delete your account and all associated StudySpot data.
              </Text>
              <Pressable
                disabled={deletingAccount}
                onPress={handleDeleteAccount}
                style={({ pressed }) => [
                  styles.deleteAccountButton,
                  pressed && styles.deleteAccountButtonPressed,
                  deletingAccount && styles.deleteAccountButtonDisabled,
                ]}
              >
                <Text style={styles.deleteAccountButtonText}>{deletingAccount ? "Deleting..." : "Delete Account"}</Text>
              </Pressable>
              {deleteConfirmStepActive ? (
                <View style={styles.deleteConfirmBox}>
                  <Text style={styles.deleteConfirmTitle}>Final Confirmation</Text>
                  <Text style={styles.deleteConfirmHint}>Type DELETE to permanently remove your account.</Text>
                  <TextInput
                    autoCapitalize="characters"
                    autoCorrect={false}
                    editable={!deletingAccount}
                    onChangeText={setDeleteConfirmText}
                    placeholder="Type DELETE"
                    placeholderTextColor="#9b8f7b"
                    style={styles.deleteConfirmInput}
                    value={deleteConfirmText}
                  />
                  <View style={styles.deleteConfirmActions}>
                    <Pressable
                      disabled={deletingAccount}
                      onPress={() => {
                        setDeleteConfirmStepActive(false);
                        setDeleteConfirmText("");
                      }}
                      style={({ pressed }) => [styles.deleteConfirmCancelButton, pressed && styles.deleteAccountButtonPressed]}
                    >
                      <Text style={styles.deleteConfirmCancelText}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      disabled={deletingAccount || !canSubmitDeleteTypedConfirmation}
                      onPress={() => void runDeleteAccount()}
                      style={({ pressed }) => [
                        styles.deleteConfirmSubmitButton,
                        pressed && styles.deleteAccountButtonPressed,
                        (deletingAccount || !canSubmitDeleteTypedConfirmation) && styles.deleteAccountButtonDisabled,
                      ]}
                    >
                      <Text style={styles.deleteConfirmSubmitText}>{deletingAccount ? "Deleting..." : "Delete Forever"}</Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}
            </View>
          ) : null}
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
            <Pressable
              onPress={() => {
                void logout();
              }}
              style={styles.logoutButton}
            >
              <Text style={styles.logoutButtonText}>Sign Out</Text>
            </Pressable>
          </View>
        </SafeAreaView>
        {shouldShowPrompt && promptLocationId ? (
          <View style={styles.checkinPromptCard}>
            <Text style={styles.checkinPromptTitle}>
              {`Studying at ${promptLocationName}?`}
            </Text>
            <Text style={styles.checkinPromptMeta}>
              {promptDistanceMeters
                ? `Make sure to check in. About ${Math.round(promptDistanceMeters)}m away.`
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
            <Pressable
              onPress={() => setDismissedPromptLocationId(promptLocationId)}
              style={({ pressed }) => [styles.checkinPromptDismissButton, pressed && styles.checkinPromptActionButtonPressed]}
            >
              <Text style={styles.checkinPromptDismissText}>Maybe Later</Text>
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
            <TrophyIcon active={activeTab === "leaderboard"} />
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
            <ProfileIcon active={activeTab === "profile"} />
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
  checkinPromptDismissButton: {
    marginTop: 2,
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  checkinPromptDismissText: {
    color: "#7a6d58",
    fontSize: 12,
    fontWeight: "700",
    textDecorationLine: "underline",
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
  profileTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  profileName: {
    color: "#2f4232",
    fontSize: 24,
    fontWeight: "800",
  },
  profileEmphasisRow: {
    marginTop: 2,
    flexDirection: "row",
    gap: 10,
  },
  profileEmphasisCard: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: "#f7f0e3",
    borderWidth: 1,
    borderColor: "#e0d2bb",
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 4,
  },
  profileEmphasisLabel: {
    color: "#7d725f",
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    fontWeight: "800",
  },
  profileEmphasisValue: {
    color: "#2f4232",
    fontSize: 20,
    fontWeight: "900",
  },
  profileMeta: {
    color: "#6f6556",
    fontSize: 12,
  },
  profileSocialMeta: {
    color: "#7a7060",
    fontSize: 12,
    fontWeight: "600",
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
    fontSize: 15,
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
  legalLinkButton: {
    alignSelf: "flex-start",
    paddingVertical: 4,
  },
  legalLinkText: {
    color: "#2f6b57",
    fontSize: 13,
    fontWeight: "700",
    textDecorationLine: "underline",
  },
  deleteAccountWarningText: {
    color: "#7d725f",
    fontSize: 13,
    lineHeight: 19,
  },
  deleteAccountButton: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#d45f53",
    backgroundColor: "#fff4f2",
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  deleteAccountButtonPressed: {
    opacity: 0.8,
  },
  deleteAccountButtonDisabled: {
    opacity: 0.6,
  },
  deleteAccountButtonText: {
    color: "#a13028",
    fontSize: 13,
    fontWeight: "800",
  },
  deleteConfirmBox: {
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#ebc5bf",
    backgroundColor: "#fff8f7",
    padding: 10,
    gap: 8,
  },
  deleteConfirmTitle: {
    color: "#8f342c",
    fontSize: 13,
    fontWeight: "800",
  },
  deleteConfirmHint: {
    color: "#7d725f",
    fontSize: 12,
  },
  deleteConfirmInput: {
    borderWidth: 1,
    borderColor: "#e2d4bf",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: "#3f3529",
    backgroundColor: "#fffdf9",
    fontWeight: "700",
  },
  deleteConfirmActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
  },
  deleteConfirmCancelButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#d7c7ae",
    backgroundColor: "#fffdf8",
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  deleteConfirmCancelText: {
    color: "#6d6252",
    fontSize: 12,
    fontWeight: "700",
  },
  deleteConfirmSubmitButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#d45f53",
    backgroundColor: "#b53930",
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  deleteConfirmSubmitText: {
    color: "#fff8f7",
    fontSize: 12,
    fontWeight: "800",
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
  tabIconGlyph: {
    color: "#7d7a70",
  },
  tabIconGlyphActive: {
    color: "#ad7237",
  },
  trophyIconWrap: {
    width: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  trophyCup: {
    width: 11,
    height: 8,
    borderWidth: 1.7,
    borderTopWidth: 0,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
    position: "relative",
  },
  trophyHandleLeft: {
    position: "absolute",
    left: -5,
    top: 1,
    width: 4,
    height: 5,
    borderWidth: 1.3,
    borderRightWidth: 0,
    borderTopLeftRadius: 3,
    borderBottomLeftRadius: 3,
  },
  trophyHandleRight: {
    position: "absolute",
    right: -5,
    top: 1,
    width: 4,
    height: 5,
    borderWidth: 1.3,
    borderLeftWidth: 0,
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
  },
  trophyStem: {
    width: 3,
    height: 5,
    borderRadius: 2,
    marginTop: 1,
  },
  trophyBase: {
    width: 12,
    height: 3,
    borderRadius: 2,
    marginTop: 1,
  },
  profileIconWrap: {
    width: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  profileIconHead: {
    width: 7,
    height: 7,
    borderRadius: 4,
    borderWidth: 1.6,
  },
  profileIconBody: {
    marginTop: 2,
    width: 13,
    height: 7,
    borderWidth: 1.6,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    borderBottomWidth: 0,
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
