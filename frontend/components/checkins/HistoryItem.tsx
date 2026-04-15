import React, { useMemo, useState } from "react";
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";

import type { PersonalSession } from "../../types/session";

interface HistoryItemProps {
  item: PersonalSession;
}

function formatDuration(minutes: number | null, autoTimedOut: boolean): string {
  if (minutes === null) {
    return autoTimedOut ? "Auto-closed" : "N/A";
  }
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return `${hours}h ${rem}m`;
}

export function HistoryItem({ item }: HistoryItemProps) {
  const [expanded, setExpanded] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const { width: windowWidth } = useWindowDimensions();
  const notes = useMemo(() => {
    const all = [item.start_note, item.end_note].filter((n): n is string => Boolean(n && n.trim()));
    return all.join("\n\n");
  }, [item.end_note, item.start_note]);
  const photoUrls = item.photo_urls?.length ? item.photo_urls : item.photo_url ? [item.photo_url] : [];

  return (
    <Pressable onPress={() => setExpanded((prev) => !prev)} style={styles.row}>
      {photoUrls.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.photoStrip}
        >
          {photoUrls.map((uri, index) => (
            <Pressable
              key={`${item.id}-${index}`}
              onPress={() => {
                setViewerIndex(index);
                setViewerOpen(true);
              }}
            >
              <Image resizeMode="contain" source={{ uri }} style={styles.photoPreview} />
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      <View style={styles.topRow}>
        <View style={styles.titleWrap}>
          <Text numberOfLines={1} style={styles.title}>{item.topic}</Text>
          <Text numberOfLines={1} style={styles.subtleText}>{item.location_name ?? "No location"}</Text>
        </View>
        <View style={styles.scoreBadge}>
          <Text style={styles.scoreText}>{item.accomplishment_score ?? "-"}/10</Text>
        </View>
      </View>
      <Text style={styles.meta}>Duration {formatDuration(item.duration_minutes, item.auto_timed_out)}</Text>
      {expanded && notes.length > 0 ? <Text style={styles.notes}>{notes}</Text> : null}

      <Modal animationType="fade" transparent visible={viewerOpen}>
        <View style={styles.viewerBackdrop}>
          <Pressable onPress={() => setViewerOpen(false)} style={styles.viewerClose}>
            <Text style={styles.viewerCloseText}>Close</Text>
          </Pressable>
          <ScrollView
            horizontal
            pagingEnabled
            contentOffset={{ x: viewerIndex * windowWidth, y: 0 }}
            showsHorizontalScrollIndicator={false}
          >
            {photoUrls.map((uri, index) => (
              <View key={`viewer-${item.id}-${index}`} style={[styles.viewerPage, { width: windowWidth }]}>
                <Image resizeMode="contain" source={{ uri }} style={styles.viewerImage} />
              </View>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: "#fffdf9",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
    shadowColor: "#1f2b1f",
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  titleWrap: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: "#284028",
    fontSize: 14,
    fontWeight: "800",
  },
  subtleText: {
    color: "#6b6a59",
    fontSize: 12,
    fontWeight: "600",
  },
  meta: {
    color: "#50634b",
    fontSize: 12,
    fontWeight: "700",
  },
  scoreBadge: {
    borderRadius: 999,
    backgroundColor: "#e9f3ec",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  scoreText: {
    color: "#2f6b57",
    fontSize: 11,
    fontWeight: "800",
  },
  notes: {
    color: "#4b5b46",
    fontSize: 12,
    lineHeight: 17,
  },
  photoPreview: {
    width: 190,
    height: 128,
    borderRadius: 10,
    backgroundColor: "#f3ecde",
  },
  photoStrip: {
    gap: 8,
    marginBottom: 2,
    paddingRight: 4,
  },
  viewerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(12, 14, 12, 0.94)",
    justifyContent: "center",
  },
  viewerClose: {
    position: "absolute",
    top: 54,
    right: 16,
    zIndex: 2,
    borderRadius: 999,
    backgroundColor: "rgba(250, 250, 250, 0.14)",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  viewerCloseText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
  },
  viewerPage: {
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 10,
  },
  viewerImage: {
    width: "100%",
    height: "78%",
  },
});
