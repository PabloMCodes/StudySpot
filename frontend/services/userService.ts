import { apiRequest, type ApiResponse } from "./api";
import type { CurrentUserProfile, FollowUser, UserProfile, UserProfileStats } from "../types/user";

interface BackendCurrentUser {
  id: string;
  email: string;
  name: string | null;
  profile_picture: string | null;
  created_at: string;
}

interface BackendFollowUser {
  id: string;
  name: string | null;
  profile_picture: string | null;
}

interface FollowUsersResponse {
  followers?: BackendFollowUser[];
  following?: BackendFollowUser[];
  count: number;
}

function authHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
  };
}

function mapBackendFollowUser(user: BackendFollowUser): FollowUser {
  return {
    id: user.id,
    name: user.name,
    profilePicture: user.profile_picture,
  };
}

export function getProfile(userId: string): Promise<ApiResponse<UserProfile>> {
  return apiRequest<UserProfile>(`/users/${encodeURIComponent(userId)}`);
}

export async function getCurrentUserProfile(
  accessToken: string,
): Promise<ApiResponse<CurrentUserProfile>> {
  const response = await apiRequest<BackendCurrentUser>("/auth/me", {
    headers: authHeaders(accessToken),
  });

  if (!response.success || !response.data) {
    return { success: false, data: null, error: response.error };
  }

  return {
    success: true,
    data: {
      id: response.data.id,
      email: response.data.email,
      name: response.data.name,
      profilePicture: response.data.profile_picture,
    },
    error: null,
  };
}

export async function getMyFollowers(accessToken: string): Promise<ApiResponse<FollowUser[]>> {
  const response = await apiRequest<FollowUsersResponse>("/users/me/followers", {
    headers: authHeaders(accessToken),
  });

  if (!response.success || !response.data) {
    return { success: false, data: null, error: response.error };
  }

  return {
    success: true,
    data: (response.data.followers ?? []).map(mapBackendFollowUser),
    error: null,
  };
}

export async function getMyFollowing(accessToken: string): Promise<ApiResponse<FollowUser[]>> {
  const response = await apiRequest<FollowUsersResponse>("/users/me/following", {
    headers: authHeaders(accessToken),
  });

  if (!response.success || !response.data) {
    return { success: false, data: null, error: response.error };
  }

  return {
    success: true,
    data: (response.data.following ?? []).map(mapBackendFollowUser),
    error: null,
  };
}

export function followUser(accessToken: string, userId: string): Promise<ApiResponse<{ following_id: string }>> {
  return apiRequest<{ following_id: string }>(`/users/${encodeURIComponent(userId)}/follow`, {
    method: "POST",
    headers: authHeaders(accessToken),
  });
}

export function unfollowUser(
  accessToken: string,
  userId: string,
): Promise<ApiResponse<{ unfollowed_id: string }>> {
  return apiRequest<{ unfollowed_id: string }>(`/users/${encodeURIComponent(userId)}/follow`, {
    method: "DELETE",
    headers: authHeaders(accessToken),
  });
}

export function getMyProfileStats(accessToken: string): Promise<ApiResponse<UserProfileStats>> {
  return apiRequest<UserProfileStats>("/users/me/profile-stats", {
    method: "GET",
    headers: authHeaders(accessToken),
  });
}

export function getUserProfileStats(
  accessToken: string,
  userId: string,
): Promise<ApiResponse<UserProfileStats>> {
  return apiRequest<UserProfileStats>(`/users/${encodeURIComponent(userId)}/profile-stats`, {
    method: "GET",
    headers: authHeaders(accessToken),
  });
}
