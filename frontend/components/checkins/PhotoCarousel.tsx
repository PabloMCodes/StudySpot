import React from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import type { SessionPhoto } from "../../types/photo";

interface PhotoCarouselProps {
  title: string;
  photos: SessionPhoto[];
  onLike?: (photoId: string) => void;
}

export function PhotoCarousel({ title, photos, onLike }: PhotoCarouselProps) {
  if (photos.length === 0) {
    return null;
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {photos.map((photo) => (
          <View key={photo.id} style={styles.card}>
            <Image source={{ uri: photo.image_url }} style={styles.image} />
            <View style={styles.footer}>
              <Text style={styles.helpfulText}>👍 {photo.helpful_count}</Text>
              {onLike ? (
                <Pressable onPress={() => onLike(photo.id)} style={styles.likeButton}>
                  <Text style={styles.likeText}>Helpful</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
  },
  title: {
    color: "#2f4031",
    fontSize: 15,
    fontWeight: "800",
  },
  row: {
    gap: 10,
    paddingRight: 8,
  },
  card: {
    width: 170,
    gap: 6,
  },
  image: {
    width: 170,
    height: 120,
    borderRadius: 14,
    backgroundColor: "#e7e1d5",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  helpfulText: {
    color: "#556553",
    fontSize: 12,
    fontWeight: "700",
  },
  likeButton: {
    borderRadius: 999,
    backgroundColor: "#edf3ec",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  likeText: {
    color: "#456046",
    fontSize: 11,
    fontWeight: "700",
  },
});
