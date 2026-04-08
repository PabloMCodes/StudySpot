import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { checkoutCheckin, createCheckin, getMyCheckins } from "../services/checkinService";
import {
  createSession,
  getActiveSession,
  getSession,
  joinSession,
  leaveSession,
  updateSessionUsage,
} from "../services/sessionService";
import {
  DEFAULT_OCCUPANCY_OPTIONS,
} from "../types/checkin";
import type {
  MyCheckinSession,
  MyCheckinsResponse,
  OccupancyPercent,
} from "../types/checkin";
import type { StudySession } from "../types/session";
import type { Location, UserCoordinates } from "../types/location";

interface CheckinsScreenProps {
  accessToken: string | null;
  userCoordinates: UserCoordinates | null;
  preferredLocationId: string | null;
  onConsumePreferredLocation: () => void;
  locations: Location[];
}

const CHECKINS_REFRESH_MS = 30 * 1000;

function formatDateTime(isoValue: string): string {
  const date = new Date(isoValue);
  return date.toLocaleString();
}

function formatDurationMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) {
    return `${minutes}m`;
  }
  return `${hours}h ${minutes}m`;
}

function activeElapsedLabel(activeCheckin: MyCheckinSession, nowMillis: number): string {
  const startedMillis = new Date(activeCheckin.checked_in_at).getTime();
  const elapsedSeconds = Math.max(0, Math.floor((nowMillis - startedMillis) / 1000));
  const hours = Math.floor(elapsedSeconds / 3600);
  const minutes = Math.floor((elapsedSeconds % 3600) / 60);
  const seconds = elapsedSeconds % 60;
  return `${hours}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
}

export function CheckinsScreen({
  accessToken,
  userCoordinates,
  preferredLocationId,
  onConsumePreferredLocation,
  locations,
}: CheckinsScreenProps) {
  const [checkinsData, setCheckinsData] = useState<MyCheckinsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [nowMillis, setNowMillis] = useState(Date.now());
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(preferredLocationId);
  const [checkoutNote, setCheckoutNote] = useState("");
  const [studySession, setStudySession] = useState<StudySession | null>(null);
  const [sessionTitle, setSessionTitle] = useState("");
  const [joinSessionId, setJoinSessionId] = useState("");
  const [sessionSubmitting, setSessionSubmitting] = useState(false);

  const refreshCheckins = useCallback(async () => {
    if (!accessToken) {
      setCheckinsData(null);
      return;
    }

    setLoading(true);
    const response = await getMyCheckins(accessToken);
    if (!response.success || !response.data) {
      setMessage(response.error ?? "Failed to load check-ins");
      setLoading(false);
      return;
    }

    setCheckinsData(response.data);
    setLoading(false);
  }, [accessToken]);

  useEffect(() => {
    if (preferredLocationId) {
      setSelectedLocationId(preferredLocationId);
      onConsumePreferredLocation();
    }
  }, [onConsumePreferredLocation, preferredLocationId]);

  useEffect(() => {
    void refreshCheckins();
  }, [refreshCheckins]);

  useEffect(() => {
    const timer = setInterval(() => {
      setNowMillis(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!accessToken) {
      setStudySession(null);
      return;
    }
    const refreshTimer = setInterval(() => {
      void refreshCheckins();
    }, CHECKINS_REFRESH_MS);
    return () => clearInterval(refreshTimer);
  }, [accessToken, refreshCheckins]);

  useEffect(() => {
    if (!accessToken) {
      setStudySession(null);
      setJoinSessionId("");
      return;
    }

    let isActive = true;

    const loadActiveSession = async () => {
      const response = await getActiveSession(accessToken);
      if (!isActive) {
        return;
      }

      if (!response.success) {
        return;
      }

      setStudySession(response.data);
      setJoinSessionId(response.data?.id ?? "");
    };

    void loadActiveSession();

    return () => {
      isActive = false;
    };
  }, [accessToken]);

  const activeCheckin = checkinsData?.active_checkin ?? null;
  const history = checkinsData?.history ?? [];
  const occupancyOptions = checkinsData?.occupancy_options ?? DEFAULT_OCCUPANCY_OPTIONS;
  const selectedLocation = useMemo(
    () => locations.find((location) => location.id === selectedLocationId) ?? null,
    [locations, selectedLocationId],
  );
  const defaultSessionTitle = selectedLocation
    ? `${selectedLocation.name} Study Session`
    : "Study Session";

  const handleCheckin = useCallback(
    async (occupancyPercent: OccupancyPercent) => {
      if (!accessToken) {
        setMessage("Sign in to check in.");
        return;
      }
      if (!selectedLocationId) {
        setMessage("Select a location first.");
        return;
      }
      if (!userCoordinates) {
        setMessage("Turn on location services to check in.");
        return;
      }

      const response = await createCheckin(accessToken, {
        location_id: selectedLocationId,
        occupancy_percent: occupancyPercent,
        lat: userCoordinates.lat,
        lng: userCoordinates.lng,
      });
      if (!response.success) {
        setMessage(response.error ?? "Failed to check in");
        return;
      }

      const availability = response.data?.availability.occupancy_percent;
      setMessage(
        availability !== undefined
          ? `Checked in. AI availability now ${availability}%.`
          : "Checked in successfully.",
      );
      void refreshCheckins();
    },
    [accessToken, refreshCheckins, selectedLocationId, userCoordinates],
  );

  const handleCheckout = useCallback(
    async (occupancyPercent: OccupancyPercent) => {
      if (!accessToken) {
        setMessage("Sign in to check out.");
        return;
      }
      if (!activeCheckin) {
        setMessage("No active check-in found.");
        return;
      }
      if (!userCoordinates) {
        setMessage("Turn on location services to check out.");
        return;
      }

      const response = await checkoutCheckin(accessToken, {
        checkin_id: activeCheckin.id,
        occupancy_percent: occupancyPercent,
        lat: userCoordinates.lat,
        lng: userCoordinates.lng,
        note: checkoutNote.trim() ? checkoutNote.trim() : undefined,
      });
      if (!response.success) {
        setMessage(response.error ?? "Failed to check out");
        return;
      }

      setCheckoutNote("");
      setMessage("Checked out. Session saved.");
      void refreshCheckins();
    },
    [accessToken, activeCheckin, checkoutNote, refreshCheckins, userCoordinates],
  );

  const handleCreateStudySession = useCallback(
    async (occupancyPercent: OccupancyPercent) => {
      if (!accessToken) {
        setMessage("Sign in to create a study session.");
        return;
      }
      if (!selectedLocationId) {
        setMessage("Select a location before creating a study session.");
        return;
      }

      setSessionSubmitting(true);
      try {
        const response = await createSession(accessToken, {
          location_id: selectedLocationId,
          title: sessionTitle.trim() || defaultSessionTitle,
          ends_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
          max_participants: 6,
          current_usage_percent: occupancyPercent,
        });
        if (!response.success || !response.data) {
          setMessage(response.error ?? "Failed to create study session");
          return;
        }

        setStudySession(response.data);
        setJoinSessionId(response.data.id);
        setSessionTitle("");
        setMessage("Study session created. Share the session ID so others can join.");
      } finally {
        setSessionSubmitting(false);
      }
    },
    [accessToken, defaultSessionTitle, selectedLocationId, sessionTitle],
  );

  const handleJoinStudySession = useCallback(
    async (occupancyPercent: OccupancyPercent) => {
      if (!accessToken) {
        setMessage("Sign in to join a study session.");
        return;
      }

      const trimmedSessionId = joinSessionId.trim();
      if (!trimmedSessionId) {
        setMessage("Paste a session ID to join.");
        return;
      }

      setSessionSubmitting(true);
      try {
        const response = await joinSession(accessToken, trimmedSessionId, {
          current_usage_percent: occupancyPercent,
        });
        if (!response.success) {
          setMessage(response.error ?? "Failed to join study session");
          return;
        }

        const sessionResponse = await getSession(accessToken, trimmedSessionId);
        if (!sessionResponse.success || !sessionResponse.data) {
          setMessage(sessionResponse.error ?? response.data?.message ?? "Joined session, but failed to load details.");
          return;
        }

        setStudySession(sessionResponse.data);
        setJoinSessionId(trimmedSessionId);
        setMessage(response.data?.message ?? "Joined study session.");
      } finally {
        setSessionSubmitting(false);
      }
    },
    [accessToken, joinSessionId],
  );

  const handleLoadStudySession = useCallback(async () => {
    if (!accessToken) {
      setMessage("Sign in to load a study session.");
      return;
    }

    const trimmedSessionId = joinSessionId.trim();
    if (!trimmedSessionId) {
      setMessage("Paste a session ID to load.");
      return;
    }

    setSessionSubmitting(true);
    try {
      const response = await getSession(accessToken, trimmedSessionId);
      if (!response.success || !response.data) {
        setMessage(response.error ?? "Failed to load study session");
        return;
      }

      setStudySession(response.data);
      setMessage("Study session loaded.");
    } finally {
      setSessionSubmitting(false);
    }
  }, [accessToken, joinSessionId]);

  const handleUpdateStudySessionUsage = useCallback(
    async (occupancyPercent: OccupancyPercent) => {
      if (!accessToken) {
        setMessage("Sign in to update study session usage.");
        return;
      }
      if (!studySession) {
        setMessage("Create or join a study session first.");
        return;
      }

      setSessionSubmitting(true);
      try {
        const response = await updateSessionUsage(accessToken, studySession.id, {
          current_usage_percent: occupancyPercent,
        });
        if (!response.success || !response.data) {
          setMessage(response.error ?? "Failed to update study session usage");
          return;
        }

        setStudySession(response.data);
        setMessage(`Session usage updated to ${occupancyPercent}%.`);
      } finally {
        setSessionSubmitting(false);
      }
    },
    [accessToken, studySession],
  );

  const handleLeaveStudySession = useCallback(
    async (occupancyPercent: OccupancyPercent) => {
      if (!accessToken) {
        setMessage("Sign in to leave the study session.");
        return;
      }
      if (!studySession) {
        setMessage("No active study session to leave.");
        return;
      }

      setSessionSubmitting(true);
      try {
        const response = await leaveSession(accessToken, studySession.id, {
          current_usage_percent: occupancyPercent,
        });
        if (!response.success) {
          setMessage(response.error ?? "Failed to leave study session");
          return;
        }

        setStudySession(null);
        setJoinSessionId("");
        setMessage(response.data?.message ?? "Left study session.");
      } finally {
        setSessionSubmitting(false);
      }
    },
    [accessToken, studySession],
  );

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.heroCard}>
        <Text style={styles.heroEyebrow}>Check-Ins</Text>
        <Text style={styles.heroTitle}>Track your study sessions</Text>
        <Text style={styles.heroSubtitle}>
          Check in when you arrive, check out when you leave, and keep quick notes for each session.
        </Text>
      </View>

      {message ? (
        <View style={styles.messageCard}>
          <Text style={styles.messageText}>{message}</Text>
        </View>
      ) : null}

      {activeCheckin ? (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Active Session</Text>
          <Text style={styles.activeName}>{activeCheckin.location_name}</Text>
          <Text style={styles.muted}>Checked in at {formatDateTime(activeCheckin.checked_in_at)}</Text>
          <Text style={styles.timerText}>{activeElapsedLabel(activeCheckin, nowMillis)}</Text>
          <Text style={styles.fieldLabel}>How full does it feel now?</Text>
          <View style={styles.optionsRow}>
            {occupancyOptions.map((option) => (
              <Pressable key={option} onPress={() => void handleCheckout(option)} style={styles.optionButton}>
                <Text style={styles.optionText}>{option}%</Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            multiline
            onChangeText={setCheckoutNote}
            placeholder="Session note (optional)"
            placeholderTextColor="#8A7D6A"
            style={styles.noteInput}
            value={checkoutNote}
          />
        </View>
      ) : (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Start A Check-In</Text>
          <Text style={styles.muted}>
            {selectedLocation
              ? `Selected: ${selectedLocation.name}`
              : "Pick a spot from the map, then check in here."}
          </Text>
          <View style={styles.optionsRow}>
            {occupancyOptions.map((option) => (
              <Pressable
                key={option}
                disabled={!selectedLocationId}
                onPress={() => void handleCheckin(option)}
                style={({ pressed }) => [
                  styles.optionButton,
                  !selectedLocationId && styles.optionButtonDisabled,
                  pressed && styles.optionButtonPressed,
                ]}
              >
                <Text style={styles.optionText}>{option}%</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Study Group Session</Text>
        <Text style={styles.muted}>
          Create a live study session for your selected location or join one with a shared session ID.
        </Text>
        {studySession ? (
          <View style={styles.sessionSummary}>
            <Text style={styles.activeName}>{studySession.title}</Text>
            <Text style={styles.muted}>Session ID: {studySession.id}</Text>
            <Text style={styles.muted}>
              Participants: {studySession.participants}/{studySession.max_participants}
            </Text>
            <Text style={styles.muted}>Ends: {formatDateTime(studySession.ends_at)}</Text>
            <Text style={styles.fieldLabel}>Update current session usage</Text>
            <View style={styles.optionsRow}>
              {occupancyOptions.map((option) => (
                <Pressable
                  key={`session-usage-${option}`}
                  disabled={sessionSubmitting}
                  onPress={() => void handleUpdateStudySessionUsage(option)}
                  style={({ pressed }) => [
                    styles.optionButton,
                    sessionSubmitting && styles.optionButtonDisabled,
                    pressed && styles.optionButtonPressed,
                  ]}
                >
                  <Text style={styles.optionText}>{option}%</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.fieldLabel}>Leave this study session</Text>
            <View style={styles.optionsRow}>
              {occupancyOptions.map((option) => (
                <Pressable
                  key={`leave-session-${option}`}
                  disabled={sessionSubmitting}
                  onPress={() => void handleLeaveStudySession(option)}
                  style={({ pressed }) => [
                    styles.optionButton,
                    sessionSubmitting && styles.optionButtonDisabled,
                    pressed && styles.optionButtonPressed,
                  ]}
                >
                  <Text style={styles.optionText}>{option}%</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : (
          <>
            <TextInput
              onChangeText={setSessionTitle}
              placeholder={defaultSessionTitle}
              placeholderTextColor="#8A7D6A"
              style={styles.noteInput}
              value={sessionTitle}
            />
            <Text style={styles.fieldLabel}>Create a session with current usage</Text>
            <View style={styles.optionsRow}>
              {occupancyOptions.map((option) => (
                <Pressable
                  key={`create-session-${option}`}
                  disabled={!selectedLocationId || sessionSubmitting}
                  onPress={() => void handleCreateStudySession(option)}
                  style={({ pressed }) => [
                    styles.optionButton,
                    (!selectedLocationId || sessionSubmitting) && styles.optionButtonDisabled,
                    pressed && styles.optionButtonPressed,
                  ]}
                >
                  <Text style={styles.optionText}>{option}%</Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setJoinSessionId}
              placeholder="Paste session ID to join"
              placeholderTextColor="#8A7D6A"
              style={styles.idInput}
              value={joinSessionId}
            />
            <Pressable
              disabled={!joinSessionId.trim() || sessionSubmitting}
              onPress={() => void handleLoadStudySession()}
              style={({ pressed }) => [
                styles.loadButton,
                (!joinSessionId.trim() || sessionSubmitting) && styles.optionButtonDisabled,
                pressed && styles.optionButtonPressed,
              ]}
            >
              <Text style={styles.loadButtonText}>Load Session Details</Text>
            </Pressable>
            <Text style={styles.fieldLabel}>Join a session with current usage</Text>
            <View style={styles.optionsRow}>
              {occupancyOptions.map((option) => (
                <Pressable
                  key={`join-session-${option}`}
                  disabled={!joinSessionId.trim() || sessionSubmitting}
                  onPress={() => void handleJoinStudySession(option)}
                  style={({ pressed }) => [
                    styles.optionButton,
                    (!joinSessionId.trim() || sessionSubmitting) && styles.optionButtonDisabled,
                    pressed && styles.optionButtonPressed,
                  ]}
                >
                  <Text style={styles.optionText}>{option}%</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Session History</Text>
        {loading ? <Text style={styles.muted}>Loading check-ins...</Text> : null}
        {!loading && history.length === 0 ? (
          <Text style={styles.muted}>No previous sessions yet.</Text>
        ) : null}
        {history.map((item) => (
          <View key={item.id} style={styles.historyRow}>
            <Text style={styles.historyTitle}>{item.location_name}</Text>
            <Text style={styles.muted}>In: {formatDateTime(item.checked_in_at)}</Text>
            <Text style={styles.muted}>
              Out: {item.checked_out_at ? formatDateTime(item.checked_out_at) : "Still active"}
            </Text>
            <Text style={styles.muted}>
              Duration:{" "}
              {item.duration_minutes === null
                ? item.auto_timed_out
                  ? "Unavailable (auto-closed after 24h)"
                  : "Unavailable"
                : formatDurationMinutes(item.duration_minutes)}
            </Text>
            {item.note ? <Text style={styles.noteText}>Note: {item.note}</Text> : null}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 120,
    gap: 14,
  },
  heroCard: {
    backgroundColor: "#2F6B57",
    borderRadius: 24,
    padding: 16,
    gap: 8,
  },
  heroEyebrow: {
    color: "#D8F3E8",
    fontSize: 11,
    letterSpacing: 1.1,
    textTransform: "uppercase",
    fontWeight: "700",
  },
  heroTitle: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "800",
  },
  heroSubtitle: {
    color: "#E4F6EE",
    fontSize: 13,
    lineHeight: 18,
  },
  messageCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#d8cfba",
    backgroundColor: "rgba(253, 251, 244, 0.96)",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  messageText: {
    color: "#44543e",
    fontSize: 13,
    fontWeight: "700",
  },
  sessionSummary: {
    gap: 8,
    marginTop: 4,
  },
  sectionCard: {
    backgroundColor: "#FFFDF9",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E2D7C4",
    padding: 14,
    gap: 8,
  },
  sectionTitle: {
    color: "#2F4031",
    fontSize: 18,
    fontWeight: "800",
  },
  activeName: {
    color: "#314b30",
    fontSize: 16,
    fontWeight: "700",
  },
  muted: {
    color: "#6b6a59",
    fontSize: 12,
    fontWeight: "600",
  },
  timerText: {
    marginTop: 2,
    color: "#334226",
    fontSize: 18,
    fontWeight: "800",
  },
  fieldLabel: {
    marginTop: 4,
    color: "#4f5c42",
    fontSize: 12,
    fontWeight: "700",
  },
  optionsRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  optionButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#6d7a5a",
    backgroundColor: "#fdfbf4",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  optionButtonDisabled: {
    opacity: 0.5,
  },
  optionButtonPressed: {
    opacity: 0.8,
  },
  optionText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#334226",
  },
  noteInput: {
    minHeight: 76,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2D7C4",
    backgroundColor: "#fffaf1",
    color: "#2f3c2b",
    fontSize: 13,
    paddingHorizontal: 10,
    paddingVertical: 8,
    textAlignVertical: "top",
  },
  idInput: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2D7C4",
    backgroundColor: "#fffaf1",
    color: "#2f3c2b",
    fontSize: 13,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  loadButton: {
    alignSelf: "flex-start",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#6d7a5a",
    backgroundColor: "#eef4e7",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  loadButtonText: {
    color: "#334226",
    fontSize: 12,
    fontWeight: "700",
  },
  historyRow: {
    borderTopWidth: 1,
    borderTopColor: "#efe6d5",
    paddingTop: 10,
    gap: 3,
  },
  historyTitle: {
    color: "#2F4031",
    fontSize: 14,
    fontWeight: "700",
  },
  noteText: {
    color: "#4f5c42",
    fontSize: 12,
    fontWeight: "600",
  },
});
