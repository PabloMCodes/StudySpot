import Mapbox, { type Camera, type MapState } from "@rnmapbox/maps";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Linking,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  applySearchIntent,
  DEFAULT_SEARCH_INTENT,
} from "../../services/locationFilterService";
import { LocationDetailScreen } from "../../screens/LocationDetailScreen";
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
  accessToken: string | null;
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
const MAX_VISIBLE_PINS = 50;
const MAX_VISIBLE_CARDS = 50;
const MAP_IDLE_DEBOUNCE_MS = 220;
const ZOOM_CHANGE_THRESHOLD = 0.2;
const SHEET_BOTTOM_OFFSET = 12;
const SHEET_TOP_RESERVED = 120;
const SHEET_MIN_HEIGHT = 72;
const SHEET_DEFAULT_HEIGHT = 300;

type SortingMode = "best_spots" | "highest_availability" | "closest";
type CategoryFilter = "all" | "cafe" | "library" | "bookstore";

interface ViewportState {
  bounds: LocationBounds;
  zoomLevel: number | null;
  center: UserCoordinates;
}

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

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function MapboxPlaceholder({
  accessToken,
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
  const mapRef = useRef<any>(null);
  const cameraRef = useRef<Camera>(null);
  const shapeSourceRef = useRef<any>(null);
  const cardsListRef = useRef<FlatList<Location>>(null);
  const mapIdleDebounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasLoadedInitialViewportRef = useRef(false);
  const hasAutoCenteredRef = useRef(false);
  const lastSeenViewportRef = useRef<ViewportState | null>(null);
  const activeViewportRef = useRef<ViewportState | null>(null);
  const [mapboxInitError, setMapboxInitError] = useState<string | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [intent, setIntent] = useState<SearchIntent>(DEFAULT_SEARCH_INTENT);
  const [sortingMode, setSortingMode] = useState<SortingMode>("best_spots");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [viewportLocations, setViewportLocations] = useState<Location[]>([]);
  const [pendingViewport, setPendingViewport] = useState<ViewportState | null>(null);
  const [viewportLoading, setViewportLoading] = useState(false);
  const [viewportError, setViewportError] = useState<string | null>(null);
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [autocompleteSuggestions, setAutocompleteSuggestions] = useState<Location[]>([]);
  const [autocompleteLoading, setAutocompleteLoading] = useState(false);
  const [externalMapError, setExternalMapError] = useState<string | null>(null);
  const [mapContainerHeight, setMapContainerHeight] = useState(0);
  const resolvedMapHeight = mapContainerHeight > 0 ? mapContainerHeight : 560;
  const maxSheetHeight = Math.max(SHEET_MIN_HEIGHT + 40, resolvedMapHeight - SHEET_TOP_RESERVED);
  const initialSheetHeight = clamp(Math.min(SHEET_DEFAULT_HEIGHT, maxSheetHeight), SHEET_MIN_HEIGHT, maxSheetHeight);
  const sheetHeightAnim = useRef(new Animated.Value(initialSheetHeight)).current;
  const sheetHeightRef = useRef(initialSheetHeight);
  const sheetStartHeightRef = useRef(initialSheetHeight);
  const [topAvailabilityById, setTopAvailabilityById] = useState<Record<string, CheckinAvailability>>({});
  const blurSearchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mapboxAccessToken = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim() ?? "";
  const configuredStyleURL = process.env.EXPO_PUBLIC_MAPBOX_STYLE_URL?.trim();
  const [styleURL, setStyleURL] = useState<string>(configuredStyleURL ? configuredStyleURL : Mapbox.StyleURL.Street);
  const [styleLoadError, setStyleLoadError] = useState<string | null>(null);
  const initialCenterCoordinate: [number, number] = userCoordinates
    ? [userCoordinates.lng, userCoordinates.lat]
    : DEFAULT_CENTER;

  const dedupeLocations = useCallback((incoming: Location[]) => {
    const byId = new Map<string, Location>();
    incoming.forEach((location) => {
      if (!byId.has(location.id)) {
        byId.set(location.id, location);
      }
    });
    return Array.from(byId.values());
  }, []);

  const extractZoomLevel = useCallback((state: MapState): number | null => {
    const rawCandidates = [
      (state as any)?.properties?.zoom,
      (state as any)?.properties?.zoomLevel,
      (state as any)?.zoom,
      (state as any)?.zoomLevel,
    ];
    for (const candidate of rawCandidates) {
      const numeric = Number(candidate);
      if (Number.isFinite(numeric)) {
        return numeric;
      }
    }
    return null;
  }, []);

  const toViewportState = useCallback(
    (state: MapState): ViewportState | null => {
      const bounds = boundsFromCameraState(state);
      if (!bounds) {
        return null;
      }
      return {
        bounds,
        zoomLevel: extractZoomLevel(state),
        center: {
          lat: (bounds.minLat + bounds.maxLat) / 2,
          lng: (bounds.minLng + bounds.maxLng) / 2,
        },
      };
    },
    [extractZoomLevel],
  );

  const viewportFromVisibleBounds = useCallback((visibleBounds: unknown): ViewportState | null => {
    if (!Array.isArray(visibleBounds) || visibleBounds.length < 2) {
      return null;
    }
    const a = visibleBounds[0];
    const b = visibleBounds[1];
    if (!Array.isArray(a) || !Array.isArray(b) || a.length < 2 || b.length < 2) {
      return null;
    }
    const lng1 = Number(a[0]);
    const lat1 = Number(a[1]);
    const lng2 = Number(b[0]);
    const lat2 = Number(b[1]);
    if (![lng1, lat1, lng2, lat2].every(Number.isFinite)) {
      return null;
    }
    const bounds = {
      minLat: Math.min(lat1, lat2),
      maxLat: Math.max(lat1, lat2),
      minLng: Math.min(lng1, lng2),
      maxLng: Math.max(lng1, lng2),
    };
    return {
      bounds,
      zoomLevel: lastSeenViewportRef.current?.zoomLevel ?? activeViewportRef.current?.zoomLevel ?? null,
      center: {
        lat: (bounds.minLat + bounds.maxLat) / 2,
        lng: (bounds.minLng + bounds.maxLng) / 2,
      },
    };
  }, []);

  const didViewportChange = useCallback((previous: ViewportState | null, next: ViewportState) => {
    if (!previous) {
      return true;
    }
    const boundsChanged = didBoundsChange(previous.bounds, next.bounds);
    const previousZoom = previous.zoomLevel;
    const nextZoom = next.zoomLevel;
    if (previousZoom === null || nextZoom === null) {
      return boundsChanged;
    }
    return boundsChanged || Math.abs(previousZoom - nextZoom) > ZOOM_CHANGE_THRESHOLD;
  }, []);

  const runViewportSearch = useCallback(async (viewport: ViewportState) => {
    setViewportLoading(true);
    setViewportError(null);

    try {
      const response = await getLocationsInBounds(viewport.bounds, {
        lat: viewport.center.lat,
        lng: viewport.center.lng,
        zoom_level: viewport.zoomLevel ?? undefined,
        sort: sortingMode,
        limit: MAX_VISIBLE_CARDS,
      });

      if (!response.success || !response.data) {
        setViewportError(response.error ?? "Failed to load viewport locations");
        return;
      }

      setViewportLocations(dedupeLocations(response.data));
      activeViewportRef.current = viewport;
      setPendingViewport(null);
    } catch {
      setViewportError("Failed to load viewport locations");
    } finally {
      setViewportLoading(false);
    }
  }, [dedupeLocations, sortingMode]);

  const onSearchThisArea = useCallback(async () => {
    if (viewportLoading) {
      return;
    }
    let viewport: ViewportState | null = null;
    try {
      const visibleBounds = await mapRef.current?.getVisibleBounds?.();
      viewport = viewportFromVisibleBounds(visibleBounds);
    } catch {
      viewport = null;
    }
    if (!viewport) {
      viewport = pendingViewport ?? lastSeenViewportRef.current ?? activeViewportRef.current;
    }
    if (!viewport) {
      return;
    }
    await runViewportSearch(viewport);
  }, [pendingViewport, runViewportSearch, viewportFromVisibleBounds, viewportLoading]);

  const onMapIdle = useCallback(
    (state: MapState) => {
      const viewport = toViewportState(state);
      if (!viewport) {
        return;
      }
      lastSeenViewportRef.current = viewport;

      if (mapIdleDebounceTimeoutRef.current) {
        clearTimeout(mapIdleDebounceTimeoutRef.current);
      }

      mapIdleDebounceTimeoutRef.current = setTimeout(() => {
        if (!hasLoadedInitialViewportRef.current) {
          hasLoadedInitialViewportRef.current = true;
          setPendingViewport(viewport);
          void runViewportSearch(viewport);
          return;
        }

        if (didViewportChange(activeViewportRef.current, viewport)) {
          setPendingViewport(viewport);
          return;
        }

        setPendingViewport(null);
      }, MAP_IDLE_DEBOUNCE_MS);
    },
    [didViewportChange, runViewportSearch, toViewportState],
  );

  const onCameraChanged = useCallback(
    (state: MapState) => {
      const viewport = toViewportState(state);
      if (!viewport) {
        return;
      }
      lastSeenViewportRef.current = viewport;
      if (!hasLoadedInitialViewportRef.current) {
        return;
      }
      if (didViewportChange(activeViewportRef.current, viewport) || didViewportChange(pendingViewport, viewport)) {
        setPendingViewport(viewport);
      }
    },
    [didViewportChange, pendingViewport, toViewportState],
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

  useEffect(() => {
    if (!selectedLocationId) {
      return;
    }
    const exists = validLocations.some((location) => location.id === selectedLocationId);
    if (!exists) {
      setSelectedLocationId(null);
    }
  }, [selectedLocationId, validLocations]);

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
      categoryFilter !== "all" ||
      sortingMode !== "best_spots",
    [categoryFilter, intent, sortingMode],
  );
  const shouldHideFiltersWhileSearching = isSearchActive && intent.queryText.trim().length > 0;

  const getDistanceFromActiveMapCenter = useCallback((location: Location): number | null => {
    const activeCenter = activeViewportRef.current?.center
      ?? pendingViewport?.center
      ?? lastSeenViewportRef.current?.center
      ?? (userCoordinates ? { lat: userCoordinates.lat, lng: userCoordinates.lng } : null)
      ?? { lat: DEFAULT_CENTER[1], lng: DEFAULT_CENTER[0] };
    if (!activeCenter) {
      return null;
    }
    return haversineMeters(activeCenter.lat, activeCenter.lng, location.latitude, location.longitude);
  }, [pendingViewport, userCoordinates]);

  const sortedLocations = useMemo(() => {
    const withScores = validLocations.map((location) => {
      const availability = topAvailabilityById[location.id];
      const occupancyPercent = availability?.occupancy_percent ?? null;
      const availabilityScore = occupancyPercent === null ? 0.5 : Math.max(0, Math.min(1, (100 - occupancyPercent) / 100));
      const confidence = availability?.confidence ?? 0.5;
      const distanceMeters = getDistanceFromActiveMapCenter(location);
      const distanceScore = distanceMeters === null
        ? 0.5
        : Math.max(0, Math.min(1, 1 - Math.min(distanceMeters, 5000) / 5000));
      const bestScore = (availabilityScore * 0.65) + (distanceScore * 0.25) + (confidence * 0.10);
      return {
        location,
        occupancyPercent,
        availabilityScore,
        confidence,
        distanceMeters,
        bestScore,
      };
    });

    if (sortingMode === "highest_availability") {
      return withScores
        .sort((a, b) => {
          if (b.availabilityScore !== a.availabilityScore) return b.availabilityScore - a.availabilityScore;
          if (b.confidence !== a.confidence) return b.confidence - a.confidence;
          if (a.distanceMeters !== null && b.distanceMeters !== null && a.distanceMeters !== b.distanceMeters) {
            return a.distanceMeters - b.distanceMeters;
          }
          return a.location.name.localeCompare(b.location.name);
        })
        .map((item) => item.location);
    }

    if (sortingMode === "closest") {
      return withScores
        .sort((a, b) => {
          if (a.distanceMeters !== null && b.distanceMeters !== null && a.distanceMeters !== b.distanceMeters) {
            return a.distanceMeters - b.distanceMeters;
          }
          if (a.distanceMeters === null && b.distanceMeters !== null) return 1;
          if (a.distanceMeters !== null && b.distanceMeters === null) return -1;
          return a.location.name.localeCompare(b.location.name);
        })
        .map((item) => item.location);
    }

    return withScores
      .sort((a, b) => {
        if (b.bestScore !== a.bestScore) return b.bestScore - a.bestScore;
        return a.location.name.localeCompare(b.location.name);
      })
      .map((item) => item.location);
  }, [getDistanceFromActiveMapCenter, sortingMode, topAvailabilityById, validLocations]);

  const filteredLocations = useMemo(() => {
    const effectiveIntent = {
      ...intent,
      categories: categoryFilter === "all" ? [] : [categoryFilter],
    };
    const base = applySearchIntent(sortedLocations, effectiveIntent);
    return base.slice(0, MAX_VISIBLE_CARDS);
  }, [categoryFilter, intent, sortedLocations]);

  const mapLocations = useMemo(() => filteredLocations.slice(0, MAX_VISIBLE_PINS), [filteredLocations]);
  const locationIndexById = useMemo(() => {
    const next: Record<string, number> = {};
    filteredLocations.forEach((location, index) => {
      next[location.id] = index;
    });
    return next;
  }, [filteredLocations]);

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
    if (validLocations.length > 0 || locations.length === 0) {
      return;
    }
    setViewportLocations(dedupeLocations(locations));
  }, [dedupeLocations, locations, validLocations.length]);

  useEffect(() => {
    return () => {
      if (mapIdleDebounceTimeoutRef.current) {
        clearTimeout(mapIdleDebounceTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const clamped = clamp(sheetHeightRef.current, SHEET_MIN_HEIGHT, maxSheetHeight);
    sheetHeightRef.current = clamped;
    sheetHeightAnim.setValue(clamped);
  }, [maxSheetHeight, sheetHeightAnim]);

  const sheetPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 2,
        onMoveShouldSetPanResponderCapture: (_, gesture) => Math.abs(gesture.dy) > 2,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          sheetStartHeightRef.current = sheetHeightRef.current;
        },
        onPanResponderMove: (_, gesture) => {
          const next = clamp(sheetStartHeightRef.current - gesture.dy, SHEET_MIN_HEIGHT, maxSheetHeight);
          sheetHeightRef.current = next;
          sheetHeightAnim.setValue(next);
        },
        onPanResponderRelease: (_, gesture) => {
          const projected = clamp(
            sheetStartHeightRef.current - gesture.dy - gesture.vy * 58,
            SHEET_MIN_HEIGHT,
            maxSheetHeight,
          );
          sheetHeightRef.current = projected;
          Animated.spring(sheetHeightAnim, {
            toValue: projected,
            damping: 18,
            stiffness: 220,
            mass: 0.55,
            useNativeDriver: false,
          }).start();
        },
      }),
    [maxSheetHeight, sheetHeightAnim],
  );

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
    const targetIds = validLocations.map((location) => location.id);
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
  }, [onLoadAvailability, validLocations]);

  useEffect(() => {
    if (!selectedLocationId) return;
    void onLogLocationInteraction(selectedLocationId, "view");
  }, [onLogLocationInteraction, selectedLocationId]);

  useEffect(() => {
    let isActive = true;

    if (!mapboxAccessToken) {
      setMapboxInitError("Missing EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN in frontend/.env.local");
      return () => {
        isActive = false;
      };
    }

    Mapbox.setAccessToken(mapboxAccessToken)
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
  }, [mapboxAccessToken]);

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

    if (!Array.isArray(coordinates) || coordinates.length < 2) {
      return;
    }

    const locationId = feature.properties?.locationId;
    if (typeof locationId === "string") {
      void onLogLocationInteraction(locationId, "click");
      setSelectedLocationId((previousId) => {
        if (previousId === locationId) {
          return null;
        }
        const cardIndex = locationIndexById[locationId];
        if (Number.isFinite(cardIndex)) {
          cardsListRef.current?.scrollToIndex({ animated: true, index: cardIndex });
        }

        return locationId;
      });
    }
  }, [locationIndexById, onLogLocationInteraction]);

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

  const combinedError = viewportError ?? error;
  const mapIsLoading = loading || viewportLoading;
  const mapDiagnostics = styleLoadError;
  const displayedAutocompleteSuggestions = autocompleteSuggestions.length > 0
    ? autocompleteSuggestions
    : localAutocompleteFallback;

  const openExternalMap = useCallback(async (url: string) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        setExternalMapError("Unable to open maps link on this device.");
        return;
      }
      await Linking.openURL(url);
      setExternalMapError(null);
    } catch {
      setExternalMapError("Unable to open maps link right now.");
    }
  }, []);

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
    <View
      onLayout={(event) => {
        const nextHeight = event.nativeEvent.layout.height;
        if (Number.isFinite(nextHeight) && nextHeight > 0) {
          setMapContainerHeight(nextHeight);
        }
      }}
      style={styles.container}
    >
      <Mapbox.MapView
        ref={mapRef}
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

      {!mapIsLoading ? (
        <View style={styles.searchAreaButtonWrap}>
          <Pressable onPress={onSearchThisArea} style={styles.searchAreaButton}>
            <Text style={styles.searchAreaButtonText}>Search this area</Text>
          </Pressable>
        </View>
      ) : null}

      {!shouldHideFiltersWhileSearching ? (
        <>
          <View style={styles.filterBar}>
            <Pressable
              onPress={() => setIntent((prev) => ({ ...prev, openNow: !prev.openNow }))}
              style={[styles.filterChip, intent.openNow && styles.filterChipActive]}
            >
              <Text style={[styles.filterChipText, intent.openNow && styles.filterChipTextActive]}>Open Now</Text>
            </Pressable>

            <Pressable
              onPress={() => {
                setCategoryFilter((previous) => {
                  if (previous === "all") return "cafe";
                  if (previous === "cafe") return "library";
                  if (previous === "library") return "bookstore";
                  return "all";
                });
              }}
              style={[styles.filterChip, categoryFilter !== "all" && styles.filterChipActive]}
            >
              <Text style={[styles.filterChipText, categoryFilter !== "all" && styles.filterChipTextActive]}>
                {categoryFilter === "all" ? "Category: All" : `Category: ${categoryFilter}`}
              </Text>
            </Pressable>

            {hasActiveFilters ? (
              <Pressable
                onPress={() => {
                  setIntent(DEFAULT_SEARCH_INTENT);
                  setCategoryFilter("all");
                  setSortingMode("best_spots");
                }}
                style={[styles.filterChip, styles.filterChipReset]}
              >
                <Text style={styles.filterChipText}>Reset</Text>
              </Pressable>
            ) : null}
          </View>

          <View style={styles.filterBarSecondary}>
            <Pressable
              onPress={() => setSortingMode("best_spots")}
              style={[styles.filterChip, sortingMode === "best_spots" && styles.filterChipActive]}
            >
              <Text style={[styles.filterChipText, sortingMode === "best_spots" && styles.filterChipTextActive]}>Best Spots</Text>
            </Pressable>
            <Pressable
              onPress={() => setSortingMode("highest_availability")}
              style={[styles.filterChip, sortingMode === "highest_availability" && styles.filterChipActive]}
            >
              <Text style={[styles.filterChipText, sortingMode === "highest_availability" && styles.filterChipTextActive]}>Highest Availability</Text>
            </Pressable>
            <Pressable
              onPress={() => setSortingMode("closest")}
              style={[styles.filterChip, sortingMode === "closest" && styles.filterChipActive]}
            >
              <Text style={[styles.filterChipText, sortingMode === "closest" && styles.filterChipTextActive]}>Closest</Text>
            </Pressable>
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

      {mapDiagnostics ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>Map diagnostics</Text>
          <Text style={styles.errorText}>{mapDiagnostics}</Text>
        </View>
      ) : null}

      {externalMapError ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>External link error</Text>
          <Text style={styles.errorText}>{externalMapError}</Text>
        </View>
      ) : null}

      {!mapIsLoading && !combinedError && filteredLocations.length === 0 ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>No locations match these filters</Text>
          <Text style={styles.errorText}>Try widening the map or resetting filters.</Text>
          <Pressable
            onPress={() => {
              setIntent(DEFAULT_SEARCH_INTENT);
              setCategoryFilter("all");
              setSortingMode("best_spots");
            }}
            style={styles.retryButton}
          >
            <Text style={styles.retryButtonText}>Reset Filters</Text>
          </Pressable>
        </View>
      ) : null}

      {!mapIsLoading && !combinedError && filteredLocations.length > 0 ? (
        <Animated.View
          style={[
            styles.rankedSheet,
            {
              height: sheetHeightAnim,
              bottom: SHEET_BOTTOM_OFFSET,
            },
          ]}
        >
          <View {...sheetPanResponder.panHandlers} style={styles.rankedDragHandleArea}>
            <View style={styles.rankedDragHandle} />
          </View>
          <View style={styles.rankedHeaderRow}>
            <Text style={styles.rankedTitle}>{sortingMode === "best_spots" ? "Best Spots in View" : "Spots in This Area"}</Text>
            <Text style={styles.rankedPageText}>{`${filteredLocations.length} results`}</Text>
          </View>
          <FlatList
            ref={cardsListRef}
            data={filteredLocations}
            keyExtractor={(item) => item.id}
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
            style={styles.rankedScroll}
            contentContainerStyle={styles.rankedScrollContent}
            onScrollToIndexFailed={() => {}}
            renderItem={({ item: location, index }) => {
              const occupancy = topAvailabilityById[location.id]?.occupancy_percent ?? null;
              const availabilityPercent = occupancy === null ? null : Math.max(0, 100 - occupancy);
              const isSelected = selectedLocationId === location.id;
              const distanceMeters = getDistanceFromActiveMapCenter(location);
              const isTopRecommendation = sortingMode === "best_spots" && index === 0;
              return (
                <Pressable
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
                  style={[
                    styles.rankedCard,
                    isSelected && styles.rankedCardExpanded,
                    isTopRecommendation && styles.rankedTopCard,
                  ]}
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
                {isSelected ? (
                  <View style={styles.rankedExpandedDetails}>
                    <LocationDetailScreen
                      accessToken={accessToken}
                      availabilityPercent={availabilityPercent}
                      canCheckIn={canCheckIn}
                      confidencePercent={Math.round((topAvailabilityById[location.id]?.confidence ?? 0.5) * 100)}
                      location={location}
                      onCheckInPress={() => onOpenCheckinsForLocation(location.id)}
                      onOpenAppleMaps={() => openExternalMap(getAppleMapsUrl(location))}
                      onOpenGoogleMaps={() => openExternalMap(getGoogleMapsUrl(location))}
                    />
                  </View>
                ) : null}
                </Pressable>
              );
            }}
          />
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
  searchAreaButtonWrap: {
    position: "absolute",
    top: 146,
    alignSelf: "center",
    zIndex: 40,
    elevation: 4,
  },
  searchAreaButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#2f5634",
    backgroundColor: "#2f5634",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  searchAreaButtonText: {
    color: "#f8f6ef",
    fontSize: 12,
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
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#d6cdb8",
    backgroundColor: "rgba(255, 253, 248, 0.98)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  rankedDragHandleArea: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 8,
    paddingBottom: 10,
  },
  rankedDragHandle: {
    width: 36,
    height: 4,
    borderRadius: 999,
    backgroundColor: "#d0c5b2",
  },
  rankedScroll: {
    flex: 1,
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
  rankedTopCard: {
    borderColor: "#99ba86",
    backgroundColor: "#eef7e8",
  },
  rankedExpandedDetails: {
    marginTop: 6,
    gap: 4,
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
});
