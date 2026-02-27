export interface Location {
  id: string;
  name: string;
  description?: string | null;
  latitude: number;
  longitude: number;
  quietLevel: number;
  hasOutlets: boolean;
  availabilityScore: number;
  confidence: "high" | "moderate" | "limited";
  lastUpdated: string;
}
