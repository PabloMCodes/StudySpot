export interface UserProfile {
  id: string;
  name: string;
  email: string;
  profilePicture?: string | null;
  totalCheckins: number;
  followerCount: number;
  followingCount: number;
}
