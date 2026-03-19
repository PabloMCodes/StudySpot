import Mapbox, { type Camera, type MapState } from "@rnmapbox/maps";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import {
  applyLocationFilters,
  isLocationOpenNow,
} from "../../services/locationFilterService";
import { getLocationsInBounds } from "../../services/locationService";
import {
  boundsFromCameraState,
  didBoundsChange,
} from "../../services/locationViewportService";
import type { Location, LocationBounds, LocationFilters } from "../../types/location";
import { MapFallback } from "./MapFallback";

interface MapboxPlaceholderProps {
  locations: Location[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

const DEFAULT_CENTER: [number, number] = [-81.2001, 28.6024];
const DEFAULT_FILTERS: LocationFilters = {
  openNow: false,
  minQuietLevel: null,
};

export function MapboxPlaceholder({
  locations,
  loading,
  error,
  onRetry,
}: MapboxPlaceholderProps) {
  const cameraRef = useRef<Camera>(null);
  const [mapboxInitError, setMapboxInitError] = useState<string | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [filters, setFilters] = useState<LocationFilters>(DEFAULT_FILTERS);
  const [viewportLocations, setViewportLocations] = useState<Location[]>(locations);
  const [viewportLoading, setViewportLoading] = useState(false);
  const [viewportError, setViewportError] = useState<string | null>(null);
  const [lastFetchedBounds, setLastFetchedBounds] = useState<LocationBounds | null>(null);

  const accessToken = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim() ?? "";

  useEffect(() => {
    setViewportLocations(locations);
  }, [locations]);

  useEffect(() => {
    if (!selectedLocationId) {
      return;
    }

    if (!viewportLocations.some((location) => location.id === selectedLocationId)) {
      setSelectedLocationId(null);
    }
  }, [selectedLocationId, viewportLocations]);

  const fetchLocationsForBounds = useCallback(async (bounds: LocationBounds) => {
    setViewportLoading(true);
    setViewportError(null);

    try {
      const response = await getLocationsInBounds(bounds, { limit: 100, sort: "name" });

      if (!response.success || !response.data) {
        setViewportError(response.error ?? "Failed to load viewport locations");
        return;
      }

      setViewportLocations(response.data);
    } catch {
      setViewportError("Failed to load viewport locations");
    } finally {
      setViewportLoading(false);
    }
  }, []);

  const onMapIdle = useCallback(
    (state: MapState) => {
      const bounds = boundsFromCameraState(state);
      if (!bounds) {
        return;
      }

      if (!didBoundsChange(lastFetchedBounds, bounds)) {
        return;
      }

      setLastFetchedBounds(bounds);
      void fetchLocationsForBounds(bounds);
    },
    [fetchLocationsForBounds, lastFetchedBounds],
  );

  const validLocations = useMemo(
    () =>
      viewportLocations.filter(
        (location) =>
          Number.isFinite(location.latitude) &&
          Number.isFinite(location.longitude) &&
          Math.abs(location.latitude) <= 90 &&
          Math.abs(location.longitude) <= 180,
      ),
    [viewportLocations],
  );

  const filteredLocations = useMemo(
    () => applyLocationFilters(validLocations, filters),
    [filters, validLocations],
  );

  const selectedLocation = useMemo(
    () => filteredLocations.find((location) => location.id === selectedLocationId) ?? null,
    [filteredLocations, selectedLocationId],
  );

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

  useEffect(() => {
    if (!selectedLocation || !cameraRef.current) {
      return;
    }

    cameraRef.current.setCamera({
      centerCoordinate: [selectedLocation.longitude, selectedLocation.latitude],
      zoomLevel: 13,
      animationDuration: 350,
      animationMode: "easeTo",
    });
  }, [selectedLocation]);

  const combinedError = viewportError ?? error;
  const mapIsLoading = loading || viewportLoading;

  if (mapboxInitError) {
    return (
      <View style={styles.container}>
        <View style={styles.bannerWarning}>
          <Text style={styles.bannerTitle}>Mapbox setup issue</Text>
          <Text style={styles.bannerText}>{mapboxInitError}</Text>
        </View>
        <View style={styles.fallbackContainer}>
          <MapFallback error={combinedError} loading={mapIsLoading} locations={locations} onRetry={onRetry} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Mapbox.MapView
        onMapIdle={onMapIdle}
        style={styles.map}
        styleURL={Mapbox.StyleURL.Street}
      >
        <Mapbox.Camera
          ref={cameraRef}
          defaultSettings={{
            centerCoordinate: DEFAULT_CENTER,
            zoomLevel: 10,
          }}
        />

        {filteredLocations.map((location) => (
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

      <View style={styles.banner}>
        <Text style={styles.bannerTitle}>Mapbox live</Text>
        <Text style={styles.bannerText}>
          Showing {filteredLocations.length} spots in this map area. Pan map to fetch new bounds.
        </Text>
      </View>

      <View style={styles.filterBar}>
        <Pressable
          onPress={() => setFilters((prev) => ({ ...prev, openNow: !prev.openNow }))}
          style={[styles.filterChip, filters.openNow && styles.filterChipActive]}
        >
          <Text style={[styles.filterChipText, filters.openNow && styles.filterChipTextActive]}>
            Open Now
          </Text>
        </Pressable>

        <Pressable
          onPress={() =>
            setFilters((prev) => {
              const nextQuiet = prev.minQuietLevel === 4 ? null : prev.minQuietLevel === 3 ? 4 : 3;
              return { ...prev, minQuietLevel: nextQuiet };
            })
          }
          style={[styles.filterChip, Boolean(filters.minQuietLevel) && styles.filterChipActive]}
        >
          <Text
            style={[
              styles.filterChipText,
              Boolean(filters.minQuietLevel) && styles.filterChipTextActive,
            ]}
          >
            {filters.minQuietLevel ? `Quiet ${filters.minQuietLevel}+` : "Quiet Any"}
          </Text>
        </Pressable>

        {(filters.openNow || filters.minQuietLevel) ? (
          <Pressable
            onPress={() => setFilters(DEFAULT_FILTERS)}
            style={[styles.filterChip, styles.filterChipReset]}
          >
            <Text style={styles.filterChipText}>Reset</Text>
          </Pressable>
        ) : null}
      </View>

      {mapIsLoading ? (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color="#334226" />
          <Text style={styles.loadingText}>Loading study spots...</Text>
        </View>
      ) : null}

      {combinedError ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>Could not refresh locations</Text>
          <Text style={styles.errorText}>{combinedError}</Text>
          <Pressable onPress={onRetry} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>Try Again</Text>
          </Pressable>
        </View>
      ) : null}

      {!mapIsLoading && !combinedError && filteredLocations.length === 0 ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>No locations match these filters</Text>
          <Text style={styles.errorText}>Try widening the map or resetting filters.</Text>
          <Pressable onPress={() => setFilters(DEFAULT_FILTERS)} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>Reset Filters</Text>
          </Pressable>
        </View>
      ) : null}

      {selectedLocation ? (
        <View style={styles.selectionCard}>
          <Text style={styles.selectionTitle}>{selectedLocation.name}</Text>
          <Text style={styles.selectionSubtitle}>
            {selectedLocation.address ?? "Address not available"}
          </Text>
          <Text style={styles.selectionMeta}>
            Quiet {selectedLocation.quiet_level}/5 • {selectedLocation.has_outlets ? "Outlets" : "No outlet data"}
          </Text>
          {filters.openNow ? (
            <Text style={styles.selectionMeta}>
              {isLocationOpenNow(selectedLocation, new Date()) === false
                ? "Closed now"
                : "Open now or hours unavailable"}
            </Text>
          ) : null}
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
    top: 8,
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
  filterBar: {
    position: "absolute",
    top: 78,
    left: 16,
    right: 16,
    flexDirection: "row",
    gap: 8,
  },
  filterChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#b8aa8e",
    backgroundColor: "rgba(253, 251, 244, 0.95)",
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  filterChipActive: {
    borderColor: "#334226",
    backgroundColor: "#334226",
  },
  filterChipReset: {
    borderColor: "#8f856f",
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#4a4a3d",
  },
  filterChipTextActive: {
    color: "#fdfbf4",
  },
  loadingOverlay: {
    position: "absolute",
    top: 120,
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
  selectionMeta: {
    marginTop: 4,
    fontSize: 12,
    color: "#5d614e",
    fontWeight: "600",
  },
});
