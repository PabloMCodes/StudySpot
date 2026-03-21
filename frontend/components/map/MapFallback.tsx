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
            <View style={styles.previewSearch}>
              <Text style={styles.previewSearchText}>Find a study spot...</Text>
            </View>
            <View style={styles.previewChipRow}>
              <View style={styles.previewChip}>
                <Text style={styles.previewChipText}>Open now</Text>
              </View>
              <View style={styles.previewChip}>
                <Text style={styles.previewChipText}>Quiet</Text>
              </View>
              <View style={styles.previewChip}>
                <Text style={styles.previewChipText}>WiFi</Text>
              </View>
              <View style={styles.previewChip}>
                <Text style={styles.previewChipText}>Coffee</Text>
              </View>
            </View>
            <View style={styles.previewMapArt}>
              <View style={[styles.previewPin, styles.previewPinPrimary]} />
              <View style={[styles.previewPin, styles.previewPinSecondary]} />
              <View style={[styles.previewPin, styles.previewPinTertiary]} />
            </View>
            <Text style={styles.mapPreviewTitle}>List mode active</Text>
            <Text style={styles.mapPreviewText}>Map fallback for Expo Go while preserving app layout.</Text>
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
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 18,
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
    marginTop: 2,
    marginBottom: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#dacdb8",
    backgroundColor: "#f6efe3",
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  previewSearch: {
    borderRadius: 14,
    backgroundColor: "#fffaf2",
    borderWidth: 1,
    borderColor: "#e0d3bf",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  previewSearchText: {
    fontSize: 16,
    color: "#978f83",
  },
  previewChipRow: {
    marginTop: 10,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  previewChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#d8ccb8",
    backgroundColor: "#fffaf2",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  previewChipText: {
    color: "#686657",
    fontSize: 12,
    fontWeight: "700",
  },
  previewMapArt: {
    marginTop: 10,
    borderRadius: 16,
    height: 150,
    backgroundColor: "#e5dece",
    borderWidth: 1,
    borderColor: "#d8c9b2",
    overflow: "hidden",
  },
  previewPin: {
    position: "absolute",
    width: 18,
    height: 18,
    borderRadius: 999,
  },
  previewPinPrimary: {
    top: 32,
    left: 70,
    backgroundColor: "#c18447",
  },
  previewPinSecondary: {
    top: 82,
    right: 82,
    backgroundColor: "#4c6a45",
  },
  previewPinTertiary: {
    bottom: 28,
    left: 170,
    backgroundColor: "#3f5a39",
  },
  mapPreviewTitle: {
    marginTop: 12,
    fontSize: 15,
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
    fontSize: 17,
    fontWeight: "800",
    color: "#3b4b34",
    marginBottom: 9,
    marginLeft: 2,
  },
  locationCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#d6cbb5",
    backgroundColor: "#fffaf2",
    paddingHorizontal: 14,
    paddingVertical: 13,
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
