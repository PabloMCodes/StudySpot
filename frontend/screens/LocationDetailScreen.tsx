import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { PhotoCarousel } from "../components/checkins/PhotoCarousel";
import { getLocationPhotos, likePhoto } from "../services/photoService";
import { isLocationOpenNow } from "../services/locationFilterService";
import type { Location } from "../types/location";
import type { LocationPhotos, SessionPhoto } from "../types/photo";

interface LocationDetailScreenProps {
  location: Location;
  availabilityPercent: number | null;
  confidencePercent: number;
  canCheckIn: boolean;
  accessToken: string | null;
  onOpenGoogleMaps: () => void;
  onOpenAppleMaps: () => void;
  onReportContent: () => void;
  onCheckInPress: () => void;
}

export function LocationDetailScreen({
  location,
  availabilityPercent,
  confidencePercent,
  canCheckIn,
  accessToken,
  onOpenGoogleMaps,
  onOpenAppleMaps,
  onReportContent,
  onCheckInPress,
}: LocationDetailScreenProps) {
  const [photos, setPhotos] = useState<LocationPhotos | null>(null);
  const [photosLoading, setPhotosLoading] = useState(false);

  const refreshPhotos = useCallback(async () => {
    setPhotosLoading(true);
    const response = await getLocationPhotos(location.id);
    if (response.success && response.data) {
      setPhotos(response.data);
    } else {
      setPhotos({ most_helpful: null, recent_photos: [] });
    }
    setPhotosLoading(false);
  }, [location.id]);

  useEffect(() => {
    void refreshPhotos();
  }, [refreshPhotos]);

  const handleLike = useCallback(
    async (photoId: string) => {
      if (!accessToken) {
        return;
      }
      const response = await likePhoto(accessToken, photoId);
      if (!response.success || !response.data?.photo) {
        return;
      }
      const updated = response.data.photo;
      setPhotos((previous) => {
        if (!previous) {
          return previous;
        }
        const replacePhoto = (photo: SessionPhoto | null): SessionPhoto | null =>
          photo && photo.id === updated.id ? updated : photo;
        return {
          most_helpful: replacePhoto(previous.most_helpful),
          recent_photos: previous.recent_photos.map((photo) => (photo.id === updated.id ? updated : photo)),
        };
      });
    },
    [accessToken],
  );

  const mostHelpfulPhotos = useMemo(
    () => (photos?.most_helpful ? [photos.most_helpful] : []),
    [photos?.most_helpful],
  );

  return (
    <View style={styles.container}>
      <Text style={styles.detailText}>
        {availabilityPercent === null
          ? "Seat availability estimate is unavailable right now."
          : `Seat availability: ${availabilityPercent}% (higher means it should be easier to find a seat).`}
      </Text>
      <Text style={styles.detailText}>{location.address ?? "Address not available"}</Text>
      <Text style={styles.detailText}>
        {isLocationOpenNow(location, new Date()) === false ? "Closed now" : "Open now or hours unavailable"}
      </Text>
      <Text style={styles.detailText}>
        Confidence: {confidencePercent}% (higher means we have stronger recent data)
      </Text>

      <View style={styles.mapLinksRow}>
        <Pressable onPress={onOpenGoogleMaps} style={styles.mapLinkChip}>
          <Text style={styles.mapLinkText}>Google Maps</Text>
        </Pressable>
        <Pressable onPress={onOpenAppleMaps} style={styles.mapLinkChip}>
          <Text style={styles.mapLinkText}>Apple Maps</Text>
        </Pressable>
        <Pressable onPress={onReportContent} style={styles.reportLinkChip}>
          <Text style={styles.reportLinkText}>Report Content</Text>
        </Pressable>
      </View>

      <Pressable
        disabled={!canCheckIn}
        onPress={onCheckInPress}
        style={({ pressed }) => [
          styles.checkinCtaButton,
          !canCheckIn && styles.checkinCtaButtonDisabled,
          pressed && styles.checkinCtaButtonPressed,
        ]}
      >
        <Text style={styles.checkinCtaButtonText}>Check In At This Spot</Text>
      </Pressable>

      {!photosLoading && photos && (photos.most_helpful || photos.recent_photos.length > 0) ? (
        <View style={styles.photosSection}>
          <PhotoCarousel
            onLike={accessToken ? (photoId) => void handleLike(photoId) : undefined}
            photos={mostHelpfulPhotos}
            title="📸 Most Helpful Photo"
          />
          <PhotoCarousel
            onLike={accessToken ? (photoId) => void handleLike(photoId) : undefined}
            photos={photos.recent_photos}
            title="📸 Recent Study Photos"
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  detailText: {
    color: "#3f4f3a",
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 17,
  },
  mapLinksRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 2,
  },
  mapLinkChip: {
    borderRadius: 999,
    backgroundColor: "#eef3ec",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  mapLinkText: {
    color: "#456046",
    fontSize: 12,
    fontWeight: "700",
  },
  reportLinkChip: {
    borderRadius: 999,
    backgroundColor: "#f8ebe6",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  reportLinkText: {
    color: "#9e5244",
    fontSize: 12,
    fontWeight: "700",
  },
  checkinCtaButton: {
    minHeight: 42,
    borderRadius: 10,
    backgroundColor: "#2f6b57",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    marginTop: 2,
  },
  checkinCtaButtonPressed: {
    opacity: 0.9,
  },
  checkinCtaButtonDisabled: {
    opacity: 0.5,
  },
  checkinCtaButtonText: {
    color: "#f4fbf6",
    fontSize: 13,
    fontWeight: "800",
  },
  photosSection: {
    gap: 10,
    marginTop: 4,
  },
});
