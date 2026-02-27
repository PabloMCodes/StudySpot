export type BusynessLevel = "plenty" | "filling" | "packed";

export interface Checkin {
  id: string;
  userId: string;
  locationId: string;
  busyness: BusynessLevel;
  topic?: string | null;
  openToStudy: boolean;
  createdAt: string;
}
