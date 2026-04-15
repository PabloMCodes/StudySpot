import React from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { LocationSelector } from "./LocationSelector";
import type { CrowdLabel } from "../../types/checkin";

const CHECKIN_LABEL_OPTIONS: Array<{ value: CrowdLabel; label: string }> = [
  { value: "empty", label: "Empty" },
  { value: "available", label: "Available" },
  { value: "busy", label: "Busy" },
  { value: "packed", label: "Packed" },
];

interface SessionInputProps {
  topic: string;
  onTopicChange: (value: string) => void;
  note: string;
  onNoteChange: (value: string) => void;
  noteExpanded: boolean;
  onToggleNoteExpanded: () => void;
  useCurrentLocation: boolean;
  onToggleUseCurrentLocation: () => void;
  checkinCrowdLabel: CrowdLabel | null;
  onCheckinCrowdLabelChange: (value: CrowdLabel) => void;
  selectedLocationName: string | null;
  onSubmit: () => void;
  onCancel: () => void;
  submitting: boolean;
}

export function SessionInput({
  topic,
  onTopicChange,
  note,
  onNoteChange,
  noteExpanded,
  onToggleNoteExpanded,
  useCurrentLocation,
  onToggleUseCurrentLocation,
  checkinCrowdLabel,
  onCheckinCrowdLabelChange,
  selectedLocationName,
  onSubmit,
  onCancel,
  submitting,
}: SessionInputProps) {
  return (
    <View style={styles.card}>
      <TextInput
        onChangeText={onTopicChange}
        placeholder="What are you studying?"
        placeholderTextColor="#8a7d6a"
        style={styles.singleLineInput}
        value={topic}
      />

      <Pressable onPress={onToggleNoteExpanded} style={styles.noteToggle}>
        <Text style={styles.noteToggleText}>{noteExpanded ? "Hide optional note" : "Add optional note"}</Text>
      </Pressable>

      {noteExpanded ? (
        <TextInput
          multiline
          onChangeText={onNoteChange}
          placeholder="Optional note"
          placeholderTextColor="#8a7d6a"
          style={styles.noteInput}
          textAlignVertical="top"
          value={note}
        />
      ) : null}

      <LocationSelector
        onToggleUseCurrentLocation={onToggleUseCurrentLocation}
        selectedLocationName={selectedLocationName}
        useCurrentLocation={useCurrentLocation}
      />
      {useCurrentLocation ? (
        <View style={styles.crowdWrap}>
          <Text style={styles.crowdTitle}>How full does it feel? (required)</Text>
          <View style={styles.crowdOptions}>
            {CHECKIN_LABEL_OPTIONS.map((option) => (
              <Pressable
                key={option.value}
                onPress={() => onCheckinCrowdLabelChange(option.value)}
                style={[styles.crowdChip, checkinCrowdLabel === option.value && styles.crowdChipActive]}
              >
                <Text style={[styles.crowdChipText, checkinCrowdLabel === option.value && styles.crowdChipTextActive]}>
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.actionsRow}>
        <Pressable
          disabled={submitting}
          onPress={onSubmit}
          style={({ pressed }) => [
            styles.primaryButton,
            submitting && styles.buttonDisabled,
            pressed && !submitting && styles.buttonPressed,
          ]}
        >
          <Text style={styles.primaryButtonText}>{submitting ? "Starting..." : "Start"}</Text>
        </Pressable>
        <Pressable disabled={submitting} onPress={onCancel} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fffdf9",
    borderRadius: 22,
    padding: 14,
    gap: 12,
    shadowColor: "#1f2b1f",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  singleLineInput: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: "#f7f3ea",
    color: "#2f3c2b",
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  noteToggle: {
    alignSelf: "flex-start",
    paddingVertical: 4,
  },
  noteToggleText: {
    color: "#50634b",
    fontSize: 12,
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
  crowdWrap: {
    gap: 8,
  },
  crowdTitle: {
    color: "#3f4f3a",
    fontSize: 12,
    fontWeight: "700",
  },
  crowdOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  crowdChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#b7c3b2",
    backgroundColor: "#ffffff",
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  crowdChipActive: {
    borderColor: "#2f6b57",
    backgroundColor: "#2f6b57",
  },
  crowdChipText: {
    color: "#496047",
    fontSize: 12,
    fontWeight: "700",
  },
  crowdChipTextActive: {
    color: "#f6fbf8",
  },
  actionsRow: {
    flexDirection: "row",
    gap: 10,
  },
  primaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: "#2f6b57",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  primaryButtonText: {
    color: "#f5fbf7",
    fontSize: 15,
    fontWeight: "800",
  },
  secondaryButton: {
    minHeight: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    backgroundColor: "#eef3ec",
  },
  secondaryButtonText: {
    color: "#486047",
    fontSize: 14,
    fontWeight: "700",
  },
  buttonPressed: {
    opacity: 0.9,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
