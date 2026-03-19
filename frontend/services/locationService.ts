import { apiRequest, type ApiResponse } from "./api";
import type { GetLocationsParams, Location, LocationBounds } from "../types/location";

function buildLocationsQuery(params?: GetLocationsParams): string {
  if (!params) {
    return "";
  }

  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      query.set(key, String(value));
    }
  });

  const queryString = query.toString();
  return queryString ? `?${queryString}` : "";
}

export function getLocations(params?: GetLocationsParams): Promise<ApiResponse<Location[]>> {
  return apiRequest<Location[]>(`/locations${buildLocationsQuery(params)}`);
}

export function getLocationsInBounds(
  bounds: LocationBounds,
  options?: Pick<GetLocationsParams, "sort" | "limit" | "offset">,
): Promise<ApiResponse<Location[]>> {
  return getLocations({
    min_lat: bounds.minLat,
    max_lat: bounds.maxLat,
    min_lng: bounds.minLng,
    max_lng: bounds.maxLng,
    sort: options?.sort ?? "name",
    limit: options?.limit ?? 150,
    offset: options?.offset ?? 0,
  });
}
