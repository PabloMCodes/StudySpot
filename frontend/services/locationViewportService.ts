import type { LocationBounds } from "../types/location";

type Coordinate = number[];

interface CameraStateLike {
  properties?: {
    bounds?: {
      ne?: Coordinate;
      sw?: Coordinate;
    };
  };
}

const MIN_CHANGE_THRESHOLD = 0.0008;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function extractLngLat(coordinate: Coordinate | undefined): [number, number] | null {
  if (!coordinate || coordinate.length < 2) {
    return null;
  }

  const lng = Number(coordinate[0]);
  const lat = Number(coordinate[1]);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return [lng, lat];
}

export function boundsFromCameraState(state: CameraStateLike): LocationBounds | null {
  const ne = extractLngLat(state.properties?.bounds?.ne);
  const sw = extractLngLat(state.properties?.bounds?.sw);

  if (!ne || !sw) {
    return null;
  }

  const maxLat = clamp(Math.max(ne[1], sw[1]), -90, 90);
  const minLat = clamp(Math.min(ne[1], sw[1]), -90, 90);
  const maxLng = clamp(Math.max(ne[0], sw[0]), -180, 180);
  const minLng = clamp(Math.min(ne[0], sw[0]), -180, 180);

  if ([maxLat, minLat, maxLng, minLng].some((value) => !Number.isFinite(value))) {
    return null;
  }

  return { minLat, maxLat, minLng, maxLng };
}

export function didBoundsChange(
  previous: LocationBounds | null,
  next: LocationBounds,
  threshold = MIN_CHANGE_THRESHOLD,
): boolean {
  if (!previous) {
    return true;
  }

  return (
    Math.abs(previous.minLat - next.minLat) > threshold ||
    Math.abs(previous.maxLat - next.maxLat) > threshold ||
    Math.abs(previous.minLng - next.minLng) > threshold ||
    Math.abs(previous.maxLng - next.maxLng) > threshold
  );
}
