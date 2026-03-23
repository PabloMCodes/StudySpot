import * as Location from "expo-location";
import type { UserCoordinates } from "../types/location";

export async function requestForegroundCoordinates(): Promise<UserCoordinates | null> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== "granted") {
    return null;
  }

  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });

  return {
    lat: position.coords.latitude,
    lng: position.coords.longitude,
  };
}
