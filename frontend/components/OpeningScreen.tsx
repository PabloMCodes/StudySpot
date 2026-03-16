import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";

export function OpeningScreen({ onFinish }: { onFinish: () => void }) {
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(0.94)).current;

  useEffect(() => {
    const animation = Animated.sequence([
      Animated.parallel([
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 520,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.delay(2000),
      ]),
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 380,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    ]);

    animation.start(({ finished }) => {
      if (finished) {
        onFinish();
      }
    });

    return () => {
      animation.stop();
    };
  }, [fadeAnim, onFinish, scaleAnim]);

  return (
    <Animated.View pointerEvents="none" style={[styles.openingScreen, { opacity: fadeAnim }]}>
      <View style={styles.openingGlowLarge} />
      <View style={styles.openingGlowSmall} />
      <Animated.View style={[styles.openingCard, { transform: [{ scale: scaleAnim }] }]}>
        <Text style={styles.openingOverline}>Find Your Focus</Text>
        <Text style={styles.openingBrand}>Study Spot</Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  openingScreen: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
    backgroundColor: "#f1e4d8",
  },
  openingGlowLarge: {
    position: "absolute",
    width: 340,
    height: 340,
    borderRadius: 170,
    backgroundColor: "#588764",
    top: -40,
    right: -70,
    opacity: 0.35,
  },
  openingGlowSmall: {
    position: "absolute",
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: "#966443",
    bottom: -55,
    left: -60,
    opacity: 0.4,
  },
  openingCard: {
    minWidth: 260,
    alignItems: "center",
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(94, 140, 97, 0.22)",
    backgroundColor: "#FDFBF4",
    paddingHorizontal: 28,
    paddingVertical: 30,
    elevation: 4,
  },
  openingOverline: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2.4,
    textTransform: "uppercase",
    color: "#334226",
  },
  openingBrand: {
    marginTop: 12,
    fontSize: 38,
    lineHeight: 42,
    fontWeight: "800",
    letterSpacing: 0.6,
    color: "#588764",
  },
});
