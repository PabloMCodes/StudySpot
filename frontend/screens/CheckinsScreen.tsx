import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { checkoutCheckin, createCheckin, getMyCheckins } from "../services/checkinService";
import {
  createSession,
  endSession,
  getActiveSession,
  getMySessions,
  getSession,
  joinSession,
  leaveSession,
  startSession,
  updateSessionUsage,
} from "../services/sessionService";
import type { CrowdLabel } from "../types/checkin";
import type { PersonalSession, PersonalSessionsListResponse, StudySession } from "../types/session";
import type { Location, UserCoordinates } from "../types/location";

interface CheckinsScreenProps {
  accessToken: string | null;
  onAuthExpired: () => void;
  userCoordinates: UserCoordinates | null;
  preferredLocationId: string | null;
  onConsumePreferredLocation: () => void;
  locations: Location[];
}

const CROWD_OPTIONS: Array<{ label: string; value: CrowdLabel }> = [
  { label: "Empty", value: "empty" },
  { label: "Available", value: "available" },
  { label: "Busy", value: "busy" },
  { label: "Packed", value: "packed" },
];
const CHECKINS_REFRESH_MS = 30 * 1000;
const TRANSIENT_RETRY_DELAY_MS = 600;

function formatDateTime(isoValue: string): string {
  return new Date(isoValue).toLocaleString();
}

function formatDurationMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

function activeElapsedLabel(activeSession: PersonalSession, nowMillis: number): string {
  const startedMillis = new Date(activeSession.started_at).getTime();
  const elapsedSeconds = Math.max(0, Math.floor((nowMillis - startedMillis) / 1000));
  const hours = Math.floor(elapsedSeconds / 3600);
  const minutes = Math.floor((elapsedSeconds % 3600) / 60);
  const seconds = elapsedSeconds % 60;
  return `${hours}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
}

function crowdLabelToUsagePercent(label: CrowdLabel): 0 | 25 | 50 | 75 | 100 {
  switch (label) {
    case "empty":
      return 0;
    case "available":
      return 25;
    case "busy":
      return 75;
    case "packed":
      return 100;
    default:
      return 50;
  }
}

export function CheckinsScreen({
  accessToken,
  onAuthExpired,
  userCoordinates,
  preferredLocationId,
  onConsumePreferredLocation,
  locations,
}: CheckinsScreenProps) {
  const [sessionsData, setSessionsData] = useState<PersonalSessionsListResponse | null>(null);
  const [activeCheckinId, setActiveCheckinId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [nowMillis, setNowMillis] = useState(Date.now());
  const [startingSession, setStartingSession] = useState(false);
  const [endingSession, setEndingSession] = useState(false);

  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(preferredLocationId);
  const [topic, setTopic] = useState("");
  const [startNote, setStartNote] = useState("");
  const [startCrowdLabel, setStartCrowdLabel] = useState<CrowdLabel | null>(null);

  const [accomplishmentScore, setAccomplishmentScore] = useState<number>(7);
  const [endNote, setEndNote] = useState("");
  const [endCrowdLabel, setEndCrowdLabel] = useState<CrowdLabel | null>(null);
  const [studySession, setStudySession] = useState<StudySession | null>(null);
  const [sessionTitle, setSessionTitle] = useState("");
  const [joinSessionId, setJoinSessionId] = useState("");
  const [sessionSubmitting, setSessionSubmitting] = useState(false);

  const isUnauthorizedError = useCallback((message: string | null | undefined) => {
    const normalized = (message ?? "").toLowerCase();
    return normalized.includes("unauthorized") || normalized.includes("credential") || normalized.includes("token");
  }, []);

  const isTransientRequestError = useCallback((message: string | null | undefined) => {
    const normalized = (message ?? "").toLowerCase();
    return (
      normalized.includes("request failed") ||
      normalized.includes("network request failed") ||
      normalized.includes("timed out")
    );
  }, []);

  const wait = useCallback((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)), []);

  const selectedLocation = useMemo(
    () => locations.find((location) => location.id === selectedLocationId) ?? null,
    [locations, selectedLocationId],
  );

  const refreshAll = useCallback(async () => {
    if (!accessToken) {
      setSessionsData(null);
      setActiveCheckinId(null);
      return;
    }

    setLoading(true);
    let sessionsResponse = await getMySessions(accessToken);
    let checkinsResponse = await getMyCheckins(accessToken);

    if (
      isTransientRequestError(sessionsResponse.error) ||
      isTransientRequestError(checkinsResponse.error)
    ) {
      await wait(TRANSIENT_RETRY_DELAY_MS);
      if (isTransientRequestError(sessionsResponse.error)) {
        sessionsResponse = await getMySessions(accessToken);
      }
      if (isTransientRequestError(checkinsResponse.error)) {
        checkinsResponse = await getMyCheckins(accessToken);
      }
    }

    if (!sessionsResponse.success || !sessionsResponse.data) {
      if (isUnauthorizedError(sessionsResponse.error)) {
        onAuthExpired();
        setLoading(false);
        return;
      }
      setMessage("Couldn’t load sessions right now. Pull back in a moment.");
      setLoading(false);
      return;
    }

    if (!checkinsResponse.success && isUnauthorizedError(checkinsResponse.error)) {
      onAuthExpired();
      setLoading(false);
      return;
    }

    setSessionsData(sessionsResponse.data);
    setActiveCheckinId(checkinsResponse.data?.active_checkin?.id ?? null);
    setMessage(null);
    setLoading(false);
  }, [accessToken, isTransientRequestError, isUnauthorizedError, onAuthExpired, wait]);

  useEffect(() => {
    if (preferredLocationId) {
      setSelectedLocationId(preferredLocationId);
      onConsumePreferredLocation();
    }
  }, [onConsumePreferredLocation, preferredLocationId]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    const timer = setInterval(() => setNowMillis(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!accessToken) return;
    const refreshTimer = setInterval(() => {
      void refreshAll();
    }, CHECKINS_REFRESH_MS);
    return () => clearInterval(refreshTimer);
  }, [accessToken, refreshAll]);

  useEffect(() => {
    if (!accessToken) {
      setStudySession(null);
      setJoinSessionId("");
      return;
    }

    let isActive = true;
    const loadActiveSession = async () => {
      const response = await getActiveSession(accessToken);
      if (!isActive || !response.success) {
        return;
      }
      setStudySession(response.data ?? null);
      setJoinSessionId(response.data?.id ?? "");
    };

    void loadActiveSession();
    return () => {
      isActive = false;
    };
  }, [accessToken]);

  const activeSession = sessionsData?.active_session ?? null;
  const history = sessionsData?.history ?? [];
  const defaultSessionTitle = selectedLocation ? `${selectedLocation.name} Study Session` : "Study Session";

  const startStudySession = useCallback(async (forceWithLocation: boolean) => {
    if (!accessToken) {
      setMessage("Sign in to start a session.");
      return;
    }
    if (!topic.trim()) {
      setMessage("Add a topic first.");
      return;
    }

    const withLocation = forceWithLocation && Boolean(selectedLocationId);
    if (withLocation && !userCoordinates) {
      setMessage("Turn on location services for location sessions.");
      return;
    }
    if (withLocation && startCrowdLabel === null) {
      setMessage("Select how full it feels to start a location session.");
      return;
    }

    setStartingSession(true);
    if (withLocation && selectedLocationId && startCrowdLabel !== null && userCoordinates) {
      const checkinResponse = await createCheckin(accessToken, {
        location_id: selectedLocationId,
        crowd_label: startCrowdLabel,
        lat: userCoordinates.lat,
        lng: userCoordinates.lng,
        study_note: topic.trim(),
      });
      if (!checkinResponse.success) {
        if (isUnauthorizedError(checkinResponse.error)) {
          onAuthExpired();
          setStartingSession(false);
          return;
        }
        setMessage(checkinResponse.error ?? "Failed to start location check-in");
        setStartingSession(false);
        return;
      }
      setActiveCheckinId(checkinResponse.data?.checkin.id ?? null);
    } else {
      setActiveCheckinId(null);
    }

    const sessionResponse = await startSession(accessToken, {
      topic: topic.trim(),
      location_id: withLocation && selectedLocationId ? selectedLocationId : undefined,
      lat: withLocation && userCoordinates ? userCoordinates.lat : undefined,
      lng: withLocation && userCoordinates ? userCoordinates.lng : undefined,
      start_note: startNote.trim() ? startNote.trim() : undefined,
    });
    if (!sessionResponse.success) {
      if (isUnauthorizedError(sessionResponse.error)) {
        onAuthExpired();
        setStartingSession(false);
        return;
      }
      setMessage(sessionResponse.error ?? "Failed to start session");
      setStartingSession(false);
      return;
    }

    if (sessionResponse.data?.active_session) {
      setSessionsData((previous) => ({
        active_session: sessionResponse.data?.active_session ?? null,
        history: previous?.history ?? [],
      }));
    }

    setTopic("");
    setStartNote("");
    setStartCrowdLabel(null);
    setMessage(withLocation ? "Started location study session." : "Started study session.");
    setStartingSession(false);
    void refreshAll();
  }, [accessToken, refreshAll, selectedLocationId, startCrowdLabel, startNote, topic, userCoordinates]);

  const endStudySession = useCallback(async () => {
    if (!accessToken) {
      setMessage("Sign in to end a session.");
      return;
    }
    if (!activeSession) {
      setMessage("No active session found.");
      return;
    }

    setEndingSession(true);
    if (activeSession.is_location_verified) {
      if (!userCoordinates) {
        setMessage("Turn on location services to end this location session.");
        setEndingSession(false);
        return;
      }
      if (!activeCheckinId) {
        setMessage("Active location check-in not found.");
        setEndingSession(false);
        return;
      }
      if (endCrowdLabel === null) {
        setMessage("Select how full it feels before ending.");
        setEndingSession(false);
        return;
      }

      const checkoutResponse = await checkoutCheckin(accessToken, {
        checkin_id: activeCheckinId,
        crowd_label: endCrowdLabel,
        lat: userCoordinates.lat,
        lng: userCoordinates.lng,
        note: endNote.trim() ? endNote.trim() : undefined,
      });
      if (!checkoutResponse.success) {
        if (isUnauthorizedError(checkoutResponse.error)) {
          onAuthExpired();
          setEndingSession(false);
          return;
        }
        setMessage(checkoutResponse.error ?? "Failed to check out");
        setEndingSession(false);
        return;
      }
    }

    const endResponse = await endSession(accessToken, {
      session_id: activeSession.id,
      accomplishment_score: accomplishmentScore,
      end_note: endNote.trim() ? endNote.trim() : undefined,
    });
    if (!endResponse.success || !endResponse.data) {
      if (isUnauthorizedError(endResponse.error)) {
        onAuthExpired();
        setEndingSession(false);
        return;
      }
      setMessage(endResponse.error ?? "Failed to end session");
      setEndingSession(false);
      return;
    }

    setSessionsData(endResponse.data);
    setEndNote("");
    setEndCrowdLabel(null);
    setAccomplishmentScore(7);
    setMessage("Study session saved.");
    setEndingSession(false);
    void refreshAll();
  }, [accessToken, accomplishmentScore, activeCheckinId, activeSession, endCrowdLabel, endNote, isUnauthorizedError, onAuthExpired, userCoordinates, refreshAll]);

  const handleCreateStudySession = useCallback(
    async (crowdLabel: CrowdLabel) => {
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
          current_usage_percent: crowdLabelToUsagePercent(crowdLabel),
        });
        if (!response.success || !response.data) {
          setMessage(response.error ?? "Failed to create study session");
          return;
        }
        setStudySession(response.data);
        setJoinSessionId(response.data.id);
        setSessionTitle("");
        setMessage("Study group session created.");
      } finally {
        setSessionSubmitting(false);
      }
    },
    [accessToken, defaultSessionTitle, selectedLocationId, sessionTitle],
  );

  const handleJoinStudySession = useCallback(
    async (crowdLabel: CrowdLabel) => {
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
          current_usage_percent: crowdLabelToUsagePercent(crowdLabel),
        });
        if (!response.success) {
          setMessage(response.error ?? "Failed to join study session");
          return;
        }
        const sessionResponse = await getSession(accessToken, trimmedSessionId);
        if (!sessionResponse.success || !sessionResponse.data) {
          setMessage(sessionResponse.error ?? "Joined session, but could not load details.");
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
    async (crowdLabel: CrowdLabel) => {
      if (!accessToken || !studySession) {
        setMessage("Create or join a study session first.");
        return;
      }
      setSessionSubmitting(true);
      try {
        const response = await updateSessionUsage(accessToken, studySession.id, {
          current_usage_percent: crowdLabelToUsagePercent(crowdLabel),
        });
        if (!response.success || !response.data) {
          setMessage(response.error ?? "Failed to update study session usage");
          return;
        }
        setStudySession(response.data);
        setMessage("Study session usage updated.");
      } finally {
        setSessionSubmitting(false);
      }
    },
    [accessToken, studySession],
  );

  const handleLeaveStudySession = useCallback(
    async (crowdLabel: CrowdLabel) => {
      if (!accessToken || !studySession) {
        setMessage("No active study session to leave.");
        return;
      }
      setSessionSubmitting(true);
      try {
        const response = await leaveSession(accessToken, studySession.id, {
          current_usage_percent: crowdLabelToUsagePercent(crowdLabel),
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
        <Text style={styles.heroEyebrow}>Study Session</Text>
        <Text style={styles.heroTitle}>One seamless flow</Text>
        <Text style={styles.heroSubtitle}>
          Start from anywhere. Add a location only when you're physically there.
        </Text>
      </View>

      {message ? (
        <View style={styles.messageCard}>
          <Text style={styles.messageText}>{message}</Text>
        </View>
      ) : null}

      {activeSession ? (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Active Study Session</Text>
          <Text style={styles.activeName}>
            {activeSession.location_name ? activeSession.location_name : "No location"}
          </Text>
          <Text style={styles.muted}>Started {formatDateTime(activeSession.started_at)}</Text>
          <Text style={styles.timerText}>{activeElapsedLabel(activeSession, nowMillis)}</Text>
          <Text style={styles.noteText}>Topic: {activeSession.topic}</Text>
          {activeSession.start_note ? <Text style={styles.noteText}>Start note: {activeSession.start_note}</Text> : null}

          {activeSession.is_location_verified ? (
            <>
              <Text style={styles.fieldLabel}>How easy is it to find a seat?</Text>
              <View style={styles.optionsRow}>
                {CROWD_OPTIONS.map((value) => (
                  <Pressable
                    key={value.value}
                    onPress={() => setEndCrowdLabel(value.value)}
                    style={[
                      styles.optionButton,
                      endCrowdLabel === value.value && styles.optionButtonSelected,
                    ]}
                  >
                    <Text style={styles.optionText}>{value.label}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}

          <Text style={styles.fieldLabel}>How accomplished did you feel? (1-10)</Text>
          <View style={styles.optionsRow}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((value) => (
              <Pressable
                key={value}
                onPress={() => setAccomplishmentScore(value)}
                style={[
                  styles.optionButton,
                  accomplishmentScore === value && styles.optionButtonSelected,
                ]}
              >
                <Text style={styles.optionText}>{value}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            multiline
            onChangeText={setEndNote}
            placeholder="Additional comments (optional)"
            placeholderTextColor="#8A7D6A"
            style={styles.noteInput}
            value={endNote}
          />
          <Pressable
            disabled={endingSession}
            onPress={() => void endStudySession()}
            style={[styles.primaryButton, endingSession && styles.optionButtonDisabled]}
          >
            <Text style={styles.primaryButtonText}>{endingSession ? "Ending..." : "End Study Session"}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Start Study Session</Text>
          <TextInput
            onChangeText={setTopic}
            placeholder="Topic / what you worked on"
            placeholderTextColor="#8A7D6A"
            style={styles.singleLineInput}
            value={topic}
          />
          <TextInput
            multiline
            onChangeText={setStartNote}
            placeholder="Any start note (optional)"
            placeholderTextColor="#8A7D6A"
            style={styles.noteInput}
            value={startNote}
          />

          <Text style={styles.muted}>
            {selectedLocation ? `Using location: ${selectedLocation.name}` : "No location selected (home session)."}
          </Text>
          {selectedLocation ? (
            <>
              <Text style={styles.fieldLabel}>How easy is it to find a seat?</Text>
              <View style={styles.optionsRow}>
                {CROWD_OPTIONS.map((value) => (
                  <Pressable
                    key={value.value}
                    onPress={() => setStartCrowdLabel(value.value)}
                    style={[
                      styles.optionButton,
                      startCrowdLabel === value.value && styles.optionButtonSelected,
                    ]}
                  >
                    <Text style={styles.optionText}>{value.label}</Text>
                  </Pressable>
                ))}
              </View>
              <Pressable onPress={() => setSelectedLocationId(null)} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Use No Location</Text>
              </Pressable>
            </>
          ) : null}

          <View style={styles.optionsRow}>
            <Pressable
              disabled={startingSession}
              onPress={() => void startStudySession(false)}
              style={[styles.primaryButton, startingSession && styles.optionButtonDisabled]}
            >
              <Text style={styles.primaryButtonText}>{startingSession ? "Starting..." : "Start Without Location"}</Text>
            </Pressable>
            <Pressable
              disabled={startingSession || !selectedLocation}
              onPress={() => void startStudySession(true)}
              style={[
                styles.secondaryButton,
                (startingSession || !selectedLocation) && styles.optionButtonDisabled,
              ]}
            >
              <Text style={styles.secondaryButtonText}>Start With Selected Location</Text>
            </Pressable>
          </View>
        </View>
      )}

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Study Group Session</Text>
        <Text style={styles.muted}>
          Create a group session for your selected location, or load one with a session ID.
        </Text>
        {studySession ? (
          <>
            <Text style={styles.activeName}>{studySession.title}</Text>
            <Text style={styles.muted}>Session ID: {studySession.id}</Text>
            <Text style={styles.muted}>
              Participants: {studySession.participants}/{studySession.max_participants}
            </Text>
            <Text style={styles.muted}>Ends: {formatDateTime(studySession.ends_at)}</Text>
            <Text style={styles.fieldLabel}>Update usage</Text>
            <View style={styles.optionsRow}>
              {CROWD_OPTIONS.map((value) => (
                <Pressable
                  key={`session-usage-${value.value}`}
                  disabled={sessionSubmitting}
                  onPress={() => void handleUpdateStudySessionUsage(value.value)}
                  style={[styles.optionButton, sessionSubmitting && styles.optionButtonDisabled]}
                >
                  <Text style={styles.optionText}>{value.label}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.fieldLabel}>Leave session</Text>
            <View style={styles.optionsRow}>
              {CROWD_OPTIONS.map((value) => (
                <Pressable
                  key={`session-leave-${value.value}`}
                  disabled={sessionSubmitting}
                  onPress={() => void handleLeaveStudySession(value.value)}
                  style={[styles.optionButton, sessionSubmitting && styles.optionButtonDisabled]}
                >
                  <Text style={styles.optionText}>{value.label}</Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : (
          <>
            <TextInput
              onChangeText={setSessionTitle}
              placeholder={defaultSessionTitle}
              placeholderTextColor="#8A7D6A"
              style={styles.singleLineInput}
              value={sessionTitle}
            />
            <Text style={styles.fieldLabel}>Create session with current usage</Text>
            <View style={styles.optionsRow}>
              {CROWD_OPTIONS.map((value) => (
                <Pressable
                  key={`session-create-${value.value}`}
                  disabled={!selectedLocationId || sessionSubmitting}
                  onPress={() => void handleCreateStudySession(value.value)}
                  style={[
                    styles.optionButton,
                    (!selectedLocationId || sessionSubmitting) && styles.optionButtonDisabled,
                  ]}
                >
                  <Text style={styles.optionText}>{value.label}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setJoinSessionId}
              placeholder="Paste session ID"
              placeholderTextColor="#8A7D6A"
              style={styles.singleLineInput}
              value={joinSessionId}
            />
            <Pressable
              disabled={!joinSessionId.trim() || sessionSubmitting}
              onPress={() => void handleLoadStudySession()}
              style={[styles.secondaryButton, (!joinSessionId.trim() || sessionSubmitting) && styles.optionButtonDisabled]}
            >
              <Text style={styles.secondaryButtonText}>Load Session Details</Text>
            </Pressable>
            <Text style={styles.fieldLabel}>Join session with current usage</Text>
            <View style={styles.optionsRow}>
              {CROWD_OPTIONS.map((value) => (
                <Pressable
                  key={`session-join-${value.value}`}
                  disabled={!joinSessionId.trim() || sessionSubmitting}
                  onPress={() => void handleJoinStudySession(value.value)}
                  style={[
                    styles.optionButton,
                    (!joinSessionId.trim() || sessionSubmitting) && styles.optionButtonDisabled,
                  ]}
                >
                  <Text style={styles.optionText}>{value.label}</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Study History</Text>
        {loading ? <Text style={styles.muted}>Loading sessions...</Text> : null}
        {!loading && history.length === 0 ? <Text style={styles.muted}>No sessions yet.</Text> : null}
        {history.map((item) => (
          <View key={item.id} style={styles.historyCard}>
            <Text style={styles.historyTitle}>{item.location_name ?? "No location"}</Text>
            <Text style={styles.historyTopic}>{item.topic}</Text>

            <View style={styles.historyStatRow}>
              <View style={styles.historyStatChip}>
                <Text style={styles.historyStatText}>
                  {item.duration_minutes === null
                    ? item.auto_timed_out
                      ? "Duration: auto-closed"
                      : "Duration: unavailable"
                    : `Duration: ${formatDurationMinutes(item.duration_minutes)}`}
                </Text>
              </View>
              <View style={styles.historyStatChip}>
                <Text style={styles.historyStatText}>
                  {item.accomplishment_score !== null ? `Accomplishment: ${item.accomplishment_score}/10` : "Accomplishment: N/A"}
                </Text>
              </View>
            </View>

            <View style={styles.historyTimeBlock}>
              <Text style={styles.historyTimeText}>Started: {formatDateTime(item.started_at)}</Text>
              <Text style={styles.historyTimeText}>Ended: {item.ended_at ? formatDateTime(item.ended_at) : "Still active"}</Text>
            </View>

            {item.start_note ? (
              <View style={styles.historyNoteBlock}>
                <Text style={styles.historyNoteLabel}>Start note</Text>
                <Text style={styles.noteText}>{item.start_note}</Text>
              </View>
            ) : null}
            {item.end_note ? (
              <View style={styles.historyNoteBlock}>
                <Text style={styles.historyNoteLabel}>End note</Text>
                <Text style={styles.noteText}>{item.end_note}</Text>
              </View>
            ) : null}
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
  singleLineInput: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2D7C4",
    backgroundColor: "#fffaf1",
    color: "#2f3c2b",
    fontSize: 13,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  optionButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#6d7a5a",
    backgroundColor: "#fdfbf4",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  optionButtonSelected: {
    borderColor: "#2f5634",
    backgroundColor: "#eaf5eb",
  },
  optionButtonDisabled: {
    opacity: 0.6,
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
  primaryButton: {
    alignSelf: "flex-start",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2f5634",
    backgroundColor: "#2f5634",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  primaryButtonText: {
    color: "#f5f8f1",
    fontSize: 12,
    fontWeight: "700",
  },
  secondaryButton: {
    alignSelf: "flex-start",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#6d7a5a",
    backgroundColor: "#fdfbf4",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  secondaryButtonText: {
    color: "#334226",
    fontSize: 12,
    fontWeight: "700",
  },
  historyCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e7dcc9",
    backgroundColor: "#fffaf2",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
  historyTitle: {
    color: "#2F4031",
    fontSize: 14,
    fontWeight: "800",
  },
  historyTopic: {
    color: "#52624a",
    fontSize: 12,
    fontWeight: "700",
  },
  historyStatRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  historyStatChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#d7ccb6",
    backgroundColor: "#f6efe2",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  historyStatText: {
    color: "#4c5d45",
    fontSize: 11,
    fontWeight: "700",
  },
  historyTimeBlock: {
    borderRadius: 10,
    backgroundColor: "#f4eee2",
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 2,
  },
  historyTimeText: {
    color: "#5b6653",
    fontSize: 11,
    fontWeight: "600",
  },
  historyNoteBlock: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5dac5",
    backgroundColor: "#fdf8f0",
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 2,
  },
  historyNoteLabel: {
    color: "#52624a",
    fontSize: 11,
    fontWeight: "800",
  },
  noteText: {
    color: "#4f5c42",
    fontSize: 12,
    fontWeight: "600",
  },
});
