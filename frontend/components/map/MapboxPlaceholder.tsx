import Mapbox, { type Camera, type MapState } from "@rnmapbox/maps";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import {
  applySearchIntent,
  DEFAULT_SEARCH_INTENT,
  isLocationOpenNow,
  parseNaturalLanguageToIntent,
} from "../../services/locationFilterService";
import { getLocationsInBounds } from "../../services/locationService";
import {
  boundsFromCameraState,
  didBoundsChange,
} from "../../services/locationViewportService";
import type { CheckinAvailability } from "../../types/checkin";
import type {
  Location,
  LocationBounds,
  SearchIntent,
  UserCoordinates,
} from "../../types/location";
import { MapFallback } from "./MapFallback";

interface MapboxPlaceholderProps {
  locations: Location[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  userCoordinates: UserCoordinates | null;
  canCheckIn: boolean;
  onLoadAvailability: (locationId: string) => Promise<{
    availability: CheckinAvailability | null;
    error: string | null;
  }>;
  onOpenCheckinsForLocation: (locationId: string) => void;
}

const DEFAULT_CENTER: [number, number] = [-81.2001, 28.6024];
const OPEN_AT_OPTIONS: Array<number | null> = [null, 8 * 60, 12 * 60, 18 * 60];
const CATEGORY_CHIPS = [
  { label: "Coffee", value: "coffee" },
  { label: "Boba", value: "boba" },
  { label: "Library", value: "library" },
] as const;

function formatMinutesLabel(totalMinutes: number | null): string {
  if (totalMinutes === null) {
    return "Any Time";
  }

  const hours24 = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const suffix = hours24 >= 12 ? "PM" : "AM";
  const hour12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hour12}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

export function MapboxPlaceholder({
  locations,
  loading,
  error,
  onRetry,
  userCoordinates,
  canCheckIn,
  onLoadAvailability,
  onOpenCheckinsForLocation,
}: MapboxPlaceholderProps) {
  const cameraRef = useRef<Camera>(null);
  const shapeSourceRef = useRef<any>(null);
  const latestViewportRequestIdRef = useRef(0);
  const lastViewportBoundsRef = useRef<LocationBounds | null>(null);
  const [mapboxInitError, setMapboxInitError] = useState<string | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [intent, setIntent] = useState<SearchIntent>(DEFAULT_SEARCH_INTENT);
  const [viewportLocations, setViewportLocations] = useState<Location[]>(locations);
  const [viewportLoading, setViewportLoading] = useState(false);
  const [viewportError, setViewportError] = useState<string | null>(null);
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [selectedLocationAvailability, setSelectedLocationAvailability] = useState<CheckinAvailability | null>(null);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  const blurSearchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const accessToken = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim() ?? "";
  const configuredStyleURL = process.env.EXPO_PUBLIC_MAPBOX_STYLE_URL?.trim();
  const styleURL = configuredStyleURL ? configuredStyleURL : Mapbox.StyleURL.Street;
  const initialCenterCoordinate: [number, number] = userCoordinates
    ? [userCoordinates.lng, userCoordinates.lat]
    : DEFAULT_CENTER;

  useEffect(() => {
    setViewportLocations(locations);
  }, [locations]);

  useEffect(() => {
    if (!selectedLocationId) {
      return;
    }

    if (!locations.some((location) => location.id === selectedLocationId)) {
      setSelectedLocationId(null);
    }
  }, [locations, selectedLocationId]);

  const fetchLocationsForBounds = useCallback(async (bounds: LocationBounds) => {
    const requestId = latestViewportRequestIdRef.current + 1;
    latestViewportRequestIdRef.current = requestId;
    setViewportLoading(true);
    setViewportError(null);

    try {
      const response = await getLocationsInBounds(bounds, {
        limit: 100,
        sort: "name",
      });

      if (requestId !== latestViewportRequestIdRef.current) {
        return;
      }

      if (!response.success || !response.data) {
        setViewportError(response.error ?? "Failed to load viewport locations");
        return;
      }

      setViewportLocations(response.data);
    } catch {
      if (requestId !== latestViewportRequestIdRef.current) {
        return;
      }
      setViewportError("Failed to load viewport locations");
    } finally {
      if (requestId === latestViewportRequestIdRef.current) {
        setViewportLoading(false);
      }
    }
  }, []);

  const maybeFetchLocationsForState = useCallback(
    (state: MapState) => {
      const bounds = boundsFromCameraState(state);
      if (!bounds) {
        return;
      }

      // Ignore tiny camera movements to avoid redundant fetches while panning.
      if (!didBoundsChange(lastViewportBoundsRef.current, bounds, 0.01)) {
        return;
      }

      lastViewportBoundsRef.current = bounds;
      void fetchLocationsForBounds(bounds);
    },
    [fetchLocationsForBounds],
  );

  const onMapIdle = useCallback(
    (state: MapState) => {
      maybeFetchLocationsForState(state);
    },
    [maybeFetchLocationsForState],
  );

  const onCameraChanged = useCallback(
    (state: MapState) => {
      maybeFetchLocationsForState(state);
    },
    [maybeFetchLocationsForState],
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
    () => applySearchIntent(validLocations, intent),
    [intent, validLocations],
  );

  const selectedLocation = useMemo(
    () =>
      validLocations.find((location) => location.id === selectedLocationId) ??
      locations.find((location) => location.id === selectedLocationId) ??
      null,
    [locations, selectedLocationId, validLocations],
  );

  const autocompleteSuggestions = useMemo(() => {
    const query = intent.queryText.trim().toLowerCase();
    if (!query) {
      return [] as Location[];
    }

    const ranked = locations
      .filter((location) => {
        const haystack = `${location.name} ${location.address ?? ""} ${location.category ?? ""}`.toLowerCase();
        return haystack.includes(query);
      })
      .map((location) => {
        const name = location.name.toLowerCase();
        const startsWithName = name.startsWith(query);
        const includesName = name.includes(query);
        const score = startsWithName ? 3 : includesName ? 2 : 1;
        return { location, score };
      })
      .sort((a, b) => b.score - a.score || a.location.name.localeCompare(b.location.name))
      .slice(0, 6)
      .map(({ location }) => location);

    return ranked;
  }, [intent.queryText, locations]);

  const hasActiveFilters = useMemo(
    () =>
      Boolean(intent.queryText.trim()) ||
      intent.openNow ||
      intent.openAtMinutes !== null ||
      intent.minQuietLevel !== null ||
      intent.hasOutlets !== null ||
      intent.categories.length > 0,
    [intent],
  );

  const locationFeatureCollection = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: "FeatureCollection",
      features: filteredLocations.map((location) => ({
        type: "Feature",
        id: location.id,
        properties: {
          locationId: location.id,
          name: location.name,
          address: location.address ?? "",
        },
        geometry: {
          type: "Point",
          coordinates: [location.longitude, location.latitude],
        },
      })),
    }),
    [filteredLocations],
  );

  useEffect(() => {
    return () => {
      if (blurSearchTimeoutRef.current) {
        clearTimeout(blurSearchTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!selectedLocation) {
      setSelectedLocationAvailability(null);
      setAvailabilityError(null);
      return;
    }

    setAvailabilityLoading(true);
    setAvailabilityError(null);

    void onLoadAvailability(selectedLocation.id)
      .then((result) => {
        if (cancelled) {
          return;
        }
        setSelectedLocationAvailability(result.availability);
        setAvailabilityError(result.error);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setSelectedLocationAvailability(null);
        setAvailabilityError("Failed to load AI availability");
      })
      .finally(() => {
        if (!cancelled) {
          setAvailabilityLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [onLoadAvailability, selectedLocation]);

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
    if (!userCoordinates || !cameraRef.current) {
      return;
    }

    cameraRef.current.setCamera({
      centerCoordinate: [userCoordinates.lng, userCoordinates.lat],
      zoomLevel: 11.5,
      animationDuration: 450,
      animationMode: "easeTo",
    });
  }, [userCoordinates]);

  const onShapePress = useCallback(async (event: any) => {
    const feature = event?.features?.[0];
    if (!feature) {
      return;
    }

    const isCluster = Boolean(feature.properties?.cluster);
    const coordinates = feature.geometry?.coordinates;

    if (!Array.isArray(coordinates) || coordinates.length < 2 || !cameraRef.current) {
      return;
    }

    if (isCluster) {
      try {
        const nextZoom = shapeSourceRef.current
          ? await shapeSourceRef.current.getClusterExpansionZoom(feature)
          : 12;

        cameraRef.current.setCamera({
          centerCoordinate: [coordinates[0], coordinates[1]],
          zoomLevel: Math.min(Number(nextZoom) + 0.2, 16),
          animationDuration: 280,
          animationMode: "easeTo",
        });
      } catch {
        cameraRef.current.setCamera({
          centerCoordinate: [coordinates[0], coordinates[1]],
          zoomLevel: 12.5,
          animationDuration: 280,
          animationMode: "easeTo",
        });
      }
      return;
    }

    const locationId = feature.properties?.locationId;
    if (typeof locationId === "string") {
      setSelectedLocationId((previousId) => {
        if (previousId === locationId) {
          return null;
        }

        cameraRef.current?.setCamera({
          centerCoordinate: [coordinates[0], coordinates[1]],
          zoomLevel: 13,
          animationDuration: 350,
          animationMode: "easeTo",
        });

        return locationId;
      });
    }
  }, []);

  const onSearchFocus = useCallback(() => {
    if (blurSearchTimeoutRef.current) {
      clearTimeout(blurSearchTimeoutRef.current);
      blurSearchTimeoutRef.current = null;
    }
    setIsSearchActive(true);
  }, []);

  const onSearchBlur = useCallback(() => {
    blurSearchTimeoutRef.current = setTimeout(() => {
      setIsSearchActive(false);
      blurSearchTimeoutRef.current = null;
    }, 120);
  }, []);

  const onSuggestionPress = useCallback((location: Location) => {
    if (blurSearchTimeoutRef.current) {
      clearTimeout(blurSearchTimeoutRef.current);
      blurSearchTimeoutRef.current = null;
    }

    setIntent((prev) => ({
      ...prev,
      queryText: location.name,
      categories: [],
      openNow: false,
      openAtMinutes: null,
    }));
    setIsSearchActive(false);
    setSelectedLocationId(location.id);
    cameraRef.current?.setCamera({
      centerCoordinate: [location.longitude, location.latitude],
      zoomLevel: 13,
      animationDuration: 320,
      animationMode: "easeTo",
    });
  }, []);

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
        key={styleURL}
        onCameraChanged={onCameraChanged}
        onMapIdle={onMapIdle}
        style={styles.map}
        styleURL={styleURL}
      >
        <Mapbox.Camera
          ref={cameraRef}
          defaultSettings={{
            centerCoordinate: initialCenterCoordinate,
            zoomLevel: 10,
          }}
        />
        <Mapbox.LocationPuck
          pulsing={{ color: "#3f6aa0", isEnabled: true, radius: "accuracy" }}
          puckBearing="heading"
          puckBearingEnabled
          visible
        />
        <Mapbox.ShapeSource
          cluster
          clusterMaxZoomLevel={11}
          clusterRadius={34}
          hitbox={{ width: 28, height: 28 }}
          id="locations-shape-source"
          onPress={onShapePress}
          ref={shapeSourceRef}
          shape={locationFeatureCollection}
        >
          <Mapbox.CircleLayer
            id="locations-cluster-circle"
            filter={["has", "point_count"]}
            style={{
              circleColor: "#5a321b",
              circleRadius: [
                "step",
                ["get", "point_count"],
                14,
                20,
                17,
                40,
                20,
              ],
              circleOpacity: 0.9,
              circleStrokeColor: "#fdfbf4",
              circleStrokeWidth: 2,
            }}
          />
          <Mapbox.SymbolLayer
            id="locations-cluster-count"
            filter={["has", "point_count"]}
            style={{
              textField: ["get", "point_count_abbreviated"],
              textColor: "#fdfbf4",
              textSize: 12,
              textFont: ["Open Sans Bold"],
              textAllowOverlap: true,
              textIgnorePlacement: true,
            }}
          />
          <Mapbox.CircleLayer
            id="locations-point-circle"
            filter={["!", ["has", "point_count"]]}
            style={{
              circleColor: "#5a321b",
              circleRadius: 8,
              circleOpacity: 0.95,
              circleStrokeColor: "#ffffff",
              circleStrokeWidth: 2,
            }}
          />
          <Mapbox.CircleLayer
            id="locations-point-selected"
            filter={[
              "all",
              ["!", ["has", "point_count"]],
              ["==", ["get", "locationId"], selectedLocationId ?? "__none__"],
            ]}
            style={{
              circleColor: "#7a4728",
              circleRadius: 10,
              circleOpacity: 1,
              circleStrokeColor: "#ffffff",
              circleStrokeWidth: 2,
            }}
          />
        </Mapbox.ShapeSource>
      </Mapbox.MapView>

      <View style={styles.searchContainer}>
        <View style={styles.searchInputWrapper}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            onBlur={onSearchBlur}
            onChangeText={(value) => setIntent((prev) => ({ ...prev, queryText: value }))}
            onFocus={onSearchFocus}
            placeholder="Find a study spot..."
            placeholderTextColor="#8c826f"
            style={styles.searchInput}
            value={intent.queryText}
          />
        </View>
        {isSearchActive && intent.queryText.trim().length > 0 && autocompleteSuggestions.length > 0 ? (
          <View style={styles.searchSuggestions}>
            {autocompleteSuggestions.map((suggestion) => (
              <Pressable
                key={suggestion.id}
                onPress={() => onSuggestionPress(suggestion)}
                style={styles.searchSuggestionItem}
              >
                <Text numberOfLines={1} style={styles.searchSuggestionTitle}>
                  {suggestion.name}
                </Text>
                <Text numberOfLines={1} style={styles.searchSuggestionSubtitle}>
                  {suggestion.address ?? "Address not available"}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>

      {isSearchActive ? (
        <>
          <View style={styles.filterBar}>
            <Pressable
              onPress={() => setIntent((prev) => ({ ...prev, openNow: !prev.openNow, openAtMinutes: null }))}
              style={[styles.filterChip, intent.openNow && styles.filterChipActive]}
            >
              <Text style={[styles.filterChipText, intent.openNow && styles.filterChipTextActive]}>
                Open Now
              </Text>
            </Pressable>

            <Pressable
              onPress={() => {
                setIntent((prev) => {
                  const nextQuiet = prev.minQuietLevel === 4 ? null : prev.minQuietLevel === 3 ? 4 : 3;
                  return { ...prev, minQuietLevel: nextQuiet };
                });
              }}
              style={[styles.filterChip, Boolean(intent.minQuietLevel) && styles.filterChipActive]}
            >
              <Text
                style={[
                  styles.filterChipText,
                  Boolean(intent.minQuietLevel) && styles.filterChipTextActive,
                ]}
              >
                {intent.minQuietLevel ? `Quiet ${intent.minQuietLevel}+` : "Quiet Any"}
              </Text>
            </Pressable>

            <Pressable
              onPress={() =>
                setIntent((prev) => ({
                  ...prev,
                  hasOutlets: prev.hasOutlets ? null : true,
                }))
              }
              style={[styles.filterChip, intent.hasOutlets === true && styles.filterChipActive]}
            >
              <Text style={[styles.filterChipText, intent.hasOutlets === true && styles.filterChipTextActive]}>
                Outlets
              </Text>
            </Pressable>
          </View>

          <View style={styles.filterBarSecondary}>
            <Pressable
              onPress={() =>
                setIntent((prev) => {
                  const currentIndex = OPEN_AT_OPTIONS.findIndex((value) => value === prev.openAtMinutes);
                  const nextIndex = currentIndex === OPEN_AT_OPTIONS.length - 1 ? 0 : currentIndex + 1;
                  return {
                    ...prev,
                    openNow: false,
                    openAtMinutes: OPEN_AT_OPTIONS[nextIndex],
                  };
                })
              }
              style={[styles.filterChip, intent.openAtMinutes !== null && styles.filterChipActive]}
            >
              <Text
                style={[styles.filterChipText, intent.openAtMinutes !== null && styles.filterChipTextActive]}
              >
                {`Open At ${formatMinutesLabel(intent.openAtMinutes)}`}
              </Text>
            </Pressable>

            {CATEGORY_CHIPS.map((chip) => (
              <Pressable
                key={chip.value}
                onPress={() =>
                  setIntent((prev) => {
                    const hasCategory = prev.categories.includes(chip.value);
                    const nextCategories = hasCategory
                      ? prev.categories.filter((value) => value !== chip.value)
                      : [...prev.categories, chip.value];
                    return { ...prev, categories: nextCategories };
                  })
                }
                style={[styles.filterChip, intent.categories.includes(chip.value) && styles.filterChipActive]}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    intent.categories.includes(chip.value) && styles.filterChipTextActive,
                  ]}
                >
                  {chip.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.filterBarTertiary}>
            <Pressable
              onPress={() =>
                setIntent((prev) => ({
                  ...prev,
                  ...parseNaturalLanguageToIntent(prev.queryText),
                }))
              }
              style={styles.filterChip}
            >
              <Text style={styles.filterChipText}>Apply Text Filters</Text>
            </Pressable>

            {hasActiveFilters ? (
              <Pressable
                onPress={() => setIntent(DEFAULT_SEARCH_INTENT)}
                style={[styles.filterChip, styles.filterChipReset]}
              >
                <Text style={styles.filterChipText}>Reset</Text>
              </Pressable>
            ) : null}
          </View>
        </>
      ) : null}

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
          <Pressable onPress={() => setIntent(DEFAULT_SEARCH_INTENT)} style={styles.retryButton}>
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
          {intent.openNow || intent.openAtMinutes !== null ? (
            <Text style={styles.selectionMeta}>
              {isLocationOpenNow(selectedLocation, new Date()) === false
                ? "Closed now"
                : "Open now or hours unavailable"}
            </Text>
          ) : null}
          <View style={styles.availabilityCard}>
            <Text style={styles.availabilityTitle}>
              {selectedLocationAvailability?.availability_label ?? "AI availability"}
            </Text>
            {availabilityLoading ? (
              <Text style={styles.selectionMeta}>Updating availability...</Text>
            ) : null}
            {!availabilityLoading && selectedLocationAvailability ? (
              <Text style={styles.selectionMeta}>
                {selectedLocationAvailability.occupancy_percent}% full • Confidence{" "}
                {Math.round(selectedLocationAvailability.confidence * 100)}%
              </Text>
            ) : null}
            {availabilityError ? <Text style={styles.selectionMeta}>{availabilityError}</Text> : null}
          </View>
          <Pressable
            disabled={!canCheckIn}
            onPress={() => onOpenCheckinsForLocation(selectedLocation.id)}
            style={({ pressed }) => [
              styles.checkinCtaButton,
              !canCheckIn && styles.occupancyButtonDisabled,
              pressed && styles.occupancyButtonPressed,
            ]}
          >
            <Text style={styles.checkinCtaButtonText}>Check In At This Spot</Text>
          </Pressable>
          {canCheckIn ? null : <Text style={styles.selectionMeta}>Sign in to check in.</Text>}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#efe8dc",
  },
  map: {
    flex: 1,
  },
  banner: {
    position: "absolute",
    marginHorizontal: 12,
    top: 12,
    left: 0,
    right: 0,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#d6c8b3",
    backgroundColor: "rgba(254, 249, 239, 0.95)",
    paddingHorizontal: 12,
    paddingVertical: 8,
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
  searchContainer: {
    position: "absolute",
    top: 14,
    left: 12,
    right: 12,
  },
  searchInputWrapper: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#ddd0bb",
    backgroundColor: "rgba(255, 253, 248, 0.98)",
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 12,
    paddingRight: 8,
  },
  searchSuggestions: {
    marginTop: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#ddd0bb",
    backgroundColor: "rgba(255, 253, 248, 0.98)",
    overflow: "hidden",
  },
  searchSuggestionItem: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: "#e8ddcb",
  },
  searchSuggestionTitle: {
    color: "#3e3e32",
    fontSize: 13,
    fontWeight: "700",
  },
  searchSuggestionSubtitle: {
    marginTop: 2,
    color: "#6d6b57",
    fontSize: 11,
  },
  searchIcon: {
    fontSize: 32,
    color: "#8c826f",
    marginRight: 6,
    marginTop: -1,
  },
  searchInput: {
    flex: 1,
    color: "#4a4a3d",
    fontSize: 16,
    paddingHorizontal: 4,
    paddingVertical: 11,
  },
  filterBar: {
    position: "absolute",
    top: 64,
    left: 12,
    right: 12,
    flexDirection: "row",
    gap: 8,
  },
  filterBarSecondary: {
    position: "absolute",
    top: 106,
    left: 12,
    right: 12,
    flexDirection: "row",
    gap: 8,
  },
  filterBarTertiary: {
    position: "absolute",
    top: 148,
    left: 12,
    right: 12,
    flexDirection: "row",
    gap: 8,
  },
  filterChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#dbcdb8",
    backgroundColor: "rgba(255, 253, 248, 0.95)",
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  filterChipActive: {
    borderColor: "#2f5634",
    backgroundColor: "#2f5634",
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
    top: 252,
    alignSelf: "center",
    borderRadius: 14,
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
    left: 12,
    right: 12,
    bottom: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#d6cdb8",
    backgroundColor: "rgba(255, 253, 248, 0.98)",
    paddingHorizontal: 14,
    paddingVertical: 11,
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
  selectionCard: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#d6cdb8",
    backgroundColor: "rgba(255, 253, 248, 0.98)",
    paddingHorizontal: 14,
    paddingVertical: 11,
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
  availabilityCard: {
    marginTop: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ddd0bb",
    backgroundColor: "#fbf8ef",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  availabilityTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: "#374c2f",
  },
  checkinCtaButton: {
    marginTop: 6,
    alignSelf: "flex-start",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#6d7a5a",
    backgroundColor: "#fdfbf4",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  occupancyButtonDisabled: {
    opacity: 0.6,
  },
  occupancyButtonPressed: {
    opacity: 0.75,
  },
  checkinCtaButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#334226",
  },
});
