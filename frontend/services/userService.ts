import { apiRequest, type ApiResponse } from "./api";
import type {
  CurrentUserProfile,
  FriendRelationshipStatus,
  FriendUser,
  UserProfile,
  UserProfileStats,
} from "../types/user";

interface BackendCurrentUser {
  id: string;
  email: string;
  name: string | null;
  profile_picture: string | null;
  created_at: string;
}

interface BackendFriendUser {
  id: string;
  name: string | null;
  profile_picture: string | null;
}

interface FriendsResponse {
  friends?: BackendFriendUser[];
  count: number;
}

interface IncomingRequestsResponse {
  incoming_requests?: BackendFriendUser[];
  count: number;
}

interface OutgoingRequestsResponse {
  outgoing_requests?: BackendFriendUser[];
  count: number;
}

function authHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
  };
}

function mapBackendFriendUser(user: BackendFriendUser): FriendUser {
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

export async function getMyFriends(accessToken: string): Promise<ApiResponse<FriendUser[]>> {
  const response = await apiRequest<FriendsResponse>("/users/me/friends", {
    headers: authHeaders(accessToken),
  });

  if (!response.success || !response.data) {
    return { success: false, data: null, error: response.error };
  }

  return {
    success: true,
    data: (response.data.friends ?? []).map(mapBackendFriendUser),
    error: null,
  };
}

export async function getIncomingFriendRequests(accessToken: string): Promise<ApiResponse<FriendUser[]>> {
  const response = await apiRequest<IncomingRequestsResponse>("/users/me/friend-requests/incoming", {
    headers: authHeaders(accessToken),
  });

  if (!response.success || !response.data) {
    return { success: false, data: null, error: response.error };
  }

  return {
    success: true,
    data: (response.data.incoming_requests ?? []).map(mapBackendFriendUser),
    error: null,
  };
}

export async function getOutgoingFriendRequests(accessToken: string): Promise<ApiResponse<FriendUser[]>> {
  const response = await apiRequest<OutgoingRequestsResponse>("/users/me/friend-requests/outgoing", {
    headers: authHeaders(accessToken),
  });

  if (!response.success || !response.data) {
    return { success: false, data: null, error: response.error };
  }

  return {
    success: true,
    data: (response.data.outgoing_requests ?? []).map(mapBackendFriendUser),
    error: null,
  };
}

export function sendFriendRequest(
  accessToken: string,
  userId: string,
): Promise<ApiResponse<{ requested_user_id: string }>> {
  return apiRequest<{ requested_user_id: string }>(`/users/${encodeURIComponent(userId)}/friend-request`, {
    method: "POST",
    headers: authHeaders(accessToken),
  });
}

export function cancelOrDeclineFriendRequest(
  accessToken: string,
  userId: string,
): Promise<ApiResponse<{ user_id: string }>> {
  return apiRequest<{ user_id: string }>(`/users/${encodeURIComponent(userId)}/friend-request`, {
    method: "DELETE",
    headers: authHeaders(accessToken),
  });
}

export function acceptFriendRequest(
  accessToken: string,
  userId: string,
): Promise<ApiResponse<{ friend_user_id: string }>> {
  return apiRequest<{ friend_user_id: string }>(`/users/${encodeURIComponent(userId)}/friend-accept`, {
    method: "POST",
    headers: authHeaders(accessToken),
  });
}

export function removeFriend(
  accessToken: string,
  userId: string,
): Promise<ApiResponse<{ removed_user_id: string }>> {
  return apiRequest<{ removed_user_id: string }>(`/users/${encodeURIComponent(userId)}/friend`, {
    method: "DELETE",
    headers: authHeaders(accessToken),
  });
}

export async function getFriendStatus(
  accessToken: string,
  userId: string,
): Promise<ApiResponse<FriendRelationshipStatus>> {
  const response = await apiRequest<{ status: FriendRelationshipStatus }>(
    `/users/${encodeURIComponent(userId)}/friend-status`,
    {
      method: "GET",
      headers: authHeaders(accessToken),
    },
  );

  if (!response.success || !response.data) {
    return { success: false, data: null, error: response.error };
  }

  return { success: true, data: response.data.status, error: null };
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
