import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

interface StarRatingProps {
  value: number | null;
  onChange: (value: number) => void;
}

export function StarRating({ value, onChange }: StarRatingProps) {
  return (
    <View style={styles.row}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Pressable key={star} onPress={() => onChange(star)} style={styles.starWrap}>
          <Text style={[styles.star, (value ?? 0) >= star && styles.starActive]}>★</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 8,
  },
  starWrap: {
    minHeight: 36,
    minWidth: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  star: {
    fontSize: 28,
    color: "#c7c4b9",
  },
  starActive: {
    color: "#2f6b57",
  },
});
