import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

interface LocationSelectorProps {
  useCurrentLocation: boolean;
  onToggleUseCurrentLocation: () => void;
  selectedLocationName: string | null;
}

export function LocationSelector({
  useCurrentLocation,
  onToggleUseCurrentLocation,
  selectedLocationName,
}: LocationSelectorProps) {
  return (
    <View style={styles.container}>
      <Pressable onPress={onToggleUseCurrentLocation} style={styles.toggleRow}>
        <View style={[styles.checkbox, useCurrentLocation && styles.checkboxActive]}>
          {useCurrentLocation ? <Text style={styles.checkmark}>✓</Text> : null}
        </View>
        <Text style={styles.toggleLabel}>Use current location</Text>
      </Pressable>
      {useCurrentLocation && selectedLocationName ? (
        <View style={styles.locationChip}>
          <Text style={styles.locationChipText}>📍 {selectedLocationName}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#9baa91",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxActive: {
    backgroundColor: "#2f6b57",
    borderColor: "#2f6b57",
  },
  checkmark: {
    color: "#f2fbf7",
    fontSize: 12,
    fontWeight: "900",
  },
  toggleLabel: {
    color: "#3f4f3a",
    fontSize: 14,
    fontWeight: "700",
  },
  locationChip: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "#eef6f0",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  locationChipText: {
    color: "#3f5440",
    fontSize: 12,
    fontWeight: "700",
  },
});
