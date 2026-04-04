import * as Location from "expo-location";
import type { UserCoordinates } from "../types/location";

async function getCurrentCoordinates(): Promise<UserCoordinates> {
  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });

  return {
    lat: position.coords.latitude,
    lng: position.coords.longitude,
  };
}

export async function requestForegroundCoordinates(): Promise<UserCoordinates | null> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== "granted") {
    return null;
  }

  return getCurrentCoordinates();
}

export async function getCurrentCoordinatesIfPermitted(): Promise<UserCoordinates | null> {
  const permission = await Location.getForegroundPermissionsAsync();
  if (permission.status !== "granted") {
    return null;
  }

  return getCurrentCoordinates();
}
