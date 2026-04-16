import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { EndSessionModal } from "../components/checkins/EndSessionModal";
import { SessionInput } from "../components/checkins/SessionInput";
import { StartSessionCard } from "../components/checkins/StartSessionCard";
import { StudyHistoryList } from "../components/checkins/StudyHistoryList";
import { checkoutCheckin, createCheckin, getMyCheckins } from "../services/checkinService";
import { uploadPhoto } from "../services/photoService";
import {
  completeSession,
  deleteSessionHistory,
  getMySessions,
  startSession,
  updateSessionHistory,
} from "../services/sessionService";
import type { CrowdLabel, MyCheckinSession } from "../types/checkin";
import type { PersonalSession, PersonalSessionsListResponse } from "../types/session";
import type { Location, UserCoordinates } from "../types/location";

interface CheckinsScreenProps {
  accessToken: string | null;
  onAuthExpired: () => void;
  userCoordinates: UserCoordinates | null;
  preferredLocationId: string | null;
  onConsumePreferredLocation: () => void;
  locations: Location[];
}

const CHECKINS_REFRESH_MS = 30 * 1000;
const TRANSIENT_RETRY_DELAY_MS = 600;

function formatDateTime(isoValue: string): string {
  return new Date(isoValue).toLocaleString();
}

function activeElapsedLabel(activeSession: PersonalSession, nowMillis: number): string {
  const startedMillis = new Date(activeSession.started_at).getTime();
  const elapsedSeconds = Math.max(0, Math.floor((nowMillis - startedMillis) / 1000));
  const hours = Math.floor(elapsedSeconds / 3600);
  const minutes = Math.floor((elapsedSeconds % 3600) / 60);
  const seconds = elapsedSeconds % 60;
  return `${hours}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
}

function isUnauthorizedError(message: string | null | undefined): boolean {
  const normalized = (message ?? "").toLowerCase();
  return normalized.includes("unauthorized") || normalized.includes("credential") || normalized.includes("token");
}

function focusToAccomplishment(focusLevel: number | null): number | undefined {
  if (focusLevel === null) return undefined;
  if (focusLevel <= 1) return 3;
  if (focusLevel === 2) return 6;
  if (focusLevel === 3) return 8;
  return 10;
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
  const [activeCheckin, setActiveCheckin] = useState<MyCheckinSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [nowMillis, setNowMillis] = useState(Date.now());
  const [startingSession, setStartingSession] = useState(false);
  const [completingSession, setCompletingSession] = useState(false);
  const [editingHistorySessionId, setEditingHistorySessionId] = useState<string | null>(null);
  const [deletingHistorySessionId, setDeletingHistorySessionId] = useState<string | null>(null);
  const hasLoadedSessionsOnceRef = useRef(false);

  const [isStartFormOpen, setIsStartFormOpen] = useState(false);
  const [useCurrentLocation, setUseCurrentLocation] = useState(false);
  const [checkinCrowdLabel, setCheckinCrowdLabel] = useState<CrowdLabel | null>(null);
  const [topic, setTopic] = useState("");
  const [startNote, setStartNote] = useState("");
  const [startNoteExpanded, setStartNoteExpanded] = useState(false);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(preferredLocationId);

  const [isEndModalOpen, setIsEndModalOpen] = useState(false);

  const wait = useCallback((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)), []);

  const selectedLocation = useMemo(
    () => locations.find((location) => location.id === selectedLocationId) ?? null,
    [locations, selectedLocationId],
  );

  const locationLabel = selectedLocation ? selectedLocation.name : "No location selected";

  const refreshAll = useCallback(async (options?: { silent?: boolean }) => {
    if (!accessToken) {
      setSessionsData(null);
      setActiveCheckinId(null);
      setActiveCheckin(null);
      return;
    }

    const silent = options?.silent ?? false;
    const shouldShowLoading = !silent && !hasLoadedSessionsOnceRef.current;
    if (shouldShowLoading) {
      setLoading(true);
    }
    let sessionsResponse = await getMySessions(accessToken);
    let checkinsResponse = await getMyCheckins(accessToken);

    const transient = (value: string | null | undefined) => {
      const normalized = (value ?? "").toLowerCase();
      return (
        normalized.includes("request failed") ||
        normalized.includes("network request failed") ||
        normalized.includes("timed out")
      );
    };

    if (transient(sessionsResponse.error) || transient(checkinsResponse.error)) {
      await wait(TRANSIENT_RETRY_DELAY_MS);
      if (transient(sessionsResponse.error)) {
        sessionsResponse = await getMySessions(accessToken);
      }
      if (transient(checkinsResponse.error)) {
        checkinsResponse = await getMyCheckins(accessToken);
      }
    }

    if (!sessionsResponse.success || !sessionsResponse.data) {
      if (isUnauthorizedError(sessionsResponse.error)) {
        onAuthExpired();
      } else if (!silent) {
        setMessage("Couldn’t load sessions right now. Pull back in a moment.");
      }
      if (shouldShowLoading) {
        setLoading(false);
      }
      return;
    }

    if (!checkinsResponse.success && isUnauthorizedError(checkinsResponse.error)) {
      onAuthExpired();
      if (shouldShowLoading) {
        setLoading(false);
      }
      return;
    }

    setSessionsData(sessionsResponse.data);
    setActiveCheckinId(checkinsResponse.data?.active_checkin?.id ?? null);
    setActiveCheckin(checkinsResponse.data?.active_checkin ?? null);
    if (!silent) {
      setMessage(null);
    }
    hasLoadedSessionsOnceRef.current = true;
    if (shouldShowLoading) {
      setLoading(false);
    }
  }, [accessToken, onAuthExpired, wait]);

  useEffect(() => {
    if (preferredLocationId) {
      setSelectedLocationId(preferredLocationId);
      onConsumePreferredLocation();
      setUseCurrentLocation(true);
    }
  }, [onConsumePreferredLocation, preferredLocationId]);

  useEffect(() => {
    void refreshAll({ silent: false });
  }, [refreshAll]);

  useEffect(() => {
    const timer = setInterval(() => setNowMillis(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!accessToken) return;
    const refreshTimer = setInterval(() => {
      void refreshAll({ silent: true });
    }, CHECKINS_REFRESH_MS);
    return () => clearInterval(refreshTimer);
  }, [accessToken, refreshAll]);

  const activeSession = sessionsData?.active_session ?? null;
  const history = sessionsData?.history ?? [];

  const handleStartSession = useCallback(async () => {
    if (!accessToken) {
      setMessage("Sign in to start a session.");
      return;
    }
    if (!topic.trim()) {
      setMessage("Add a topic first.");
      return;
    }

    const withLocation = useCurrentLocation;
    if (withLocation) {
      if (!selectedLocationId) {
        setMessage("Select a spot first from the map.");
        return;
      }
      if (!userCoordinates) {
        setMessage("Turn on location services for location sessions.");
        return;
      }
      if (!checkinCrowdLabel) {
        setMessage("How full does it feel? Select Empty, Available, Busy, or Packed.");
        return;
      }
    }
    const selectedCheckinCrowdLabel = withLocation ? checkinCrowdLabel : null;

    setStartingSession(true);

    if (withLocation && selectedLocationId && userCoordinates && selectedCheckinCrowdLabel) {
      const checkinResponse = await createCheckin(accessToken, {
        location_id: selectedLocationId,
        crowd_label: selectedCheckinCrowdLabel,
        lat: userCoordinates.lat,
        lng: userCoordinates.lng,
        study_note: startNote.trim() ? startNote.trim() : undefined,
      });
      if (!checkinResponse.success) {
        if (isUnauthorizedError(checkinResponse.error)) {
          onAuthExpired();
        } else {
          setMessage(checkinResponse.error ?? "Failed to start location check-in");
        }
        setStartingSession(false);
        return;
      }
      setActiveCheckinId(checkinResponse.data?.checkin.id ?? null);
      setActiveCheckin({
        id: checkinResponse.data?.checkin.id ?? "",
        location_id: selectedLocationId,
        location_name: selectedLocation?.name ?? "Selected location",
        location_address: selectedLocation?.address ?? null,
        checkin_crowd_label: selectedCheckinCrowdLabel,
        checkout_crowd_label: null,
        study_note: startNote.trim() ? startNote.trim() : null,
        checkout_note: null,
        checked_in_at: checkinResponse.data?.checkin.created_at ?? new Date().toISOString(),
        checked_out_at: null,
        duration_minutes: null,
        is_active: true,
        auto_timed_out: false,
      });
    } else {
      setActiveCheckinId(null);
      setActiveCheckin(null);
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
      } else {
        setMessage(sessionResponse.error ?? "Failed to start session");
      }
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
    setStartNoteExpanded(false);
    setIsStartFormOpen(false);
    setUseCurrentLocation(false);
    setCheckinCrowdLabel(null);
    setMessage("Study session started.");
    setStartingSession(false);
    void refreshAll();
  }, [
    accessToken,
    onAuthExpired,
    refreshAll,
    selectedLocationId,
    startNote,
    topic,
    useCurrentLocation,
    checkinCrowdLabel,
    userCoordinates,
  ]);

  const handleCompleteSession = useCallback(
    async (payload: {
      rating: number | null;
      focusLevel: number | null;
      note: string;
      photoUri: string | null;
      checkoutCrowdLabel: CrowdLabel | null;
    }) => {
      if (!accessToken || !activeSession) {
        return;
      }

      setCompletingSession(true);

      let uploadedImageUrl: string | undefined;
      if (payload.photoUri) {
        const uploadResponse = await uploadPhoto(accessToken, payload.photoUri);
        if (!uploadResponse.success || !uploadResponse.data?.image_url) {
          setMessage(uploadResponse.error ?? "Photo upload failed.");
          setCompletingSession(false);
          return;
        }
        uploadedImageUrl = uploadResponse.data.image_url;
      }

      if (activeSession.is_location_verified && activeCheckinId && userCoordinates) {
        const checkoutResponse = await checkoutCheckin(accessToken, {
          checkin_id: activeCheckinId,
          crowd_label: payload.checkoutCrowdLabel ?? undefined,
          lat: userCoordinates.lat,
          lng: userCoordinates.lng,
          note: payload.note.trim() ? payload.note.trim() : undefined,
        });
        if (!checkoutResponse.success) {
          if (isUnauthorizedError(checkoutResponse.error)) {
            onAuthExpired();
          } else {
            setMessage(checkoutResponse.error ?? "Failed to check out");
          }
          setCompletingSession(false);
          return;
        }
        setActiveCheckinId(null);
        setActiveCheckin(null);
      }

      const completeResponse = await completeSession(accessToken, activeSession.id, {
        rating: payload.rating ?? undefined,
        focus_level: payload.focusLevel ?? undefined,
        accomplishment_score: focusToAccomplishment(payload.focusLevel),
        note: payload.note.trim() ? payload.note.trim() : undefined,
        image_url: uploadedImageUrl,
      });

      if (!completeResponse.success || !completeResponse.data) {
        if (isUnauthorizedError(completeResponse.error)) {
          onAuthExpired();
        } else {
          setMessage(completeResponse.error ?? "Failed to complete session");
        }
        setCompletingSession(false);
        return;
      }

      setSessionsData(completeResponse.data);
      setIsEndModalOpen(false);
      setMessage("Session completed.");
      setCompletingSession(false);
      void refreshAll();
    },
    [accessToken, activeCheckinId, activeSession, onAuthExpired, refreshAll, userCoordinates],
  );

  const handleCheckoutOnly = useCallback(async () => {
    if (!accessToken || !activeCheckinId) {
      return;
    }
    if (!userCoordinates) {
      setMessage("Turn on location services to check out.");
      return;
    }
    const response = await checkoutCheckin(accessToken, {
      checkin_id: activeCheckinId,
      lat: userCoordinates.lat,
      lng: userCoordinates.lng,
    });
    if (!response.success) {
      if (isUnauthorizedError(response.error)) {
        onAuthExpired();
      } else {
        setMessage(response.error ?? "Failed to check out");
      }
      return;
    }
    setActiveCheckinId(null);
    setActiveCheckin(null);
    setMessage("Checked out successfully.");
    void refreshAll();
  }, [accessToken, activeCheckinId, onAuthExpired, refreshAll, userCoordinates]);

  const handleEditHistory = useCallback(
    async (
      sessionId: string,
      payload: {
        topic?: string;
        start_note?: string;
        end_note?: string;
        rating?: number;
        focus_level?: number;
        accomplishment_score?: number;
        add_photo_uris?: string[];
        remove_photo_urls?: string[];
      },
    ) => {
      if (!accessToken) return;
      setEditingHistorySessionId(sessionId);
      const uploadedPhotoUrls: string[] = [];
      if (payload.add_photo_uris?.length) {
        for (const localUri of payload.add_photo_uris) {
          const uploadResponse = await uploadPhoto(accessToken, localUri);
          if (!uploadResponse.success || !uploadResponse.data?.image_url) {
            if (isUnauthorizedError(uploadResponse.error)) {
              onAuthExpired();
            } else {
              setMessage(uploadResponse.error ?? "Photo upload failed.");
            }
            setEditingHistorySessionId(null);
            return;
          }
          uploadedPhotoUrls.push(uploadResponse.data.image_url);
        }
      }

      if (
        !payload.topic &&
        payload.start_note === undefined &&
        payload.end_note === undefined &&
        payload.rating === undefined &&
        payload.focus_level === undefined &&
        payload.accomplishment_score === undefined &&
        uploadedPhotoUrls.length === 0 &&
        (!payload.remove_photo_urls || payload.remove_photo_urls.length === 0)
      ) {
        setEditingHistorySessionId(null);
        return;
      }
      const response = await updateSessionHistory(accessToken, sessionId, {
        ...(payload.topic !== undefined ? { topic: payload.topic } : {}),
        ...(payload.start_note !== undefined ? { start_note: payload.start_note } : {}),
        ...(payload.end_note !== undefined ? { end_note: payload.end_note } : {}),
        ...(payload.rating !== undefined ? { rating: payload.rating } : {}),
        ...(payload.focus_level !== undefined ? { focus_level: payload.focus_level } : {}),
        ...(payload.accomplishment_score !== undefined
          ? { accomplishment_score: payload.accomplishment_score }
          : {}),
        ...(uploadedPhotoUrls.length ? { add_photo_urls: uploadedPhotoUrls } : {}),
        ...(payload.remove_photo_urls?.length ? { remove_photo_urls: payload.remove_photo_urls } : {}),
      });
      if (!response.success || !response.data) {
        if (isUnauthorizedError(response.error)) {
          onAuthExpired();
        } else {
          setMessage(response.error ?? "Failed to update history item");
        }
        setEditingHistorySessionId(null);
        return;
      }
      setSessionsData(response.data);
      setMessage("History updated.");
      setEditingHistorySessionId(null);
    },
    [accessToken, onAuthExpired],
  );

  const handleDeleteHistory = useCallback(
    async (sessionId: string) => {
      if (!accessToken) return;
      setDeletingHistorySessionId(sessionId);
      const response = await deleteSessionHistory(accessToken, sessionId);
      if (!response.success || !response.data) {
        if (isUnauthorizedError(response.error)) {
          onAuthExpired();
        } else {
          setMessage(response.error ?? "Failed to delete history item");
        }
        setDeletingHistorySessionId(null);
        return;
      }
      setSessionsData(response.data);
      setMessage("History item deleted.");
      setDeletingHistorySessionId(null);
    },
    [accessToken, onAuthExpired],
  );

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {message ? (
        <View style={styles.messageCard}>
          <Text style={styles.messageText}>{message}</Text>
        </View>
      ) : null}

      {activeCheckin && !activeSession ? (
        <View style={styles.activeCard}>
          <Text style={styles.activeTitle}>Active Check-In</Text>
          <Text style={styles.activeTopic}>{activeCheckin.location_name}</Text>
          <Text style={styles.activeMeta}>Checked in {formatDateTime(activeCheckin.checked_in_at)}</Text>
          <Pressable onPress={() => void handleCheckoutOnly()} style={styles.endButton}>
            <Text style={styles.endButtonText}>Check Out</Text>
          </Pressable>
        </View>
      ) : null}

      {!activeSession ? (
        <>
          <StartSessionCard
            disabled={startingSession}
            locationLabel={useCurrentLocation ? locationLabel : "No location selected"}
            onStartPress={() => setIsStartFormOpen(true)}
          />
          {isStartFormOpen ? (
            <SessionInput
              note={startNote}
              noteExpanded={startNoteExpanded}
              onCancel={() => setIsStartFormOpen(false)}
              onNoteChange={setStartNote}
              onSubmit={() => void handleStartSession()}
              onToggleNoteExpanded={() => setStartNoteExpanded((prev) => !prev)}
              onToggleUseCurrentLocation={() => setUseCurrentLocation((prev) => !prev)}
              onTopicChange={setTopic}
              checkinCrowdLabel={checkinCrowdLabel}
              onCheckinCrowdLabelChange={setCheckinCrowdLabel}
              selectedLocationName={selectedLocation?.name ?? null}
              submitting={startingSession}
              topic={topic}
              useCurrentLocation={useCurrentLocation}
            />
          ) : null}
        </>
      ) : (
        <View style={styles.activeCard}>
          <Text style={styles.activeTitle}>Active Session</Text>
          <Text style={styles.activeTopic}>{activeSession.topic}</Text>
          <Text style={styles.activeMeta}>{activeSession.location_name ?? "No location"}</Text>
          <Text style={styles.activeMeta}>Started {formatDateTime(activeSession.started_at)}</Text>
          <Text style={styles.timerText}>{activeElapsedLabel(activeSession, nowMillis)}</Text>

          <Pressable onPress={() => setIsEndModalOpen(true)} style={styles.endButton}>
            <Text style={styles.endButtonText}>End Session</Text>
          </Pressable>
        </View>
      )}

      <StudyHistoryList
        deletingSessionId={deletingHistorySessionId}
        editingSessionId={editingHistorySessionId}
        history={history}
        loading={loading}
        onDeleteHistory={(sessionId) => void handleDeleteHistory(sessionId)}
        onEditHistory={(sessionId, payload) => void handleEditHistory(sessionId, payload)}
      />

      <EndSessionModal
        loading={completingSession}
        onClose={() => setIsEndModalOpen(false)}
        onSubmit={(payload) => void handleCompleteSession(payload)}
        visible={isEndModalOpen}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 120,
    gap: 18,
    backgroundColor: "#f4efe2",
  },
  messageCard: {
    borderRadius: 12,
    backgroundColor: "#fff9ef",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  messageText: {
    color: "#44543e",
    fontSize: 13,
    fontWeight: "700",
  },
  activeCard: {
    backgroundColor: "#fffdf9",
    borderRadius: 22,
    padding: 14,
    gap: 10,
    shadowColor: "#1f2b1f",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  activeTitle: {
    color: "#294129",
    fontSize: 16,
    fontWeight: "800",
  },
  activeTopic: {
    color: "#2f3c2b",
    fontSize: 15,
    fontWeight: "700",
  },
  activeMeta: {
    color: "#6b6a59",
    fontSize: 12,
    fontWeight: "600",
  },
  timerText: {
    color: "#2f6b57",
    fontSize: 20,
    fontWeight: "800",
  },
  endButton: {
    minHeight: 50,
    borderRadius: 12,
    backgroundColor: "#2f6b57",
    alignItems: "center",
    justifyContent: "center",
  },
  endButtonText: {
    color: "#f5fbf7",
    fontSize: 15,
    fontWeight: "800",
  },
});
