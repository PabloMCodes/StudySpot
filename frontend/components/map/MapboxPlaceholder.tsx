import Mapbox, { type Camera, type MapState } from "@rnmapbox/maps";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, Easing, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import {
  applySearchIntent,
  DEFAULT_SEARCH_INTENT,
  isLocationOpenNow,
} from "../../services/locationFilterService";
import { getLocations, getLocationsInBounds } from "../../services/locationService";
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
  onLogLocationInteraction: (locationId: string, interactionType: "view" | "click") => Promise<void>;
}

const DEFAULT_CENTER: [number, number] = [-81.2001, 28.6024];
const MAX_VISIBLE_PINS = 15;
const TOP_RANKED_COUNT = 15;
const RECOMMENDATIONS_SHEET_COLLAPSE_OFFSET = 320;
const DISTANCE_OPTIONS_METERS: Array<number | null> = [null, 3219, 8047, 16093];

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const radius = 6_371_000;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const a = sinLat * sinLat + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * sinLng * sinLng;
  return radius * 2 * Math.asin(Math.sqrt(a));
}

function formatDistance(meters: number | null): string {
  if (meters === null) return "Distance unavailable";
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function formatDistanceFilterLabel(maxDistanceMeters: number | null): string {
  if (maxDistanceMeters === null) return "Any distance";
  const miles = Math.round(maxDistanceMeters / 1609.34);
  return `Within ${miles} mi`;
}

function isCafeOrCoffee(location: Location): boolean {
  const haystack = [
    location.name,
    location.category ?? "",
    ...(location.types ?? []),
    location.description ?? "",
    location.editorial_summary ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return (
    haystack.includes("cafe") ||
    haystack.includes("coffee") ||
    haystack.includes("coffee shop") ||
    haystack.includes("espresso")
  );
}

function getGoogleMapsUrl(location: Location): string {
  if (location.maps_url && location.maps_url.trim().length > 0) {
    return location.maps_url;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${location.latitude},${location.longitude}`)}`;
}

function getAppleMapsUrl(location: Location): string {
  const label = encodeURIComponent(location.name);
  return `http://maps.apple.com/?ll=${location.latitude},${location.longitude}&q=${label}`;
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
  onLogLocationInteraction,
}: MapboxPlaceholderProps) {
  const cameraRef = useRef<Camera>(null);
  const shapeSourceRef = useRef<any>(null);
  const hasAutoCenteredRef = useRef(false);
  const latestViewportRequestIdRef = useRef(0);
  const lastViewportBoundsRef = useRef<LocationBounds | null>(null);
  const [mapboxInitError, setMapboxInitError] = useState<string | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [intent, setIntent] = useState<SearchIntent>(DEFAULT_SEARCH_INTENT);
  const [viewportLocations, setViewportLocations] = useState<Location[]>(locations);
  const [viewportLoading, setViewportLoading] = useState(false);
  const [viewportError, setViewportError] = useState<string | null>(null);
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [autocompleteSuggestions, setAutocompleteSuggestions] = useState<Location[]>([]);
  const [autocompleteLoading, setAutocompleteLoading] = useState(false);
  const [selectedLocationAvailability, setSelectedLocationAvailability] = useState<CheckinAvailability | null>(null);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  const [showRecommendations, setShowRecommendations] = useState(true);
  const [recommendationsPage, setRecommendationsPage] = useState(0);
  const [maxDistanceMeters, setMaxDistanceMeters] = useState<number | null>(null);
  const [cafeOnly, setCafeOnly] = useState(false);
  const recommendationsVisibility = useRef(new Animated.Value(1)).current;
  const [topAvailabilityById, setTopAvailabilityById] = useState<Record<string, CheckinAvailability>>({});
  const blurSearchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const accessToken = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim() ?? "";
  const configuredStyleURL = process.env.EXPO_PUBLIC_MAPBOX_STYLE_URL?.trim();
  const [styleURL, setStyleURL] = useState<string>(configuredStyleURL ? configuredStyleURL : Mapbox.StyleURL.Street);
  const [styleLoadError, setStyleLoadError] = useState<string | null>(null);
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

    const existsInKnownPools =
      locations.some((location) => location.id === selectedLocationId) ||
      viewportLocations.some((location) => location.id === selectedLocationId) ||
      autocompleteSuggestions.some((location) => location.id === selectedLocationId);
    if (!existsInKnownPools) {
      setSelectedLocationId(null);
    }
  }, [autocompleteSuggestions, locations, selectedLocationId, viewportLocations]);

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
    (_state: MapState) => {
      // Keep recommendations stable (nearest known mapped study-friendly spots).
      // We intentionally do not replace them with viewport-bounded fetches.
    },
    [],
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

  const filteredLocations = useMemo(() => {
    const base = applySearchIntent(validLocations, intent);
    return base.filter((location) => {
      if (cafeOnly && !isCafeOrCoffee(location)) {
        return false;
      }
      if (maxDistanceMeters !== null && userCoordinates) {
        const distance = haversineMeters(
          userCoordinates.lat,
          userCoordinates.lng,
          location.latitude,
          location.longitude,
        );
        if (distance > maxDistanceMeters) {
          return false;
        }
      }
      return true;
    });
  }, [cafeOnly, intent, maxDistanceMeters, userCoordinates, validLocations]);

  const totalRecommendationPages = useMemo(
    () => Math.max(1, Math.ceil(filteredLocations.length / TOP_RANKED_COUNT)),
    [filteredLocations.length],
  );

  useEffect(() => {
    setRecommendationsPage((previous) => Math.min(previous, Math.max(0, totalRecommendationPages - 1)));
  }, [totalRecommendationPages]);

  const pageStart = recommendationsPage * TOP_RANKED_COUNT;
  const pageEnd = pageStart + TOP_RANKED_COUNT;

  const mapLocations = useMemo(
    () => filteredLocations.slice(pageStart, pageStart + MAX_VISIBLE_PINS),
    [filteredLocations, pageStart],
  );

  const topRankedLocations = useMemo(
    () => filteredLocations.slice(pageStart, pageEnd),
    [filteredLocations, pageEnd, pageStart],
  );

  const selectedLocation = useMemo(
    () =>
      validLocations.find((location) => location.id === selectedLocationId) ??
      autocompleteSuggestions.find((location) => location.id === selectedLocationId) ??
      locations.find((location) => location.id === selectedLocationId) ??
      null,
    [autocompleteSuggestions, locations, selectedLocationId, validLocations],
  );

  const topRankedWithDistance = useMemo(
    () =>
      topRankedLocations.map((location) => ({
        location,
        distanceMeters: userCoordinates
          ? haversineMeters(
              userCoordinates.lat,
              userCoordinates.lng,
              location.latitude,
              location.longitude,
            )
          : null,
      })),
    [topRankedLocations, userCoordinates],
  );

  const localAutocompleteFallback = useMemo(() => {
    const query = intent.queryText.trim().toLowerCase();
    if (!query) {
      return [] as Location[];
    }

    const compactQuery = query.replace(/[^a-z0-9]/g, "");
    const ranked = locations
      .filter((location) => {
        const haystack = `${location.name} ${location.address ?? ""} ${location.category ?? ""}`.toLowerCase();
        const compactHaystack = haystack.replace(/[^a-z0-9]/g, "");
        return haystack.includes(query) || (compactQuery.length > 0 && compactHaystack.includes(compactQuery));
      })
      .map((location) => {
        const name = location.name.toLowerCase();
        const compactName = name.replace(/[^a-z0-9]/g, "");
        const startsWithName = name.startsWith(query) || compactName.startsWith(compactQuery);
        const includesName = name.includes(query) || compactName.includes(compactQuery);
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
      maxDistanceMeters !== null ||
      cafeOnly,
    [cafeOnly, intent, maxDistanceMeters],
  );

  const locationFeatureCollection = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: "FeatureCollection",
      features: mapLocations.map((location) => {
        return {
          type: "Feature",
          id: location.id,
          properties: {
            locationId: location.id,
          },
          geometry: {
            type: "Point",
            coordinates: [location.longitude, location.latitude],
          },
        };
      }),
    }),
    [mapLocations],
  );

  useEffect(() => {
    return () => {
      if (blurSearchTimeoutRef.current) {
        clearTimeout(blurSearchTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (intent.queryText.trim().length > 0) {
      setShowRecommendations(true);
      setRecommendationsPage(0);
    }
  }, [intent.queryText]);

  useEffect(() => {
    setRecommendationsPage(0);
  }, [cafeOnly, intent.openNow, maxDistanceMeters]);

  useEffect(() => {
    Animated.timing(recommendationsVisibility, {
      toValue: showRecommendations ? 1 : 0,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [recommendationsVisibility, showRecommendations]);

  useEffect(() => {
    const query = intent.queryText.trim();
    if (!isSearchActive || query.length < 2) {
      setAutocompleteSuggestions([]);
      setAutocompleteLoading(false);
      return;
    }

    let cancelled = false;
    setAutocompleteLoading(true);
    const timer = setTimeout(() => {
      void getLocations({
        q: query,
        sort: "name",
        limit: 8,
      })
        .then((response) => {
          if (cancelled) {
            return;
          }
          if (response.success && response.data) {
            setAutocompleteSuggestions(response.data);
            return;
          }
          setAutocompleteSuggestions([]);
        })
        .catch(() => {
          if (cancelled) {
            return;
          }
          setAutocompleteSuggestions([]);
        })
        .finally(() => {
          if (!cancelled) {
            setAutocompleteLoading(false);
          }
        });
    }, 180);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [intent.queryText, isSearchActive]);

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
    let cancelled = false;
    const targetIds = topRankedLocations.map((location) => location.id);
    if (targetIds.length === 0) {
      setTopAvailabilityById({});
      return;
    }

    void Promise.all(
      targetIds.map(async (locationId) => {
        const result = await onLoadAvailability(locationId);
        return [locationId, result.availability] as const;
      }),
    ).then((entries) => {
      if (cancelled) return;
      const next: Record<string, CheckinAvailability> = {};
      entries.forEach(([locationId, availability]) => {
        if (availability) next[locationId] = availability;
      });
      setTopAvailabilityById(next);
    });

    return () => {
      cancelled = true;
    };
  }, [onLoadAvailability, topRankedLocations]);

  useEffect(() => {
    if (!selectedLocationId) return;
    void onLogLocationInteraction(selectedLocationId, "view");
  }, [onLogLocationInteraction, selectedLocationId]);

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
    setStyleURL(configuredStyleURL ? configuredStyleURL : Mapbox.StyleURL.Street);
    setStyleLoadError(null);
  }, [configuredStyleURL]);

  useEffect(() => {
    if (!userCoordinates || !cameraRef.current) {
      return;
    }

    if (hasAutoCenteredRef.current) {
      return;
    }

    cameraRef.current.setCamera({
      centerCoordinate: [userCoordinates.lng, userCoordinates.lat],
      zoomLevel: 11.5,
      animationDuration: 450,
      animationMode: "easeTo",
    });
    hasAutoCenteredRef.current = true;
  }, [userCoordinates]);

  const recenterToUser = useCallback(() => {
    if (!userCoordinates || !cameraRef.current) {
      return;
    }
    cameraRef.current.setCamera({
      centerCoordinate: [userCoordinates.lng, userCoordinates.lat],
      zoomLevel: 11.5,
      animationDuration: 350,
      animationMode: "easeTo",
    });
  }, [userCoordinates]);

  const onShapePress = useCallback((event: any) => {
    const feature = event?.features?.[0];
    if (!feature) {
      return;
    }
    const coordinates = feature.geometry?.coordinates;

    if (!Array.isArray(coordinates) || coordinates.length < 2 || !cameraRef.current) {
      return;
    }

    const locationId = feature.properties?.locationId;
    if (typeof locationId === "string") {
      void onLogLocationInteraction(locationId, "click");
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
  }, [onLogLocationInteraction]);

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
      openNow: false,
    }));
    setIsSearchActive(false);
    setSelectedLocationId(location.id);
    void onLogLocationInteraction(location.id, "click");
    cameraRef.current?.setCamera({
      centerCoordinate: [location.longitude, location.latitude],
      zoomLevel: 13,
      animationDuration: 320,
      animationMode: "easeTo",
    });
  }, [onLogLocationInteraction]);

  const openExternalMap = useCallback((url: string) => {
    void Linking.openURL(url);
  }, []);

  const combinedError = viewportError ?? error;
  const mapIsLoading = loading || viewportLoading;
  const mapDiagnostics = styleLoadError;
  const displayedAutocompleteSuggestions = autocompleteSuggestions.length > 0
    ? autocompleteSuggestions
    : localAutocompleteFallback;

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
        onDidFailLoadingMap={() => {
          if (styleURL !== Mapbox.StyleURL.Street) {
            setStyleURL(Mapbox.StyleURL.Street);
            setStyleLoadError("Custom Mapbox style failed to load. Switched to default Mapbox Street style.");
            return;
          }
          setStyleLoadError("Mapbox failed to load map tiles.");
        }}
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
          hitbox={{ width: 28, height: 28 }}
          id="locations-shape-source"
          onPress={onShapePress}
          ref={shapeSourceRef}
          shape={locationFeatureCollection}
        >
          <Mapbox.CircleLayer
            id="locations-point-circle"
            style={{
              circleColor: "#7A5C3B",
              circleRadius: 7,
              circleOpacity: 0.95,
              circleStrokeColor: "#ffffff",
              circleStrokeWidth: 1.5,
            }}
          />
          <Mapbox.CircleLayer
            id="locations-point-selected"
            filter={["==", ["get", "locationId"], selectedLocationId ?? "__none__"] as any}
            style={{
              circleColor: "#2F5634",
              circleRadius: 9,
              circleOpacity: 1,
              circleStrokeColor: "#ffffff",
              circleStrokeWidth: 2.5,
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
        {isSearchActive && intent.queryText.trim().length > 0 && displayedAutocompleteSuggestions.length > 0 ? (
          <View style={styles.searchSuggestions}>
            {displayedAutocompleteSuggestions.map((suggestion) => (
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
            {autocompleteLoading ? (
              <View style={styles.searchSuggestionLoading}>
                <Text style={styles.searchSuggestionSubtitle}>Searching...</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>

      {userCoordinates ? (
        <Pressable onPress={recenterToUser} style={styles.recenterButton}>
          <Text style={styles.recenterButtonText}>◎</Text>
        </Pressable>
      ) : null}

      <View style={styles.filterBar}>
        <Pressable
          onPress={() => setIntent((prev) => ({ ...prev, openNow: !prev.openNow }))}
          style={[styles.filterChip, intent.openNow && styles.filterChipActive]}
        >
          <Text style={[styles.filterChipText, intent.openNow && styles.filterChipTextActive]}>Open Now</Text>
        </Pressable>

        <Pressable
          onPress={() => {
            setMaxDistanceMeters((previous) => {
              const currentIndex = DISTANCE_OPTIONS_METERS.findIndex((value) => value === previous);
              const nextIndex = currentIndex === DISTANCE_OPTIONS_METERS.length - 1 ? 0 : currentIndex + 1;
              return DISTANCE_OPTIONS_METERS[nextIndex];
            });
          }}
          style={[styles.filterChip, maxDistanceMeters !== null && styles.filterChipActive]}
        >
          <Text style={[styles.filterChipText, maxDistanceMeters !== null && styles.filterChipTextActive]}>
            {formatDistanceFilterLabel(maxDistanceMeters)}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setCafeOnly((previous) => !previous)}
          style={[styles.filterChip, cafeOnly && styles.filterChipActive]}
        >
          <Text style={[styles.filterChipText, cafeOnly && styles.filterChipTextActive]}>
            Cafes/Coffee
          </Text>
        </Pressable>

        {hasActiveFilters ? (
          <Pressable
            onPress={() => {
              setIntent(DEFAULT_SEARCH_INTENT);
              setMaxDistanceMeters(null);
              setCafeOnly(false);
            }}
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

      {mapDiagnostics ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>Map diagnostics</Text>
          <Text style={styles.errorText}>{mapDiagnostics}</Text>
        </View>
      ) : null}

      {!mapIsLoading && !combinedError && filteredLocations.length === 0 ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>No locations match these filters</Text>
          <Text style={styles.errorText}>Try widening the map or resetting filters.</Text>
          <Pressable
            onPress={() => {
              setIntent(DEFAULT_SEARCH_INTENT);
              setMaxDistanceMeters(null);
              setCafeOnly(false);
            }}
            style={styles.retryButton}
          >
            <Text style={styles.retryButtonText}>Reset Filters</Text>
          </Pressable>
        </View>
      ) : null}

      {!mapIsLoading && !combinedError && topRankedWithDistance.length > 0 ? (
        <Animated.View
          pointerEvents={showRecommendations ? "auto" : "none"}
          style={[
            styles.rankedSheet,
            {
              opacity: recommendationsVisibility,
              transform: [
                {
                  translateY: recommendationsVisibility.interpolate({
                    inputRange: [0, 1],
                    outputRange: [RECOMMENDATIONS_SHEET_COLLAPSE_OFFSET, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <View style={styles.rankedHeaderRow}>
            <Text style={styles.rankedTitle}>Nearest study-friendly spots</Text>
            <View style={styles.rankedHeaderActions}>
              <Pressable
                disabled={recommendationsPage <= 0}
                onPress={() => setRecommendationsPage((previous) => Math.max(0, previous - 1))}
                style={[styles.rankedNavChip, recommendationsPage <= 0 && styles.rankedNavChipDisabled]}
              >
                <Text style={styles.rankedNavText}>←</Text>
              </Pressable>
              <Text style={styles.rankedPageText}>{`${recommendationsPage + 1}/${totalRecommendationPages}`}</Text>
              <Pressable
                disabled={recommendationsPage >= totalRecommendationPages - 1}
                onPress={() => setRecommendationsPage((previous) => Math.min(totalRecommendationPages - 1, previous + 1))}
                style={[
                  styles.rankedNavChip,
                  recommendationsPage >= totalRecommendationPages - 1 && styles.rankedNavChipDisabled,
                ]}
              >
                <Text style={styles.rankedNavText}>→</Text>
              </Pressable>
              <Pressable onPress={() => setShowRecommendations(false)} style={styles.rankedToggleChip}>
                <Text style={styles.rankedToggleText}>Hide</Text>
              </Pressable>
            </View>
          </View>
          <ScrollView
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
            style={styles.rankedScroll}
            contentContainerStyle={styles.rankedScrollContent}
          >
            {topRankedWithDistance.map(({ location, distanceMeters }) => {
              const occupancy = topAvailabilityById[location.id]?.occupancy_percent ?? null;
              const availabilityPercent = occupancy === null ? null : Math.max(0, 100 - occupancy);
              const isExpanded = selectedLocationId === location.id;
              return (
                <Pressable
                  key={location.id}
                  onPress={() => {
                    setSelectedLocationId(location.id);
                    void onLogLocationInteraction(location.id, "click");
                    cameraRef.current?.setCamera({
                      centerCoordinate: [location.longitude, location.latitude],
                      zoomLevel: 13,
                      animationDuration: 280,
                      animationMode: "easeTo",
                    });
                  }}
                  style={[styles.rankedCard, isExpanded && styles.rankedCardExpanded]}
                >
                <View style={styles.rankedCardTopRow}>
                  <Text numberOfLines={1} style={styles.rankedName}>{location.name}</Text>
                  <Text style={styles.rankedAvailability}>
                    {availabilityPercent === null ? "--%" : `${availabilityPercent}% open`}
                  </Text>
                </View>
                <Text numberOfLines={1} style={styles.rankedMeta}>
                  {location.quiet_level >= 4 ? "quiet" : "moderate noise"} • {location.has_outlets ? "outlets" : "no outlet data"} • {formatDistance(distanceMeters)}
                </Text>
                {isExpanded ? (
                  <View style={styles.rankedExpandedDetails}>
                    <Text style={styles.rankedDetailText}>
                      {availabilityPercent === null
                        ? "Seat availability estimate is unavailable right now."
                        : `Seat availability: ${availabilityPercent}% (higher means it should be easier to find a seat).`}
                    </Text>
                    <Text style={styles.rankedDetailText}>{location.address ?? "Address not available"}</Text>
                    <Text style={styles.rankedDetailText}>
                      {isLocationOpenNow(location, new Date()) === false ? "Closed now" : "Open now or hours unavailable"}
                    </Text>
                    <Text style={styles.rankedDetailText}>
                      Confidence: {Math.round((topAvailabilityById[location.id]?.confidence ?? 0.5) * 100)}% (higher means we have stronger recent data)
                    </Text>
                      <View style={styles.mapLinksRow}>
                        <Pressable
                          onPress={() => openExternalMap(getGoogleMapsUrl(location))}
                          style={styles.mapLinkChip}
                        >
                          <Text style={styles.mapLinkText}>Google Maps</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => openExternalMap(getAppleMapsUrl(location))}
                          style={styles.mapLinkChip}
                        >
                          <Text style={styles.mapLinkText}>Apple Maps</Text>
                        </Pressable>
                      </View>
                      <Pressable
                        disabled={!canCheckIn}
                        onPress={() => onOpenCheckinsForLocation(location.id)}
                        style={({ pressed }) => [
                          styles.checkinCtaButton,
                          !canCheckIn && styles.occupancyButtonDisabled,
                          pressed && styles.occupancyButtonPressed,
                        ]}
                      >
                        <Text style={styles.checkinCtaButtonText}>Check In At This Spot</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </Animated.View>
      ) : null}
      {!mapIsLoading && !combinedError && topRankedWithDistance.length > 0 ? (
        <Animated.View
          pointerEvents={showRecommendations ? "none" : "auto"}
          style={{
            opacity: recommendationsVisibility.interpolate({
              inputRange: [0, 1],
              outputRange: [1, 0],
            }),
            transform: [
              {
                translateY: recommendationsVisibility.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 8],
                }),
              },
            ],
          }}
        >
          <Pressable onPress={() => setShowRecommendations(true)} style={styles.rankedCollapsedHandle}>
            <Text style={styles.rankedCollapsedHandleText}>Show spots</Text>
          </Pressable>
        </Animated.View>
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
  recenterButton: {
    position: "absolute",
    right: 12,
    bottom: 120,
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: "#d8cfba",
    backgroundColor: "rgba(253, 251, 244, 0.97)",
    alignItems: "center",
    justifyContent: "center",
  },
  recenterButtonText: {
    fontSize: 18,
    color: "#334226",
    fontWeight: "800",
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
  searchSuggestionLoading: {
    paddingHorizontal: 12,
    paddingVertical: 8,
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
    bottom: 180,
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
  rankedSheet: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#d6cdb8",
    backgroundColor: "rgba(255, 253, 248, 0.98)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    maxHeight: 320,
  },
  rankedScroll: {
    maxHeight: 270,
  },
  rankedScrollContent: {
    gap: 8,
    paddingBottom: 2,
  },
  rankedTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#334226",
  },
  rankedHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  rankedHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  rankedNavChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#c8d8bf",
    backgroundColor: "#eef7e8",
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  rankedNavChipDisabled: {
    opacity: 0.4,
  },
  rankedNavText: {
    fontSize: 14,
    color: "#2f5634",
    fontWeight: "800",
    marginTop: -1,
  },
  rankedPageText: {
    fontSize: 11,
    color: "#4f5d48",
    fontWeight: "700",
    minWidth: 34,
    textAlign: "center",
  },
  rankedToggleChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#c8d8bf",
    backgroundColor: "#eef7e8",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  rankedToggleText: {
    fontSize: 11,
    color: "#2f5634",
    fontWeight: "700",
  },
  rankedCollapsedHandle: {
    position: "absolute",
    right: 12,
    bottom: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#c8d8bf",
    backgroundColor: "rgba(238, 247, 232, 0.98)",
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  rankedCollapsedHandleText: {
    fontSize: 12,
    color: "#2f5634",
    fontWeight: "700",
  },
  rankedCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5dac7",
    backgroundColor: "#fffaf0",
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 3,
  },
  rankedCardExpanded: {
    borderColor: "#bccfaf",
    backgroundColor: "#f7fbf4",
  },
  rankedExpandedDetails: {
    marginTop: 6,
    gap: 4,
  },
  rankedDetailText: {
    fontSize: 11,
    color: "#4f5d48",
    fontWeight: "600",
  },
  mapLinksRow: {
    marginTop: 2,
    flexDirection: "row",
    gap: 8,
  },
  mapLinkChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#b9ccb2",
    backgroundColor: "#f1f8ed",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  mapLinkText: {
    fontSize: 11,
    color: "#2f5634",
    fontWeight: "700",
  },
  rankedCardTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  rankedName: {
    flex: 1,
    fontSize: 13,
    color: "#344131",
    fontWeight: "700",
  },
  rankedAvailability: {
    fontSize: 12,
    color: "#2f5634",
    fontWeight: "800",
  },
  rankedMeta: {
    fontSize: 11,
    color: "#676857",
    fontWeight: "600",
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
