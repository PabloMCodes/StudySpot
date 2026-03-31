import { apiRequest, type ApiResponse } from "./api";
import type {
  CheckinCreateResponse,
  CheckinPrompt,
  CreateCheckinPayload,
  NearbyPromptPayload,
} from "../types/checkin";

function authHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
  };
}

export function createCheckin(
  accessToken: string,
  payload: CreateCheckinPayload,
): Promise<ApiResponse<CheckinCreateResponse>> {
  return apiRequest<CheckinCreateResponse>("/checkins", {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export function getNearbyCheckinPrompt(
  accessToken: string,
  payload: NearbyPromptPayload,
): Promise<ApiResponse<CheckinPrompt>> {
  return apiRequest<CheckinPrompt>("/checkins/prompt", {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}
