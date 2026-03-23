import React from "react";
import { StyleSheet, View } from "react-native";

import type { Location, UserCoordinates } from "../../types/location";
import { MapFallback } from "./MapFallback";
import { MapboxPlaceholder } from "./MapboxPlaceholder";

type MapProvider = "mapbox" | "fallback";

interface MapContainerProps {
  locations: Location[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  userCoordinates: UserCoordinates | null;
}

function getMapProvider(): MapProvider {
  const configured = process.env.EXPO_PUBLIC_MAP_PROVIDER?.toLowerCase();
  return configured === "mapbox" ? "mapbox" : "fallback";
}

export function MapContainer({
  locations,
  loading,
  error,
  onRetry,
  userCoordinates,
}: MapContainerProps) {
  const mapProvider = getMapProvider();

  return (
    <View style={styles.container}>
      {mapProvider === "mapbox" ? (
        <MapboxPlaceholder
          error={error}
          loading={loading}
          locations={locations}
          onRetry={onRetry}
          userCoordinates={userCoordinates}
        />
      ) : (
        <MapFallback error={error} loading={loading} locations={locations} onRetry={onRetry} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
