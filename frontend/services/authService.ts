import { apiRequest, type ApiResponse } from "./api";

export interface LoginPayload {
  idToken: string; // this needs to change, due to the fact that we are recieving this from the frontend
}
// export from the backend
export interface AuthTokenResponse {
  access_token: string;
  tokenType: "bearer";
}

export function login(payload: LoginPayload): Promise<ApiResponse<AuthTokenResponse>> {
  return apiRequest<AuthTokenResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
