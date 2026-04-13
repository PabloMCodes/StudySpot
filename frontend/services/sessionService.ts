import { apiRequest, type ApiResponse } from "./api";
import type {
  EndPersonalSessionPayload,
  PersonalSessionsListResponse,
  StartPersonalSessionPayload,
} from "../types/session";

function authHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
  };
}

export function getMySessions(accessToken: string): Promise<ApiResponse<PersonalSessionsListResponse>> {
  return apiRequest<PersonalSessionsListResponse>("/sessions/me", {
    method: "GET",
    headers: authHeaders(accessToken),
  });
}

export function startSession(
  accessToken: string,
  payload: StartPersonalSessionPayload,
): Promise<ApiResponse<{ session_id: string; active_session: PersonalSessionsListResponse["active_session"] }>> {
  return apiRequest<{ session_id: string; active_session: PersonalSessionsListResponse["active_session"] }>(
    "/sessions/start",
    {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify(payload),
    },
  );
}

export function endSession(
  accessToken: string,
  payload: EndPersonalSessionPayload,
): Promise<ApiResponse<PersonalSessionsListResponse>> {
  return apiRequest<PersonalSessionsListResponse>("/sessions/end", {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}
