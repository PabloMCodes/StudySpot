import Mapbox from "@rnmapbox/maps";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

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
  const [mapboxInitError, setMapboxInitError] = useState<string | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const accessToken = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim() ?? "";

  const validLocations = useMemo(
    () =>
      locations.filter(
        (location) =>
          Number.isFinite(location.latitude) &&
          Number.isFinite(location.longitude) &&
          Math.abs(location.latitude) <= 90 &&
          Math.abs(location.longitude) <= 180,
      ),
    [locations],
  );

  const centerCoordinate = useMemo<[number, number]>(() => {
    if (validLocations.length === 0) {
      // UCF/Orlando default center until we have API data.
      return [-81.2001, 28.6024];
    }

    if (!selectedLocationId) {
      const first = validLocations[0];
      return [first.longitude, first.latitude];
    }

    const selected = validLocations.find((location) => location.id === selectedLocationId);
    if (!selected) {
      const first = validLocations[0];
      return [first.longitude, first.latitude];
    }

    return [selected.longitude, selected.latitude];
  }, [selectedLocationId, validLocations]);

  useEffect(() => {
    let isActive = true;

    if (!accessToken) {
      setMapboxInitError("Missing EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN in frontend/.env.local");
      return () => {
        isActive = false;
      };
    }

    Mapbox.setAccessToken(accessToken)
      .then(() => {
        if (isActive) {
          setMapboxInitError(null);
        }
      })
      .catch(() => {
        if (isActive) {
          setMapboxInitError("Failed to initialize Mapbox token");
        }
      });

    return () => {
      isActive = false;
    };
  }, [accessToken]);

  if (mapboxInitError) {
    return (
      <View style={styles.container}>
        <View style={styles.bannerWarning}>
          <Text style={styles.bannerTitle}>Mapbox setup issue</Text>
          <Text style={styles.bannerText}>{mapboxInitError}</Text>
        </View>
        <View style={styles.fallbackContainer}>
          <MapFallback error={error} loading={loading} locations={locations} onRetry={onRetry} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Mapbox.MapView style={styles.map} styleURL={Mapbox.StyleURL.Street}>
        <Mapbox.Camera
          animationDuration={500}
          animationMode="easeTo"
          centerCoordinate={centerCoordinate}
          zoomLevel={validLocations.length > 0 ? 11 : 10}
        />

        {validLocations.map((location) => (
          <Mapbox.PointAnnotation
            coordinate={[location.longitude, location.latitude]}
            id={location.id}
            key={location.id}
            onSelected={() => setSelectedLocationId(location.id)}
          >
            <View style={styles.pinDot} />
          </Mapbox.PointAnnotation>
        ))}
      </Mapbox.MapView>

      {loading ? (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color="#334226" />
          <Text style={styles.loadingText}>Loading study spots...</Text>
        </View>
      ) : null}

      <View style={styles.banner}>
        <Text style={styles.bannerTitle}>Mapbox live</Text>
        <Text style={styles.bannerText}>
          Pins loaded: {validLocations.length}. Tap a pin to center and inspect nearby spots.
        </Text>
      </View>

      {error ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>Could not refresh locations</Text>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={onRetry} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>Try Again</Text>
          </Pressable>
        </View>
      ) : null}

      {selectedLocationId ? (
        <View style={styles.selectionCard}>
          <Text style={styles.selectionTitle}>
            {validLocations.find((location) => location.id === selectedLocationId)?.name ??
              "Selected location"}
          </Text>
          <Text style={styles.selectionSubtitle}>
            {validLocations.find((location) => location.id === selectedLocationId)?.address ??
              "Address not available"}
          </Text>
        </View>
      ) : null}

      {!loading && !error && validLocations.length === 0 ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>No locations to display</Text>
          <Text style={styles.errorText}>Backend returned an empty list.</Text>
          <Pressable onPress={onRetry} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>Reload</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  banner: {
    position: "absolute",
    marginHorizontal: 16,
    marginTop: 8,
    top: 0,
    left: 0,
    right: 0,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#b79f7a",
    backgroundColor: "rgba(254, 248, 234, 0.95)",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  bannerWarning: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#a04a3d",
    backgroundColor: "#fff3f0",
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
  loadingOverlay: {
    position: "absolute",
    top: 84,
    alignSelf: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#d8cfba",
    backgroundColor: "rgba(253, 251, 244, 0.96)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  loadingText: {
    color: "#4f5c42",
    fontSize: 12,
    fontWeight: "600",
  },
  errorCard: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#d6cdb8",
    backgroundColor: "rgba(253, 251, 244, 0.98)",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  errorTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#4a4a3d",
  },
  errorText: {
    marginTop: 2,
    fontSize: 12,
    color: "#6b6a59",
  },
  retryButton: {
    marginTop: 8,
    alignSelf: "flex-start",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#6d7a5a",
    backgroundColor: "#fdfbf4",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  retryButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#334226",
  },
  pinDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: "#fff",
    backgroundColor: "#334226",
  },
  selectionCard: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#d6cdb8",
    backgroundColor: "rgba(253, 251, 244, 0.98)",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  selectionTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#334226",
  },
  selectionSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: "#5d614e",
  },
});
