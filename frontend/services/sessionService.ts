import { apiRequest, type ApiResponse } from "./api";
import type { 
  StudySession,
  CreateStudySessionPayload,
  SessionUsageUpdatePayload,
  SessionActionResponse,
 } from "../types/session";

function authHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
  };
}



export function createSession(
  accessToken: string,
  payload: CreateStudySessionPayload,
): Promise<ApiResponse<StudySession>> {
  return apiRequest<StudySession>("/sessions", {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export function getSession(
  accessToken: string,
  sessionId: string,
): Promise<ApiResponse<StudySession>> {
  return apiRequest<StudySession>(`/sessions/${sessionId}`, {
    method: "GET",
    headers: authHeaders(accessToken),
  });
}

export function getActiveSession(accessToken: string): Promise<ApiResponse<StudySession>> {
  return apiRequest<StudySession>("/sessions/me/active", {
    method: "GET",
    headers: authHeaders(accessToken),
  });
}

export function leaveSession(
  accessToken: string,
  sessionId: string,
  payload: SessionUsageUpdatePayload,
): Promise<ApiResponse<SessionActionResponse>> {
  return apiRequest<SessionActionResponse>(`/sessions/${sessionId}/leave`, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export function updateSessionUsage(
  accessToken: string,
  sessionId: string,
  payload: SessionUsageUpdatePayload,
): Promise<ApiResponse<StudySession>> {
  return apiRequest<StudySession>(`/sessions/${sessionId}/usage`, {
    method: "PATCH",
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}
 
export function joinSession(
  accessToken: string,
  sessionId: string,
  payload: SessionUsageUpdatePayload,
): Promise<ApiResponse<SessionActionResponse>> {
  return apiRequest<SessionActionResponse>(`/sessions/${sessionId}/join`, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}
