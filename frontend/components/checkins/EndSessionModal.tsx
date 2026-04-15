import React, { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { FocusSelector } from "./FocusSelector";
import { PhotoPicker } from "./PhotoPicker";
import { StarRating } from "./StarRating";
import type { CrowdLabel } from "../../types/checkin";

const CHECKOUT_LABEL_OPTIONS: Array<{ value: CrowdLabel; label: string }> = [
  { value: "empty", label: "Empty" },
  { value: "available", label: "Available" },
  { value: "busy", label: "Busy" },
  { value: "packed", label: "Packed" },
];

interface EndSessionModalProps {
  visible: boolean;
  loading: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    rating: number | null;
    focusLevel: number | null;
    note: string;
    photoUri: string | null;
    checkoutCrowdLabel: CrowdLabel | null;
  }) => void;
}

export function EndSessionModal({ visible, loading, onClose, onSubmit }: EndSessionModalProps) {
  const [rating, setRating] = useState<number | null>(null);
  const [focusLevel, setFocusLevel] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [checkoutCrowdLabel, setCheckoutCrowdLabel] = useState<CrowdLabel | null>(null);

  const handleFinish = () => {
    onSubmit({ rating, focusLevel, note, photoUri, checkoutCrowdLabel });
  };

  return (
    <Modal animationType="fade" transparent visible={visible}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Nice work 👍</Text>
          <Text style={styles.label}>⭐ Rate this spot</Text>
          <StarRating onChange={setRating} value={rating} />

          <Text style={styles.label}>How did this session feel?</Text>
          <FocusSelector onChange={setFocusLevel} value={focusLevel} />

          <TextInput
            multiline
            onChangeText={setNote}
            placeholder="📝 Add note (optional)"
            placeholderTextColor="#8a7d6a"
            style={styles.noteInput}
            textAlignVertical="top"
            value={note}
          />

          <Text style={styles.label}>📸 Add photo (optional)</Text>
          <PhotoPicker onPhotoPicked={setPhotoUri} />
          <View style={styles.checkoutWrap}>
            <Text style={styles.label}>How full is it now? (optional)</Text>
            <View style={styles.checkoutOptions}>
              {CHECKOUT_LABEL_OPTIONS.map((option) => (
                <Pressable
                  key={option.value}
                  onPress={() => setCheckoutCrowdLabel(option.value)}
                  style={[styles.checkoutChip, checkoutCrowdLabel === option.value && styles.checkoutChipActive]}
                >
                  <Text
                    style={[
                      styles.checkoutChipText,
                      checkoutCrowdLabel === option.value && styles.checkoutChipTextActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              ))}
              <Pressable onPress={() => setCheckoutCrowdLabel(null)} style={styles.clearChip}>
                <Text style={styles.clearChipText}>Skip</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.actions}>
            <Pressable disabled={loading} onPress={onClose} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </Pressable>
            <Pressable disabled={loading} onPress={handleFinish} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>{loading ? "Finishing..." : "Finish Session"}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(22, 28, 22, 0.38)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  card: {
    width: "100%",
    backgroundColor: "#fffdf9",
    borderRadius: 18,
    padding: 16,
    gap: 12,
  },
  title: {
    color: "#2f4031",
    fontSize: 20,
    fontWeight: "800",
  },
  label: {
    color: "#4e5c49",
    fontSize: 13,
    fontWeight: "700",
  },
  noteInput: {
    minHeight: 80,
    borderRadius: 12,
    backgroundColor: "#f7f3ea",
    color: "#2f3c2b",
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  checkoutWrap: {
    gap: 8,
  },
  checkoutOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  checkoutChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#b7c3b2",
    backgroundColor: "#ffffff",
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  checkoutChipActive: {
    borderColor: "#2f6b57",
    backgroundColor: "#2f6b57",
  },
  checkoutChipText: {
    color: "#496047",
    fontSize: 12,
    fontWeight: "700",
  },
  checkoutChipTextActive: {
    color: "#f6fbf8",
  },
  clearChip: {
    borderRadius: 999,
    backgroundColor: "#edf2eb",
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  clearChipText: {
    color: "#4a6048",
    fontSize: 12,
    fontWeight: "700",
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 2,
  },
  primaryButton: {
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: "#2f6b57",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  primaryButtonText: {
    color: "#f5fbf7",
    fontSize: 14,
    fontWeight: "800",
  },
  secondaryButton: {
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: "#edf2eb",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  secondaryButtonText: {
    color: "#486047",
    fontSize: 13,
    fontWeight: "700",
  },
});
