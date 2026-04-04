import React, { useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import type { Location } from "../types/location";

export interface SavedSpotMeta {
  rating: number | null;
  comment: string;
}

interface SavedScreenProps {
  locations: Location[];
  savedSpotsById: Record<string, SavedSpotMeta>;
  onSaveSpot: (locationId: string) => void;
  onRemoveSpot: (locationId: string) => void;
  onRateSpot: (locationId: string, rating: number) => void;
  onUpdateComment: (locationId: string, comment: string) => void;
}

const MAX_DISCOVERY_ITEMS = 6;

function StarRating({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (rating: number) => void;
}) {
  return (
    <View style={styles.starsRow}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Pressable key={star} onPress={() => onChange(star)} style={styles.starButton}>
          <Text style={star <= (value ?? 0) ? styles.starFilled : styles.starEmpty}>★</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function SavedScreen({
  locations,
  savedSpotsById,
  onSaveSpot,
  onRemoveSpot,
  onRateSpot,
  onUpdateComment,
}: SavedScreenProps) {
  const [draftCommentsById, setDraftCommentsById] = useState<Record<string, string>>({});

  const savedLocations = useMemo(
    () => locations.filter((location) => Boolean(savedSpotsById[location.id])),
    [locations, savedSpotsById],
  );

  const discoveryLocations = useMemo(
    () =>
      locations
        .filter((location) => !savedSpotsById[location.id])
        .slice(0, MAX_DISCOVERY_ITEMS),
    [locations, savedSpotsById],
  );

  const averageRating = useMemo(() => {
    const ratings = savedLocations
      .map((location) => savedSpotsById[location.id]?.rating)
      .filter((rating): rating is number => typeof rating === "number");
    if (!ratings.length) return null;
    return ratings.reduce((total, rating) => total + rating, 0) / ratings.length;
  }, [savedLocations, savedSpotsById]);

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.heroCard}>
        <Text style={styles.heroEyebrow}>My Saved Spots</Text>
        <Text style={styles.heroTitle}>Your personal shortlist</Text>
        <Text style={styles.heroSubtitle}>
          Save places you trust, add your own ratings, and leave quick notes for future sessions.
        </Text>
        <View style={styles.metricsRow}>
          <View style={styles.metric}>
            <Text style={styles.metricValue}>{savedLocations.length}</Text>
            <Text style={styles.metricLabel}>Saved</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricValue}>
              {averageRating ? averageRating.toFixed(1) : "—"}
            </Text>
            <Text style={styles.metricLabel}>Avg Rating</Text>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Saved Favorites</Text>
        {savedLocations.length ? (
          savedLocations.map((location) => {
            const savedMeta = savedSpotsById[location.id];
            const draftComment =
              draftCommentsById[location.id] ?? savedMeta?.comment ?? "";

            return (
              <View key={location.id} style={styles.savedCard}>
                <View style={styles.savedHeaderRow}>
                  <View style={styles.savedHeaderCopy}>
                    <Text style={styles.savedName}>{location.name}</Text>
                    <Text style={styles.savedMeta}>
                      {(location.category ?? "Study Spot").toUpperCase()}
                    </Text>
                    <Text style={styles.savedAddress}>
                      {location.address ?? "Address not available"}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => onRemoveSpot(location.id)}
                    style={styles.removeButton}
                  >
                    <Text style={styles.removeButtonText}>Remove</Text>
                  </Pressable>
                </View>

                <Text style={styles.fieldLabel}>Your rating</Text>
                <StarRating
                  value={savedMeta?.rating ?? null}
                  onChange={(rating) => onRateSpot(location.id, rating)}
                />

                <Text style={styles.fieldLabel}>Your note</Text>
                <TextInput
                  multiline
                  onChangeText={(value) =>
                    setDraftCommentsById((prev) => ({ ...prev, [location.id]: value }))
                  }
                  placeholder="What did you like here? Quiet? Seating? Best study hours?"
                  placeholderTextColor="#8A7D6A"
                  style={styles.commentInput}
                  value={draftComment}
                />

                <Pressable
                  onPress={() => onUpdateComment(location.id, draftComment)}
                  style={styles.saveCommentButton}
                >
                  <Text style={styles.saveCommentText}>Save Note</Text>
                </Pressable>
              </View>
            );
          })
        ) : (
          <View style={styles.emptyStateCard}>
            <Text style={styles.emptyStateTitle}>No saved spots yet</Text>
            <Text style={styles.emptyStateSubtitle}>
              Add a few places below to start building your personal Beli-style study list.
            </Text>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Discover & Save</Text>
        {discoveryLocations.map((location) => (
          <View key={location.id} style={styles.discoveryCard}>
            <View style={styles.discoveryCopy}>
              <Text style={styles.discoveryName}>{location.name}</Text>
              <Text style={styles.discoveryAddress}>
                {location.address ?? "Address not available"}
              </Text>
            </View>
            <Pressable onPress={() => onSaveSpot(location.id)} style={styles.saveSpotButton}>
              <Text style={styles.saveSpotText}>Save</Text>
            </Pressable>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 120,
    gap: 14,
  },
  heroCard: {
    backgroundColor: "#2F6B57",
    borderRadius: 24,
    padding: 16,
    gap: 8,
  },
  heroEyebrow: {
    color: "#D8F3E8",
    fontSize: 11,
    letterSpacing: 1.1,
    textTransform: "uppercase",
    fontWeight: "700",
  },
  heroTitle: {
    color: "#FFFFFF",
    fontSize: 26,
    fontWeight: "800",
    lineHeight: 30,
  },
  heroSubtitle: {
    color: "#E4F6EE",
    fontSize: 13,
    lineHeight: 18,
  },
  metricsRow: {
    marginTop: 4,
    flexDirection: "row",
    gap: 10,
  },
  metric: {
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    minWidth: 100,
  },
  metricValue: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "800",
  },
  metricLabel: {
    marginTop: 2,
    color: "#D8F3E8",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    fontWeight: "700",
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    color: "#2F4031",
    fontSize: 18,
    fontWeight: "800",
  },
  savedCard: {
    backgroundColor: "#FFFDF9",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E2D7C4",
    padding: 14,
    gap: 10,
  },
  savedHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
  },
  savedHeaderCopy: {
    flex: 1,
    gap: 2,
  },
  savedName: {
    color: "#2E3C2D",
    fontSize: 19,
    fontWeight: "800",
  },
  savedMeta: {
    color: "#87613A",
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 1,
    fontWeight: "700",
  },
  savedAddress: {
    color: "#6E665A",
    fontSize: 12,
  },
  removeButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#D9CAB4",
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#FAF5EC",
  },
  removeButtonText: {
    color: "#765E45",
    fontSize: 11,
    fontWeight: "700",
  },
  fieldLabel: {
    color: "#3E4E3C",
    fontSize: 12,
    fontWeight: "700",
  },
  starsRow: {
    flexDirection: "row",
    gap: 5,
  },
  starButton: {
    paddingVertical: 2,
    paddingHorizontal: 1,
  },
  starFilled: {
    fontSize: 28,
    color: "#E2A944",
  },
  starEmpty: {
    fontSize: 28,
    color: "#D8CFBF",
  },
  commentInput: {
    minHeight: 76,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#DCCDB8",
    backgroundColor: "#FFF9F0",
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#2F3E31",
    textAlignVertical: "top",
    fontSize: 14,
  },
  saveCommentButton: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "#2F6B57",
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  saveCommentText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  emptyStateCard: {
    borderRadius: 18,
    backgroundColor: "#F7F1E5",
    padding: 14,
    borderWidth: 1,
    borderColor: "#E1D5C2",
    gap: 4,
  },
  emptyStateTitle: {
    color: "#3A4B39",
    fontSize: 16,
    fontWeight: "800",
  },
  emptyStateSubtitle: {
    color: "#6A635A",
    fontSize: 13,
    lineHeight: 18,
  },
  discoveryCard: {
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5DCCB",
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  discoveryCopy: {
    flex: 1,
  },
  discoveryName: {
    color: "#334132",
    fontSize: 15,
    fontWeight: "700",
  },
  discoveryAddress: {
    marginTop: 2,
    color: "#71685B",
    fontSize: 12,
  },
  saveSpotButton: {
    borderRadius: 999,
    backgroundColor: "#EDE2CF",
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  saveSpotText: {
    color: "#5A452E",
    fontSize: 12,
    fontWeight: "700",
  },
});
