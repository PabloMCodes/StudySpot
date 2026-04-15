import * as ImagePicker from "expo-image-picker";
import React, { useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";

interface PhotoPickerProps {
  onPhotoPicked: (uri: string) => void;
}

export function PhotoPicker({ onPhotoPicked }: PhotoPickerProps) {
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pickFromLibrary = async () => {
    setError(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError("Media library permission denied.");
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
    setPreviewUri(uri);
    onPhotoPicked(uri);
  };

  const pickFromCamera = async () => {
    setError(null);
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setError("Camera permission denied.");
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
    setPreviewUri(uri);
    onPhotoPicked(uri);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.actions}>
        <Pressable onPress={() => void pickFromCamera()} style={styles.photoButton}>
          <Text style={styles.photoButtonText}>📸 Camera</Text>
        </Pressable>
        <Pressable onPress={() => void pickFromLibrary()} style={styles.photoButton}>
          <Text style={styles.photoButtonText}>🖼️ Library</Text>
        </Pressable>
      </View>
      {previewUri ? <Image source={{ uri: previewUri }} style={styles.preview} /> : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
  },
  actions: {
    flexDirection: "row",
    gap: 8,
  },
  photoButton: {
    borderRadius: 10,
    backgroundColor: "#eef3ec",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  photoButtonText: {
    color: "#3f5640",
    fontSize: 13,
    fontWeight: "700",
  },
  preview: {
    width: 120,
    height: 120,
    borderRadius: 12,
  },
  errorText: {
    color: "#8f4a3a",
    fontSize: 12,
    fontWeight: "600",
  },
});
