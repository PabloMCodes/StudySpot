import React from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import type { Location } from "../../types/location";

interface MapFallbackProps {
  locations: Location[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

export function MapFallback({ locations, loading, error, onRetry }: MapFallbackProps) {
  if (loading) {
    return (
      <View style={styles.centeredState}>
        <ActivityIndicator color="#334226" size="small" />
        <Text style={styles.stateText}>Loading study spots...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centeredState}>
        <Text style={styles.stateTitle}>Could not load map data</Text>
        <Text style={styles.stateText}>{error}</Text>
        <Pressable onPress={onRetry} style={styles.retryButton}>
          <Text style={styles.retryButtonText}>Try Again</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <FlatList
      contentContainerStyle={styles.contentContainer}
      data={locations}
      keyExtractor={(item) => item.id}
      ListEmptyComponent={
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No study spots found</Text>
          <Text style={styles.emptyText}>Try again after the backend is running.</Text>
        </View>
      }
      ListHeaderComponent={
        <View>
          <View style={styles.mapPreview}>
            <Text style={styles.mapPreviewTitle}>Map Fallback Mode</Text>
            <Text style={styles.mapPreviewText}>
              Expo Go compatible list while Mapbox is under development.
            </Text>
          </View>
          <Text style={styles.sectionTitle}>Study Spots</Text>
        </View>
      }
      renderItem={({ item }) => (
        <View style={styles.locationCard}>
          <Text style={styles.locationName}>{item.name}</Text>
          <Text style={styles.locationAddress}>{item.address ?? "Address not available"}</Text>
          <View style={styles.metaRow}>
            <Text style={styles.metaText}>Quiet {item.quiet_level}/5</Text>
            <Text style={styles.metaText}>{item.has_outlets ? "Outlets" : "No outlet data"}</Text>
          </View>
        </View>
      )}
      showsVerticalScrollIndicator={false}
    />
  );
}

const styles = StyleSheet.create({
  contentContainer: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  centeredState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 10,
  },
  stateTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#334226",
  },
  stateText: {
    fontSize: 14,
    color: "#5d614e",
    textAlign: "center",
  },
  retryButton: {
    marginTop: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#6d7a5a",
    backgroundColor: "#fdfbf4",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  retryButtonText: {
    color: "#334226",
    fontWeight: "700",
  },
  mapPreview: {
    marginTop: 8,
    marginBottom: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#c6b89c",
    backgroundColor: "#f8f4e8",
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  mapPreviewTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#334226",
  },
  mapPreviewText: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
    color: "#5d614e",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#334226",
    marginBottom: 8,
  },
  locationCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#d2c7af",
    backgroundColor: "#fffdf7",
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 10,
  },
  locationName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#2f3a2f",
  },
  locationAddress: {
    marginTop: 4,
    color: "#5f5f50",
    fontSize: 12,
    lineHeight: 17,
  },
  metaRow: {
    marginTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  metaText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#46543d",
  },
  emptyState: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#d2c7af",
    backgroundColor: "#fffdf7",
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#2f3a2f",
  },
  emptyText: {
    marginTop: 4,
    fontSize: 12,
    color: "#5f5f50",
  },
});
