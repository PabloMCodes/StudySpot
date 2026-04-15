import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import { getFollowingLeaderboard } from "../services/sessionService";
import type { FollowingLeaderboardEntry } from "../types/session";

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

export function LeaderboardScreen({ accessToken, onAuthExpired, onOpenProfile }: LeaderboardScreenProps) {
  const [rows, setRows] = useState<FollowingLeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadLeaderboard = useCallback(async () => {
    if (!accessToken) {
      setRows([]);
      return;
    }

    setLoading(true);
    setMessage(null);

    const response = await getFollowingLeaderboard(accessToken);
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
  }, [accessToken, onAuthExpired]);

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
        <Text style={styles.title}>Leaderboard</Text>
        <Text style={styles.subtitle}>Following • Last 7 days</Text>
      </View>

      {message ? <Text style={styles.errorText}>{message}</Text> : null}

      {!loading && !rows.length ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyTitle}>No followed users yet</Text>
          <Text style={styles.emptyBody}>Follow people to see their study-time leaderboard.</Text>
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
  headerRow: {
    paddingHorizontal: 2,
    gap: 2,
  },
  title: {
    color: "#2f4232",
    fontSize: 27,
    fontWeight: "800",
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
