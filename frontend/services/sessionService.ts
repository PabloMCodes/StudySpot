import { apiRequest, type ApiResponse } from "./api";
import type { StudySession } from "../types/session";

export function getSessions(locationId: string): Promise<ApiResponse<StudySession[]>> {
  return apiRequest<StudySession[]>(`/sessions?location_id=${encodeURIComponent(locationId)}`);
}
