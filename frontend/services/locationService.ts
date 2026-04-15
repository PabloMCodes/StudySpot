import { apiRequest, type ApiResponse } from "./api";
import type { CheckinAvailability } from "../types/checkin";
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

export function getLocationById(locationId: string): Promise<ApiResponse<Location>> {
  return apiRequest<Location>(`/locations/${encodeURIComponent(locationId)}`);
}

export function getLocationsInBounds(
  bounds: LocationBounds,
  options?: Pick<GetLocationsParams, "sort" | "limit" | "offset" | "lat" | "lng">,
): Promise<ApiResponse<Location[]>> {
  return getLocations({
    min_lat: bounds.minLat,
    max_lat: bounds.maxLat,
    min_lng: bounds.minLng,
    max_lng: bounds.maxLng,
    lat: options?.lat,
    lng: options?.lng,
    sort: options?.sort ?? "name",
    limit: options?.limit ?? 100,
    offset: options?.offset ?? 0,
  });
}

export function getLocationAvailability(locationId: string): Promise<ApiResponse<CheckinAvailability>> {
  return apiRequest<CheckinAvailability>(`/locations/${encodeURIComponent(locationId)}/availability`);
}

export function logLocationInteraction(
  locationId: string,
  interactionType: "view" | "click",
): Promise<ApiResponse<{ id: string; location_id: string; interaction_type: "view" | "click"; created_at: string }>> {
  return apiRequest(`/locations/${encodeURIComponent(locationId)}/interactions`, {
    method: "POST",
    body: JSON.stringify({ interaction_type: interactionType }),
  });
}
