import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useState } from "react";
import { Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";

import { MapContainer } from "../components/map/MapContainer";
import { useAuth } from "../context/AuthContext";
import { getLocations } from "../services/locationService";
import type { Location } from "../types/location";

export function HomeScreen() {
  const { setAccessToken } = useAuth();
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadLocations = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await getLocations({ limit: 50, sort: "name" });

      if (!response.success || !response.data) {
        setLocations([]);
        setError(response.error ?? "Failed to load locations");
        return;
      }

      setLocations(response.data);
    } catch {
      setLocations([]);
      setError("Failed to load locations");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLocations();
  }, [loadLocations]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>StudySpot</Text>
          <Text style={styles.subtitle}>Find where you can actually study right now.</Text>
        </View>
        <Pressable onPress={() => setAccessToken(null)} style={styles.logoutButton}>
          <Text style={styles.logoutButtonText}>Log Out</Text>
        </Pressable>
      </View>

      <MapContainer error={error} loading={loading} locations={locations} onRetry={loadLocations} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f4f0e6",
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: "#334226",
  },
  subtitle: {
    marginTop: 2,
    maxWidth: 230,
    color: "#49573f",
    fontSize: 13,
    lineHeight: 18,
  },
  logoutButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#6d7a5a",
    backgroundColor: "#fdfbf4",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  logoutButtonText: {
    color: "#334226",
    fontWeight: "700",
    fontSize: 13,
  },
});
