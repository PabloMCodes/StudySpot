import { apiRequest, type ApiResponse } from "./api";

export interface LoginPayload {
  id_token: string;
}
// export from the backend
export interface AuthTokenResponse {
  access_token: string;
  token_type: "bearer";
}

export function login(payload: LoginPayload): Promise<ApiResponse<AuthTokenResponse>> {
  return apiRequest<AuthTokenResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
