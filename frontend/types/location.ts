export type LocationSort = "name" | "newest" | "distance";

export interface LocationBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export interface LocationFilters {
  openNow: boolean;
  minQuietLevel: number | null;
}

export interface GetLocationsParams {
  lat?: number;
  lng?: number;
  radius_m?: number;
  min_lat?: number;
  max_lat?: number;
  min_lng?: number;
  max_lng?: number;
  sort?: LocationSort;
  limit?: number;
  offset?: number;
}

export interface Location {
  id: string;
  source_key: string;
  name: string;
  address: string | null;
  description: string | null;
  description_updated_at: string | null;
  comment_count: number;
  latitude: number;
  longitude: number;
  category: string | null;
  rating: number | null;
  review_count: number | null;
  open_time: string | null;
  close_time: string | null;
  hours: string[] | Record<string, unknown> | null;
  price_level: number | null;
  website: string | null;
  phone: string | null;
  maps_url: string | null;
  editorial_summary: string | null;
  types: string[] | null;
  quiet_level: number;
  has_outlets: boolean;
  created_at: string;
  updated_at: string;
}
