import React from "react";
import { StyleSheet, Text, View } from "react-native";

import type { PersonalSession } from "../../types/session";
import { HistoryItem } from "./HistoryItem";

interface StudyHistoryListProps {
  history: PersonalSession[];
  loading: boolean;
  editingSessionId: string | null;
  deletingSessionId: string | null;
  onEditHistory: (
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
  ) => void;
  onDeleteHistory: (sessionId: string) => void;
}

export function StudyHistoryList({
  history,
  loading,
  editingSessionId,
  deletingSessionId,
  onEditHistory,
  onDeleteHistory,
}: StudyHistoryListProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Study History</Text>
      {loading ? <Text style={styles.helper}>Loading sessions...</Text> : null}
      {!loading && history.length === 0 ? <Text style={styles.helper}>No sessions yet.</Text> : null}
      {history.map((item) => (
        <HistoryItem
          item={item}
          key={item.id}
          onDelete={() => onDeleteHistory(item.id)}
          onSaveEdit={(payload) => onEditHistory(item.id, payload)}
          saving={editingSessionId === item.id}
          deleting={deletingSessionId === item.id}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
  },
  title: {
    color: "#2f4031",
    fontSize: 16,
    fontWeight: "800",
  },
  helper: {
    color: "#6b6a59",
    fontSize: 12,
    fontWeight: "600",
  },
});
