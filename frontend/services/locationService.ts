import { apiRequest, type ApiResponse } from "./api";
import type { GetLocationsParams, Location } from "../types/location";

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
