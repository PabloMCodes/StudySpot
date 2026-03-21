import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useState } from "react";
import { Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";

import { MapContainer } from "../components/map/MapContainer";
import { useAuth } from "../context/AuthContext";
import { getLocations } from "../services/locationService";
import type { Location } from "../types/location";

type HomeTab = "map" | "filters" | "saved" | "profile";
const TAB_BAR_RESERVED_HEIGHT = 80;

export function HomeScreen() {
  const { setAccessToken } = useAuth();
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<HomeTab>("map");

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
    <View style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.screen}>
        <SafeAreaView style={styles.headerSafeArea}>
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>StudySpot</Text>
              <Text style={styles.subtitle}>Find your ideal study space</Text>
            </View>
            <Pressable onPress={() => setAccessToken(null)} style={styles.logoutButton}>
              <Text style={styles.logoutButtonText}>Sign Out</Text>
            </Pressable>
          </View>
        </SafeAreaView>

        <View style={styles.mapSurface}>
          <MapContainer error={error} loading={loading} locations={locations} onRetry={loadLocations} />
        </View>

        <View style={styles.tabBar}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setActiveTab("map")}
            style={({ pressed }) => [styles.tabItem, activeTab === "map" && styles.tabItemActive, pressed && styles.tabItemPressed]}
          >
            <Text style={[styles.tabIcon, activeTab === "map" && styles.tabIconActive]}>⌖</Text>
            <Text style={[styles.tabLabel, activeTab === "map" && styles.tabLabelActive]}>Map</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => setActiveTab("filters")}
            style={({ pressed }) => [styles.tabItem, activeTab === "filters" && styles.tabItemActive, pressed && styles.tabItemPressed]}
          >
            <Text style={[styles.tabIcon, activeTab === "filters" && styles.tabIconActive]}>☰</Text>
            <Text style={[styles.tabLabel, activeTab === "filters" && styles.tabLabelActive]}>Filters</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => setActiveTab("saved")}
            style={({ pressed }) => [styles.tabItem, activeTab === "saved" && styles.tabItemActive, pressed && styles.tabItemPressed]}
          >
            <Text style={[styles.tabIcon, activeTab === "saved" && styles.tabIconActive]}>☆</Text>
            <Text style={[styles.tabLabel, activeTab === "saved" && styles.tabLabelActive]}>Saved</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => setActiveTab("profile")}
            style={({ pressed }) => [styles.tabItem, activeTab === "profile" && styles.tabItemActive, pressed && styles.tabItemPressed]}
          >
            <Text style={[styles.tabIcon, activeTab === "profile" && styles.tabIconActive]}>◌</Text>
            <Text style={[styles.tabLabel, activeTab === "profile" && styles.tabLabelActive]}>Profile</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#efe8dc",
  },
  screen: {
    flex: 1,
  },
  headerSafeArea: {
    backgroundColor: "#efe8dc",
  },
  header: {
    paddingTop: 8,
    paddingBottom: 10,
    paddingHorizontal: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  title: {
    fontSize: 30,
    fontWeight: "800",
    color: "#2f4a30",
    letterSpacing: 0.2,
  },
  subtitle: {
    marginTop: 1,
    color: "#6c6b61",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1.6,
  },
  logoutButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#cdbd9f",
    backgroundColor: "#fbf7ee",
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  logoutButtonText: {
    color: "#4b5f45",
    fontWeight: "700",
    fontSize: 12,
  },
  mapSurface: {
    flex: 1,
    borderRadius: 0,
    overflow: "hidden",
    backgroundColor: "#ffffff",
    marginBottom: TAB_BAR_RESERVED_HEIGHT,
  },
  tabBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#fcf8ef",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: TAB_BAR_RESERVED_HEIGHT,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    borderTopWidth: 1,
    borderTopColor: "#dacdb7",
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    borderRadius: 14,
    minHeight: 64,
  },
  tabItemActive: {
    backgroundColor: "#f3e8d7",
  },
  tabItemPressed: {
    opacity: 0.8,
  },
  tabIcon: {
    fontSize: 33,
    color: "#7d7a70",
  },
  tabIconActive: {
    color: "#ad7237",
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#7d7a70",
  },
  tabLabelActive: {
    color: "#ad7237",
  },
});
