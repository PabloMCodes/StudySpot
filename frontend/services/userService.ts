import { apiRequest, type ApiResponse } from "./api";
import type { UserProfile } from "@/types/user";

export function getProfile(userId: string): Promise<ApiResponse<UserProfile>> {
  return apiRequest<UserProfile>(`/users/${encodeURIComponent(userId)}`);
}
