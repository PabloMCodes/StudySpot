import { apiRequest, type ApiResponse } from "./api";
import type { Location } from "@/types/location";

export function getLocations(): Promise<ApiResponse<Location[]>> {
  return apiRequest<Location[]>("/locations");
}
