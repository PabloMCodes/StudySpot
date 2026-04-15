import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

export const FOCUS_OPTIONS = [
  { value: 1, label: "Low Focus" },
  { value: 2, label: "Decent" },
  { value: 3, label: "Productive" },
  { value: 4, label: "Highly Accomplished" },
] as const;

interface FocusSelectorProps {
  value: number | null;
  onChange: (value: number) => void;
}

export function FocusSelector({ value, onChange }: FocusSelectorProps) {
  return (
    <View style={styles.wrap}>
      {FOCUS_OPTIONS.map((option) => (
        <Pressable
          key={option.value}
          onPress={() => onChange(option.value)}
          style={[
            styles.pill,
            value === option.value && styles.pillSelected,
          ]}
        >
          <Text style={[styles.pillText, value === option.value && styles.pillTextSelected]}>
            {option.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  pill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#b9c8bc",
    backgroundColor: "#ffffff",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  pillSelected: {
    backgroundColor: "#2f6b57",
    borderColor: "#2f6b57",
  },
  pillText: {
    color: "#456046",
    fontSize: 12,
    fontWeight: "700",
  },
  pillTextSelected: {
    color: "#f1fbf5",
  },
});
