import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { AuthProvider } from "./context/AuthContext";

function OpeningScreen({ onFinish }: { onFinish: () => void }) {
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
        Animated.delay(1520),
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

function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignupMode, setIsSignupMode] = useState(true);

  const primaryCtaText = useMemo(() => (isSignupMode ? "Sign Up" : "Login"), [isSignupMode]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.screen}
      >
        <View style={styles.card}>
          <Text style={styles.brand}>StudySpot</Text>
          <Text style={styles.title}>Find your best place to focus.</Text>
          <Text style={styles.subtitle}>
            StudySpot helps students discover nearby cafes, libraries, and quiet corners based
            on real check-ins and live activity trends.
          </Text>

          <View style={styles.form}>
            <View>
              <Text style={styles.label}>Email</Text>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                onChangeText={setEmail}
                placeholder="you@school.edu"
                placeholderTextColor="#8C7A5A"
                style={styles.input}
                value={email}
              />
            </View>

            <View>
              <Text style={styles.label}>Password</Text>
              <TextInput
                onChangeText={setPassword}
                placeholder="Create a password"
                placeholderTextColor="#8C7A5A"
                secureTextEntry
                style={styles.input}
                value={password}
              />
            </View>

            <Pressable style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>{primaryCtaText}</Text>
            </Pressable>
          </View>

          <Pressable onPress={() => setIsSignupMode((value) => !value)} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>
              {isSignupMode ? "I already have an account (Login)" : "I need an account (Sign Up)"}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export default function App() {
  const [showOpeningScreen, setShowOpeningScreen] = useState(true);

  return (
    <AuthProvider>
      <View style={styles.appShell}>
        <LoginScreen />
        {showOpeningScreen ? <OpeningScreen onFinish={() => setShowOpeningScreen(false)} /> : null}
      </View>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  appShell: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    backgroundColor: "#F4EEDC",
  },
  openingScreen: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
    backgroundColor: "#F1E6D0",
  },
  openingGlowLarge: {
    position: "absolute",
    width: 340,
    height: 340,
    borderRadius: 170,
    backgroundColor: "#588764",
    top: -40,
    right: -70,
    opacity: 0.2,
  },
  openingGlowSmall: {
    position: "absolute",
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: "#966443",
    bottom: -55,
    left: -60,
    opacity: 0.18,
  },
  openingCard: {
    minWidth: 260,
    alignItems: "center",
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(90, 107, 58, 0.22)",
    backgroundColor: "rgba(255, 251, 242, 0.9)",
    paddingHorizontal: 28,
    paddingVertical: 30,
    shadowColor: "#5A6B3A",
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  openingOverline: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2.4,
    textTransform: "uppercase",
    color: "#7A5630",
  },
  openingBrand: {
    marginTop: 12,
    fontSize: 38,
    lineHeight: 42,
    fontWeight: "800",
    letterSpacing: 0.6,
    color: "#2F261A",
  },
  screen: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(90, 107, 58, 0.35)",
    backgroundColor: "rgba(247, 242, 230, 0.92)",
    paddingHorizontal: 24,
    paddingVertical: 28,
  },
  brand: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 2,
    textTransform: "uppercase",
    color: "#5A6B3A",
  },
  title: {
    marginTop: 12,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: "700",
    color: "#2F261A",
  },
  subtitle: {
    marginTop: 12,
    fontSize: 14,
    lineHeight: 20,
    color: "#4A4030",
  },
  form: {
    marginTop: 24,
    gap: 14,
  },
  label: {
    marginBottom: 6,
    fontSize: 14,
    fontWeight: "600",
    color: "#3E3426",
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#B6A27D",
    backgroundColor: "#FFFDF7",
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#2F261A",
    fontSize: 15,
  },
  primaryButton: {
    marginTop: 4,
    borderRadius: 12,
    backgroundColor: "#5C7A35",
    paddingHorizontal: 16,
    paddingVertical: 13,
    alignItems: "center",
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FDFBF4",
  },
  secondaryButton: {
    marginTop: 18,
    alignItems: "center",
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#5A6B3A",
    textDecorationLine: "underline",
  },
});
