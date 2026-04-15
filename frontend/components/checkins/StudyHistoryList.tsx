import React from "react";
import { StyleSheet, Text, View } from "react-native";

import type { PersonalSession } from "../../types/session";
import { HistoryItem } from "./HistoryItem";

interface StudyHistoryListProps {
  history: PersonalSession[];
  loading: boolean;
}

export function StudyHistoryList({ history, loading }: StudyHistoryListProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Study History</Text>
      {loading ? <Text style={styles.helper}>Loading sessions...</Text> : null}
      {!loading && history.length === 0 ? <Text style={styles.helper}>No sessions yet.</Text> : null}
      {history.map((item) => (
        <HistoryItem item={item} key={item.id} />
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
