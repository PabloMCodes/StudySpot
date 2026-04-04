import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { checkoutCheckin, createCheckin, getMyCheckins } from "../services/checkinService";
import type {
  MyCheckinSession,
  MyCheckinsResponse,
  OccupancyPercent,
} from "../types/checkin";
import type { Location, UserCoordinates } from "../types/location";

interface CheckinsScreenProps {
  accessToken: string | null;
  userCoordinates: UserCoordinates | null;
  preferredLocationId: string | null;
  onConsumePreferredLocation: () => void;
  locations: Location[];
}

const OCCUPANCY_OPTIONS: OccupancyPercent[] = [0, 25, 50, 75, 100];
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
      return;
    }
    const refreshTimer = setInterval(() => {
      void refreshCheckins();
    }, CHECKINS_REFRESH_MS);
    return () => clearInterval(refreshTimer);
  }, [accessToken, refreshCheckins]);

  const activeCheckin = checkinsData?.active_checkin ?? null;
  const history = checkinsData?.history ?? [];
  const selectedLocation = useMemo(
    () => locations.find((location) => location.id === selectedLocationId) ?? null,
    [locations, selectedLocationId],
  );

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
            {OCCUPANCY_OPTIONS.map((option) => (
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
            {OCCUPANCY_OPTIONS.map((option) => (
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
