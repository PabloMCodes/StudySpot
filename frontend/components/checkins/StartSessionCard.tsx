import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

interface StartSessionCardProps {
  locationLabel: string;
  onStartPress: () => void;
  disabled?: boolean;
}

export function StartSessionCard({ locationLabel, onStartPress, disabled = false }: StartSessionCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Ready to focus?</Text>
      <Pressable
        accessibilityRole="button"
        disabled={disabled}
        onPress={onStartPress}
        style={({ pressed }) => [
          styles.primaryButton,
          disabled && styles.buttonDisabled,
          pressed && !disabled && styles.buttonPressed,
        ]}
      >
        <Text style={styles.primaryButtonText}>Start Study Session</Text>
      </Pressable>
      <Text style={styles.locationText}>{locationLabel}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fffdf9",
    borderRadius: 22,
    padding: 16,
    gap: 12,
    shadowColor: "#1f2b1f",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  title: {
    color: "#294129",
    fontSize: 18,
    fontWeight: "800",
  },
  primaryButton: {
    minHeight: 54,
    borderRadius: 14,
    backgroundColor: "#2f6b57",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  primaryButtonText: {
    color: "#f5fbf7",
    fontSize: 16,
    fontWeight: "800",
  },
  buttonPressed: {
    opacity: 0.9,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  locationText: {
    color: "#6b6a59",
    fontSize: 12,
    fontWeight: "600",
  },
});
