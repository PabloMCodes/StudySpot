import { StatusBar } from "expo-status-bar";
import { useMemo, useState } from "react";
import {
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
  return (
    <AuthProvider>
      <LoginScreen />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F4EEDC",
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
