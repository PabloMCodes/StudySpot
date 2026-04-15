export interface UserProfile {
  id: string;
  name: string | null;
  email: string;
  profilePicture: string | null;
  totalCheckins: number;
  followerCount: number;
  followingCount: number;
}

export interface FollowUser {
  id: string;
  name: string | null;
  profilePicture: string | null;
}

export interface CurrentUserProfile {
  id: string;
  email: string;
  name: string | null;
  profilePicture: string | null;
}

export interface MostStudiedLocation {
  id: string;
  name: string;
  total_study_time: number;
}

export interface RecentStudyPhoto {
  image_url: string;
  created_at: string;
}

export interface UserProfileStats {
  id: string;
  name: string | null;
  email: string;
  profile_picture: string | null;
  total_study_time: number;
  study_time_last_7_days: number;
  total_sessions: number;
  unique_locations: number;
  most_studied_location: MostStudiedLocation | null;
  average_focus_level: number | null;
  current_streak_days: number;
  recent_photos: RecentStudyPhoto[];
}
