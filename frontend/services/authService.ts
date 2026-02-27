import { apiRequest, type ApiResponse } from "./api";

export interface LoginPayload {
  idToken: string;
}

export interface AuthTokenResponse {
  accessToken: string;
  tokenType: "bearer";
}

export function login(payload: LoginPayload): Promise<ApiResponse<AuthTokenResponse>> {
  return apiRequest<AuthTokenResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
