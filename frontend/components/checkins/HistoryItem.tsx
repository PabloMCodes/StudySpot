import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Image,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";

import type { PersonalSession } from "../../types/session";

interface HistoryItemProps {
  item: PersonalSession;
  saving: boolean;
  deleting: boolean;
  onSaveEdit: (payload: {
    topic?: string;
    start_note?: string;
    end_note?: string;
    rating?: number;
    focus_level?: number;
    accomplishment_score?: number;
    add_photo_uris?: string[];
    remove_photo_urls?: string[];
  }) => void;
  onDelete: () => void;
}

const DELETE_ACTION_WIDTH = 104;
const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "") ??
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ??
  "http://localhost:8000";

function resolveMediaUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) {
    try {
      const parsed = new URL(value);
      if (parsed.pathname.includes("/uploads/session_photos/")) {
        return `${API_BASE_URL}${parsed.pathname}${parsed.search}`;
      }
      if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
        return `${API_BASE_URL}${parsed.pathname}${parsed.search}`;
      }
      return value;
    } catch {
      return value;
    }
  }
  if (value.startsWith("/")) return `${API_BASE_URL}${value}`;
  return `${API_BASE_URL}/${value}`;
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

function formatSessionDate(isoValue: string): string {
  return new Date(isoValue).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function HistoryItem({ item, saving, deleting, onSaveEdit, onDelete }: HistoryItemProps) {
  const [expanded, setExpanded] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [editing, setEditing] = useState(false);
  const [editedTopic, setEditedTopic] = useState(item.topic);
  const [editedStartNote, setEditedStartNote] = useState(item.start_note ?? "");
  const [editedEndNote, setEditedEndNote] = useState(item.end_note ?? "");
  const [editedRating, setEditedRating] = useState<number | null>(item.rating ?? null);
  const [editedFocusLevel, setEditedFocusLevel] = useState<number | null>(item.focus_level ?? null);
  const [editedAccomplishmentScore, setEditedAccomplishmentScore] = useState<number | null>(
    item.accomplishment_score ?? null,
  );
  const [pendingNewPhotoUris, setPendingNewPhotoUris] = useState<string[]>([]);
  const [pendingRemovedPhotoUrls, setPendingRemovedPhotoUrls] = useState<string[]>([]);
  const [photoEditError, setPhotoEditError] = useState<string | null>(null);
  const [swipeOpen, setSwipeOpen] = useState(false);
  const swipeX = useState(() => new Animated.Value(0))[0];
  const dragStartXRef = useRef(0);
  const { width: windowWidth } = useWindowDimensions();
  const notes = useMemo(() => {
    const all = [item.start_note, item.end_note].filter((n): n is string => Boolean(n && n.trim()));
    return all.join("\n\n");
  }, [item.end_note, item.start_note]);
  const photoUrls = useMemo(() => {
    const raw = item.photo_urls?.length ? item.photo_urls : item.photo_url ? [item.photo_url] : [];
    return raw.map((entry) => resolveMediaUrl(entry)).filter((entry): entry is string => Boolean(entry));
  }, [item.photo_url, item.photo_urls]);
  const pendingRemovedSet = useMemo(() => new Set(pendingRemovedPhotoUrls), [pendingRemovedPhotoUrls]);
  const visibleExistingPhotoUrls = useMemo(
    () => photoUrls.filter((uri) => !pendingRemovedSet.has(uri)),
    [pendingRemovedSet, photoUrls],
  );
  const displayPhotos = useMemo(
    () =>
      editing
        ? [
            ...visibleExistingPhotoUrls.map((uri) => ({ uri, kind: "existing" as const })),
            ...pendingNewPhotoUris.map((uri, index) => ({ uri, kind: "new" as const, index })),
          ]
        : photoUrls.map((uri) => ({ uri, kind: "existing" as const })),
    [editing, pendingNewPhotoUris, photoUrls, visibleExistingPhotoUrls],
  );

  useEffect(() => {
    setEditedTopic(item.topic);
    setEditedStartNote(item.start_note ?? "");
    setEditedEndNote(item.end_note ?? "");
    setEditedRating(item.rating ?? null);
    setEditedFocusLevel(item.focus_level ?? null);
    setEditedAccomplishmentScore(item.accomplishment_score ?? null);
    setPendingNewPhotoUris([]);
    setPendingRemovedPhotoUrls([]);
    setPhotoEditError(null);
    setEditing(false);
  }, [item.accomplishment_score, item.end_note, item.focus_level, item.id, item.rating, item.start_note, item.topic]);

  const addPhotoFromLibrary = async () => {
    setPhotoEditError(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setPhotoEditError("Media library permission denied.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 0.6,
    });
    if (result.canceled || result.assets.length === 0) {
      return;
    }
    const uri = result.assets[0].uri;
    setPendingNewPhotoUris((prev) => [...prev, uri]);
  };

  const addPhotoFromCamera = async () => {
    setPhotoEditError(null);
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setPhotoEditError("Camera permission denied.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.6,
    });
    if (result.canceled || result.assets.length === 0) {
      return;
    }
    const uri = result.assets[0].uri;
    setPendingNewPhotoUris((prev) => [...prev, uri]);
  };

  const removeDisplayPhoto = (photo: { uri: string; kind: "existing" | "new"; index?: number }) => {
    if (photo.kind === "existing") {
      setPendingRemovedPhotoUrls((prev) => (prev.includes(photo.uri) ? prev : [...prev, photo.uri]));
      return;
    }
    setPendingNewPhotoUris((prev) => prev.filter((_, idx) => idx !== (photo.index ?? -1)));
  };

  const animateSwipe = (toValue: number) => {
    Animated.spring(swipeX, {
      toValue,
      damping: 22,
      stiffness: 260,
      mass: 0.45,
      useNativeDriver: true,
    }).start();
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gesture) => {
          const horizontal = Math.abs(gesture.dx) > Math.abs(gesture.dy);
          if (!horizontal) return false;
          if (gesture.dx < -6) return true;
          if (swipeOpen && gesture.dx > 6) return true;
          return false;
        },
        onPanResponderGrant: () => {
          dragStartXRef.current = swipeOpen ? -DELETE_ACTION_WIDTH : 0;
        },
        onPanResponderMove: (_, gesture) => {
          const next = Math.min(
            0,
            Math.max(-DELETE_ACTION_WIDTH, dragStartXRef.current + gesture.dx),
          );
          swipeX.setValue(next);
        },
        onPanResponderRelease: (_, gesture) => {
          const currentX =
            typeof (swipeX as unknown as { __getValue?: () => number }).__getValue === "function"
              ? (swipeX as unknown as { __getValue: () => number }).__getValue()
              : dragStartXRef.current + gesture.dx;
          const shouldOpen =
            currentX <= -DELETE_ACTION_WIDTH * 0.45 || gesture.vx < -0.4;
          const shouldClose =
            currentX > -DELETE_ACTION_WIDTH * 0.35 || gesture.vx > 0.3;
          if (shouldOpen) {
            setSwipeOpen(true);
            animateSwipe(-DELETE_ACTION_WIDTH);
            return;
          }
          if (shouldClose) {
            setSwipeOpen(false);
            animateSwipe(0);
            return;
          }
          animateSwipe(swipeOpen ? -DELETE_ACTION_WIDTH : 0);
        },
        onPanResponderTerminate: () => {
          animateSwipe(swipeOpen ? -DELETE_ACTION_WIDTH : 0);
        },
        onPanResponderTerminationRequest: () => true,
      }),
    [swipeOpen, swipeX],
  );

  return (
    <View style={styles.swipeShell}>
      <View style={styles.deleteActionContainer}>
        <Pressable
          disabled={saving || deleting}
          onPress={() => {
            Alert.alert("Delete session?", "This removes this session from your history.", [
              { text: "Cancel", style: "cancel" },
              { text: "Delete", style: "destructive", onPress: onDelete },
            ]);
          }}
          style={styles.deleteActionButton}
        >
          <View style={styles.trashIcon} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <View style={styles.trashLid} />
            <View style={styles.trashHandle} />
            <View style={styles.trashBody}>
              <View style={styles.trashLine} />
              <View style={styles.trashLine} />
            </View>
          </View>
          <Text style={styles.deleteActionLabel}>{deleting ? "Deleting..." : "Delete"}</Text>
        </Pressable>
      </View>

      <Animated.View style={[styles.swipeFront, { transform: [{ translateX: swipeX }] }]} {...panResponder.panHandlers}>
        <Pressable
          onPress={() => {
            if (swipeOpen) {
              setSwipeOpen(false);
              animateSwipe(0);
              return;
            }
            setExpanded((prev) => !prev);
          }}
          style={styles.row}
        >
          {displayPhotos.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.photoStrip}
            >
              {displayPhotos.map((photo, index) => (
                <View key={`${item.id}-${photo.kind}-${photo.uri}-${index}`} style={styles.photoTile}>
                  <Pressable
                    onPress={() => {
                      setViewerIndex(index);
                      setViewerOpen(true);
                    }}
                  >
                    <Image resizeMode="contain" source={{ uri: photo.uri }} style={styles.photoPreview} />
                  </Pressable>
                  {editing ? (
                    <Pressable
                      onPress={() => removeDisplayPhoto(photo)}
                      style={styles.photoRemoveButton}
                    >
                      <Text style={styles.photoRemoveButtonText}>×</Text>
                    </Pressable>
                  ) : null}
                </View>
              ))}
            </ScrollView>
          ) : null}
          <View style={styles.topRow}>
            <View style={styles.titleWrap}>
              <Text numberOfLines={1} style={styles.title}>{item.topic}</Text>
              <Text numberOfLines={1} style={styles.subtleText}>{item.location_name ?? "No location"}</Text>
            </View>
            <View style={styles.scoreBadge}>
              <Text style={styles.scoreLabel}>Productivity</Text>
              <Text style={styles.scoreText}>{item.accomplishment_score ?? "-"}/10</Text>
            </View>
          </View>
          <Text style={styles.meta}>Duration {formatDuration(item.duration_minutes, item.auto_timed_out)}</Text>
          <Text style={styles.dateText}>{formatSessionDate(item.started_at)}</Text>
          {expanded && notes.length > 0 && !editing ? <Text style={styles.notes}>{notes}</Text> : null}

          {expanded ? (
            <View style={styles.actionsRow}>
              {!editing ? (
                <Pressable
                  disabled={saving || deleting}
                  onPress={() => {
                    setPendingNewPhotoUris([]);
                    setPendingRemovedPhotoUrls([]);
                    setPhotoEditError(null);
                    setEditing(true);
                  }}
                  style={styles.actionButton}
                >
                  <Text style={styles.actionButtonText}>Edit</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {expanded && editing ? (
            <View style={styles.editWrap}>
              <Text style={styles.editLabel}>Topic</Text>
              <TextInput
                value={editedTopic}
                onChangeText={setEditedTopic}
                style={styles.editInput}
                placeholder="Session topic"
                placeholderTextColor="#938776"
              />
              <Text style={styles.editLabel}>Start Note</Text>
              <TextInput
                multiline
                value={editedStartNote}
                onChangeText={setEditedStartNote}
                style={styles.editTextarea}
                placeholder="Start note..."
                placeholderTextColor="#938776"
              />
              <Text style={styles.editLabel}>End Note</Text>
              <TextInput
                multiline
                value={editedEndNote}
                onChangeText={setEditedEndNote}
                style={styles.editTextarea}
                placeholder="Add a note..."
                placeholderTextColor="#938776"
              />
              <Text style={styles.editLabel}>Spot Rating</Text>
              <View style={styles.ratingRow}>
                {[1, 2, 3, 4, 5].map((value) => (
                  <Pressable
                    key={`rating-${item.id}-${value}`}
                    onPress={() => setEditedRating(value)}
                    style={[styles.numberChip, editedRating === value && styles.numberChipActive]}
                  >
                    <Text style={[styles.numberChipText, editedRating === value && styles.numberChipTextActive]}>
                      {value}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.editLabel}>Focus Level</Text>
              <View style={styles.ratingRow}>
                {[1, 2, 3, 4].map((value) => (
                  <Pressable
                    key={`focus-${item.id}-${value}`}
                    onPress={() => setEditedFocusLevel(value)}
                    style={[styles.numberChip, editedFocusLevel === value && styles.numberChipActive]}
                  >
                    <Text
                      style={[styles.numberChipText, editedFocusLevel === value && styles.numberChipTextActive]}
                    >
                      {value}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.editLabel}>Productivity (1-10)</Text>
              <View style={styles.ratingRow}>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((value) => (
                  <Pressable
                    key={`accomplishment-${item.id}-${value}`}
                    onPress={() => setEditedAccomplishmentScore(value)}
                    style={[styles.numberChip, editedAccomplishmentScore === value && styles.numberChipActive]}
                  >
                    <Text
                      style={[
                        styles.numberChipText,
                        editedAccomplishmentScore === value && styles.numberChipTextActive,
                      ]}
                    >
                      {value}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.photoEditActions}>
                <Pressable disabled={saving} onPress={() => void addPhotoFromCamera()} style={styles.actionButton}>
                  <Text style={styles.actionButtonText}>Camera</Text>
                </Pressable>
                <Pressable disabled={saving} onPress={() => void addPhotoFromLibrary()} style={styles.actionButton}>
                  <Text style={styles.actionButtonText}>Add Photo</Text>
                </Pressable>
              </View>
              {photoEditError ? <Text style={styles.photoEditError}>{photoEditError}</Text> : null}
              <View style={styles.editActionsRow}>
                <Pressable
                  disabled={saving}
                  onPress={() => {
                    setEditedTopic(item.topic);
                    setEditedStartNote(item.start_note ?? "");
                    setEditedEndNote(item.end_note ?? "");
                    setEditedRating(item.rating ?? null);
                    setEditedFocusLevel(item.focus_level ?? null);
                    setEditedAccomplishmentScore(item.accomplishment_score ?? null);
                    setPendingNewPhotoUris([]);
                    setPendingRemovedPhotoUrls([]);
                    setPhotoEditError(null);
                    setEditing(false);
                  }}
                  style={styles.actionButton}
                >
                  <Text style={styles.actionButtonText}>Cancel</Text>
                </Pressable>
                <Pressable
                  disabled={saving}
                  onPress={() => {
                    const topic = editedTopic.trim();
                    const startNote = editedStartNote.trim();
                    const note = editedEndNote.trim();
                    onSaveEdit({
                      ...(topic && topic !== item.topic ? { topic } : {}),
                      ...(startNote !== (item.start_note ?? "") ? { start_note: startNote } : {}),
                      ...(note !== (item.end_note ?? "") ? { end_note: note } : {}),
                      ...(editedRating !== item.rating && editedRating !== null ? { rating: editedRating } : {}),
                      ...(editedFocusLevel !== item.focus_level && editedFocusLevel !== null
                        ? { focus_level: editedFocusLevel }
                        : {}),
                      ...(editedAccomplishmentScore !== item.accomplishment_score &&
                      editedAccomplishmentScore !== null
                        ? { accomplishment_score: editedAccomplishmentScore }
                        : {}),
                      ...(pendingNewPhotoUris.length ? { add_photo_uris: pendingNewPhotoUris } : {}),
                      ...(pendingRemovedPhotoUrls.length ? { remove_photo_urls: pendingRemovedPhotoUrls } : {}),
                    });
                    setPendingNewPhotoUris([]);
                    setPendingRemovedPhotoUrls([]);
                    setPhotoEditError(null);
                    setEditing(false);
                  }}
                  style={styles.saveButton}
                >
                  <Text style={styles.saveButtonText}>{saving ? "Saving..." : "Save"}</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </Pressable>
      </Animated.View>

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
            {displayPhotos.map((photo, index) => (
              <View key={`viewer-${item.id}-${index}`} style={[styles.viewerPage, { width: windowWidth }]}>
                <Image resizeMode="contain" source={{ uri: photo.uri }} style={styles.viewerImage} />
              </View>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  swipeShell: {
    position: "relative",
    overflow: "hidden",
    borderRadius: 14,
  },
  deleteActionContainer: {
    position: "absolute",
    top: 0,
    bottom: 0,
    right: 0,
    width: DELETE_ACTION_WIDTH,
    borderRadius: 14,
    overflow: "hidden",
  },
  deleteActionButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#c13f33",
    gap: 4,
  },
  trashIcon: {
    width: 18,
    alignItems: "center",
  },
  trashLid: {
    width: 16,
    height: 2.5,
    borderRadius: 2,
    backgroundColor: "#ffffff",
    marginBottom: 1,
  },
  trashHandle: {
    width: 7,
    height: 2,
    borderRadius: 2,
    backgroundColor: "#ffffff",
    marginBottom: 1.5,
  },
  trashBody: {
    width: 13,
    height: 13,
    borderRadius: 2.5,
    borderWidth: 1.7,
    borderColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 2.5,
  },
  trashLine: {
    width: 1.4,
    height: 7,
    borderRadius: 1,
    backgroundColor: "#ffffff",
  },
  deleteActionLabel: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "800",
  },
  swipeFront: {
    borderRadius: 14,
    overflow: "hidden",
  },
  row: {
    backgroundColor: "#fffdf9",
    borderRadius: 0,
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
  dateText: {
    color: "#7a7468",
    fontSize: 11,
    fontWeight: "600",
  },
  scoreBadge: {
    borderRadius: 12,
    backgroundColor: "#e9f3ec",
    paddingHorizontal: 8,
    paddingVertical: 6,
    alignItems: "flex-end",
    gap: 1,
  },
  scoreLabel: {
    color: "#5f7465",
    fontSize: 9,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.7,
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
  actionsRow: {
    marginTop: 2,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
  },
  actionButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#d9ccb8",
    backgroundColor: "#fff7eb",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  actionButtonText: {
    color: "#61513f",
    fontSize: 11,
    fontWeight: "700",
  },
  editWrap: {
    marginTop: 4,
    gap: 6,
  },
  editLabel: {
    color: "#5d5a4f",
    fontSize: 11,
    fontWeight: "700",
  },
  editInput: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#decfb8",
    backgroundColor: "#fffaf2",
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: "#2f3e31",
    fontSize: 13,
  },
  editTextarea: {
    minHeight: 68,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#decfb8",
    backgroundColor: "#fffaf2",
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: "#2f3e31",
    fontSize: 13,
    textAlignVertical: "top",
  },
  editActionsRow: {
    marginTop: 2,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
  },
  saveButton: {
    borderRadius: 999,
    backgroundColor: "#2f6b57",
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  saveButtonText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "700",
  },
  photoEditActions: {
    flexDirection: "row",
    gap: 8,
  },
  ratingRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  numberChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#d9ccb8",
    backgroundColor: "#fff7eb",
    minWidth: 32,
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  numberChipActive: {
    borderColor: "#2f6b57",
    backgroundColor: "#2f6b57",
  },
  numberChipText: {
    color: "#61513f",
    fontSize: 11,
    fontWeight: "700",
  },
  numberChipTextActive: {
    color: "#f5fbf7",
  },
  photoEditError: {
    color: "#8f4a3a",
    fontSize: 12,
    fontWeight: "600",
  },
  photoTile: {
    position: "relative",
  },
  photoPreview: {
    width: 190,
    height: 128,
    borderRadius: 10,
    backgroundColor: "#f3ecde",
  },
  photoRemoveButton: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(17, 19, 17, 0.72)",
    alignItems: "center",
    justifyContent: "center",
  },
  photoRemoveButtonText: {
    color: "#ffffff",
    fontSize: 15,
    lineHeight: 18,
    fontWeight: "800",
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
