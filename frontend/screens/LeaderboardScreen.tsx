import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import { getFriendsLeaderboard, getGlobalLeaderboard } from "../services/sessionService";
import type { LeaderboardEntry } from "../types/session";

interface LeaderboardScreenProps {
  accessToken: string | null;
  onAuthExpired: () => void;
  onOpenProfile: (user: { id: string; name: string | null }) => void;
}

function isUnauthorizedError(message: string | null | undefined): boolean {
  const normalized = (message ?? "").toLowerCase();
  return normalized.includes("unauthorized") || normalized.includes("credential") || normalized.includes("token");
}

function formatStudyTime(totalMinutes: number): string {
  const safeMinutes = Math.max(0, Math.floor(totalMinutes));
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

function TrophyIcon() {
  return (
    <View style={styles.trophyIconWrap}>
      <View style={styles.trophyCup}>
        <View style={styles.trophyHandleLeft} />
        <View style={styles.trophyHandleRight} />
      </View>
      <View style={styles.trophyStem} />
      <View style={styles.trophyBase} />
    </View>
  );
}

export function LeaderboardScreen({ accessToken, onAuthExpired, onOpenProfile }: LeaderboardScreenProps) {
  const [rows, setRows] = useState<LeaderboardEntry[]>([]);
  const [mode, setMode] = useState<"friends" | "global">("friends");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadLeaderboard = useCallback(async () => {
    if (!accessToken) {
      setRows([]);
      return;
    }

    setLoading(true);
    setMessage(null);

    const response = mode === "friends"
      ? await getFriendsLeaderboard(accessToken)
      : await getGlobalLeaderboard(accessToken);
    if (!response.success || !response.data) {
      if (isUnauthorizedError(response.error)) {
        onAuthExpired();
      } else {
        setMessage(response.error ?? "Failed to load leaderboard.");
      }
      setLoading(false);
      return;
    }

    setRows(response.data);
    setLoading(false);
  }, [accessToken, mode, onAuthExpired]);

  useEffect(() => {
    void loadLeaderboard();
  }, [loadLeaderboard]);

  const topRankId = useMemo(() => rows[0]?.user_id ?? null, [rows]);

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void loadLeaderboard()} tintColor="#2f6b57" />}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerRow}>
        <View style={styles.titleRow}>
          <TrophyIcon />
          <Text style={styles.title}>Leaderboard</Text>
        </View>
        <Text style={styles.subtitle}>
          {mode === "friends" ? "Friends" : "Global"} • Last 7 days
        </Text>
      </View>
      <View style={styles.segmentedRow}>
        <Pressable
          onPress={() => setMode("friends")}
          style={[styles.segmentChip, mode === "friends" && styles.segmentChipActive]}
        >
          <Text style={[styles.segmentChipText, mode === "friends" && styles.segmentChipTextActive]}>Friends</Text>
        </Pressable>
        <Pressable
          onPress={() => setMode("global")}
          style={[styles.segmentChip, mode === "global" && styles.segmentChipActive]}
        >
          <Text style={[styles.segmentChipText, mode === "global" && styles.segmentChipTextActive]}>Global</Text>
        </Pressable>
      </View>

      {message ? <Text style={styles.errorText}>{message}</Text> : null}

      {!loading && !rows.length ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyTitle}>
            {mode === "friends" ? "No friends on leaderboard yet" : "No global sessions yet"}
          </Text>
          <Text style={styles.emptyBody}>
            {mode === "friends"
              ? "Add friends to compare study time."
              : "Complete sessions to populate the global ranking."}
          </Text>
        </View>
      ) : null}

      <View style={styles.listWrap}>
        {rows.map((entry) => {
          const isTop = topRankId === entry.user_id;
          return (
            <Pressable
              key={entry.user_id}
              onPress={() => onOpenProfile({ id: entry.user_id, name: entry.name })}
              style={({ pressed }) => [
                styles.row,
                isTop && styles.topRow,
                pressed && styles.rowPressed,
              ]}
            >
              <View style={styles.rankWrap}>
                <Text style={[styles.rankText, isTop && styles.topRankText]}>{entry.rank}</Text>
              </View>

              <View style={styles.userWrap}>
                <Text numberOfLines={1} style={styles.nameText}>{entry.name ?? "Unnamed user"}</Text>
                <Text style={styles.idText}>@{entry.user_id.slice(0, 8)}</Text>
              </View>

              <View style={styles.timeWrap}>
                <Text style={styles.timeText}>{formatStudyTime(entry.total_study_time)}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: 14,
    paddingBottom: 112,
    paddingHorizontal: 14,
    gap: 10,
  },
  segmentedRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 2,
  },
  segmentChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#d7cbb7",
    backgroundColor: "#fffaf2",
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  segmentChipActive: {
    borderColor: "#2f6b57",
    backgroundColor: "#2f6b57",
  },
  segmentChipText: {
    color: "#60584a",
    fontSize: 12,
    fontWeight: "700",
  },
  segmentChipTextActive: {
    color: "#ffffff",
  },
  headerRow: {
    paddingHorizontal: 2,
    gap: 2,
  },
  title: {
    color: "#2f4232",
    fontSize: 27,
    fontWeight: "800",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
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
    borderColor: "#2f4232",
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
    borderColor: "#2f4232",
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
    borderColor: "#2f4232",
    borderLeftWidth: 0,
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
  },
  trophyStem: {
    width: 3,
    height: 5,
    borderRadius: 2,
    marginTop: 1,
    backgroundColor: "#2f4232",
  },
  trophyBase: {
    width: 12,
    height: 3,
    borderRadius: 2,
    marginTop: 1,
    backgroundColor: "#2f4232",
  },
  subtitle: {
    color: "#756e62",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
    fontWeight: "700",
  },
  errorText: {
    color: "#9f3d33",
    fontSize: 12,
    fontWeight: "700",
  },
  emptyWrap: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#dfd2bf",
    backgroundColor: "#fffdf9",
    paddingHorizontal: 12,
    paddingVertical: 14,
    gap: 4,
  },
  emptyTitle: {
    color: "#334632",
    fontSize: 16,
    fontWeight: "800",
  },
  emptyBody: {
    color: "#7d725f",
    fontSize: 13,
    lineHeight: 18,
  },
  listWrap: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e3d8c7",
    backgroundColor: "#fffdf9",
    overflow: "hidden",
  },
  row: {
    minHeight: 66,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#efe6d8",
    gap: 10,
  },
  topRow: {
    backgroundColor: "#fff6e8",
  },
  rowPressed: {
    opacity: 0.78,
  },
  rankWrap: {
    width: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  rankText: {
    color: "#746857",
    fontSize: 18,
    fontWeight: "800",
  },
  topRankText: {
    color: "#b27532",
  },
  userWrap: {
    flex: 1,
    gap: 1,
  },
  nameText: {
    color: "#2f4232",
    fontSize: 15,
    fontWeight: "700",
  },
  idText: {
    color: "#8a7f6d",
    fontSize: 11,
  },
  timeWrap: {
    alignItems: "flex-end",
    justifyContent: "center",
  },
  timeText: {
    color: "#2f6b57",
    fontSize: 14,
    fontWeight: "800",
  },
});
