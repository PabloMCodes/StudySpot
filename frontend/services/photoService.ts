import { apiRequest, type ApiResponse } from "./api";
import type { LocationPhotos, SessionPhoto } from "../types/photo";

function authHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
  };
}

export function uploadPhoto(
  accessToken: string,
  fileUri: string,
  fileName: string = "studyspot-photo.jpg",
): Promise<ApiResponse<{ image_url: string }>> {
  const formData = new FormData();
  formData.append("file", {
    // React Native file object for multipart upload.
    uri: fileUri,
    name: fileName,
    type: "image/jpeg",
  } as any);

  return apiRequest<{ image_url: string }>("/photos/upload", {
    method: "POST",
    headers: authHeaders(accessToken),
    body: formData,
  });
}

export function getLocationPhotos(locationId: string): Promise<ApiResponse<LocationPhotos>> {
  return apiRequest<LocationPhotos>(`/locations/${encodeURIComponent(locationId)}/photos`);
}

export function likePhoto(
  accessToken: string,
  photoId: string,
): Promise<ApiResponse<{ created: boolean; photo: SessionPhoto }>> {
  return apiRequest<{ created: boolean; photo: SessionPhoto }>(
    `/photos/${encodeURIComponent(photoId)}/like`,
    {
      method: "POST",
      headers: authHeaders(accessToken),
    },
  );
}
