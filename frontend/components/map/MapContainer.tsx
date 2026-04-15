import React from "react";
import { StyleSheet, View } from "react-native";

import type { CheckinAvailability } from "../../types/checkin";
import type { Location, UserCoordinates } from "../../types/location";
import { MapFallback } from "./MapFallback";
import { MapboxPlaceholder } from "./MapboxPlaceholder";

type MapProvider = "mapbox" | "fallback";

interface MapContainerProps {
  accessToken: string | null;
  locations: Location[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  userCoordinates: UserCoordinates | null;
  canCheckIn: boolean;
  onOpenCheckinsForLocation: (locationId: string) => void;
  onLogLocationInteraction: (locationId: string, interactionType: "view" | "click") => Promise<void>;
  onLoadAvailability: (locationId: string) => Promise<{
    availability: CheckinAvailability | null;
    error: string | null;
  }>;
}

function getMapProvider(): MapProvider {
  const configured = process.env.EXPO_PUBLIC_MAP_PROVIDER?.toLowerCase();
  return configured === "mapbox" ? "mapbox" : "fallback";
}

export function MapContainer({
  accessToken,
  locations,
  loading,
  error,
  onRetry,
  userCoordinates,
  canCheckIn,
  onOpenCheckinsForLocation,
  onLogLocationInteraction,
  onLoadAvailability,
}: MapContainerProps) {
  const mapProvider = getMapProvider();

  return (
    <View style={styles.container}>
      {mapProvider === "mapbox" ? (
        <MapboxPlaceholder
          accessToken={accessToken}
          canCheckIn={canCheckIn}
          error={error}
          loading={loading}
          locations={locations}
          onLogLocationInteraction={onLogLocationInteraction}
          onOpenCheckinsForLocation={onOpenCheckinsForLocation}
          onLoadAvailability={onLoadAvailability}
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
