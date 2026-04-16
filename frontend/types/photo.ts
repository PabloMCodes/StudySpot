export interface SessionPhoto {
  id: string;
  session_id: string;
  location_id: string | null;
  image_url: string;
  helpful_count: number;
  created_at: string;
}

export interface LocationPhotos {
  most_helpful: SessionPhoto | null;
  recent_photos: SessionPhoto[];
}
