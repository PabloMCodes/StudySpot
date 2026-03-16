import React from "react";
import { StyleSheet, Text, View } from "react-native";

import type { Location } from "../../types/location";
import { MapFallback } from "./MapFallback";

interface MapboxPlaceholderProps {
  locations: Location[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

export function MapboxPlaceholder({
  locations,
  loading,
  error,
  onRetry,
}: MapboxPlaceholderProps) {
  return (
    <View style={styles.container}>
      <View style={styles.banner}>
        <Text style={styles.bannerTitle}>Mapbox mode selected</Text>
        <Text style={styles.bannerText}>
          Mapbox rendering is not wired yet in this scaffold. Using fallback list so Expo Go users
          remain unblocked.
        </Text>
      </View>
      <View style={styles.fallbackContainer}>
        <MapFallback error={error} loading={loading} locations={locations} onRetry={onRetry} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  banner: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#b79f7a",
    backgroundColor: "#fef8ea",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  bannerTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#5d4a2a",
  },
  bannerText: {
    marginTop: 4,
    fontSize: 12,
    color: "#6a5a3f",
    lineHeight: 17,
  },
  fallbackContainer: {
    flex: 1,
  },
});
