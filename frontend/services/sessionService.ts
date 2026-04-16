import { apiRequest, type ApiResponse } from "./api";
import type {
  CompletePersonalSessionPayload,
  CreateStudySessionPayload,
  EndPersonalSessionPayload,
  PersonalSessionsListResponse,
  UpdatePersonalSessionHistoryPayload,
  FollowingLeaderboardEntry,
  SessionActionResponse,
  SessionUsageUpdatePayload,
  StartPersonalSessionPayload,
  StudySession,
} from "../types/session";

function authHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
  };
}

// Personal session APIs
export function getMySessions(accessToken: string): Promise<ApiResponse<PersonalSessionsListResponse>> {
  return apiRequest<PersonalSessionsListResponse>("/sessions/me", {
    method: "GET",
    headers: authHeaders(accessToken),
  });
}

export async function getFollowingLeaderboard(
  accessToken: string,
): Promise<ApiResponse<FollowingLeaderboardEntry[]>> {
  const response = await apiRequest<{ items: FollowingLeaderboardEntry[] }>("/sessions/me/leaderboard", {
    method: "GET",
    headers: authHeaders(accessToken),
  });

  if (!response.success || !response.data) {
    return { success: false, data: null, error: response.error };
  }

  return {
    success: true,
    data: response.data.items ?? [],
    error: null,
  };
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

export function completeSession(
  accessToken: string,
  sessionId: string,
  payload: CompletePersonalSessionPayload,
): Promise<ApiResponse<PersonalSessionsListResponse>> {
  return apiRequest<PersonalSessionsListResponse>(`/sessions/${sessionId}/complete`, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export function updateSessionHistory(
  accessToken: string,
  sessionId: string,
  payload: UpdatePersonalSessionHistoryPayload,
): Promise<ApiResponse<PersonalSessionsListResponse>> {
  return apiRequest<PersonalSessionsListResponse>(`/sessions/${sessionId}`, {
    method: "PATCH",
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export function deleteSessionHistory(
  accessToken: string,
  sessionId: string,
): Promise<ApiResponse<PersonalSessionsListResponse>> {
  return apiRequest<PersonalSessionsListResponse>(`/sessions/${sessionId}`, {
    method: "DELETE",
    headers: authHeaders(accessToken),
  });
}

// Group session APIs
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
