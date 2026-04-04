import { apiRequest, type ApiResponse } from "./api";
import type {
  CheckinCreateResponse,
  CheckoutCheckinPayload,
  CheckinPrompt,
  CreateCheckinPayload,
  MyCheckinsResponse,
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

export function getMyCheckins(accessToken: string): Promise<ApiResponse<MyCheckinsResponse>> {
  return apiRequest<MyCheckinsResponse>("/checkins/me", {
    method: "GET",
    headers: authHeaders(accessToken),
  });
}

export function checkoutCheckin(
  accessToken: string,
  payload: CheckoutCheckinPayload,
): Promise<ApiResponse<CheckinCreateResponse>> {
  return apiRequest<CheckinCreateResponse>("/checkins/checkout", {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}
