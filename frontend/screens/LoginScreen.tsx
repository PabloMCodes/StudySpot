import { StatusBar } from "expo-status-bar";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Google from "expo-auth-session/providers/google";

import { useAuth } from "../context/AuthContext";
import { login, signInWithEmailPassword, signUpWithEmailPassword } from "../services/authService";

WebBrowser.maybeCompleteAuthSession();

export function LoginScreen() {
  const { setAccessToken } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignupMode, setIsSignupMode] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [authMessage, setAuthMessage] = useState<string | null>(null);

  const [request, response, promptAsync] = Google.useAuthRequest({
    clientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    scopes: ["profile", "email"],
    selectAccount: true,
  });

  const titleText = useMemo(() => (isSignupMode ? "Create your account" : "Welcome"), [isSignupMode]);
  const subtitleText = useMemo(
    () =>
      isSignupMode
        ? "Join StudySpot to find and share the best places to focus."
        : "We Saved You A Spot!",
    [isSignupMode],
  );
  const primaryCtaText = useMemo(() => (isSignupMode ? "Sign Up" : "Log In"), [isSignupMode]);
  const isValid = email.trim().length > 0 && password.trim().length > 0;

  const handlePrimaryPress = async () => {
    if (!isValid || loading) return;

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPassword = password.trim();

    setLoading(true);
    setGoogleError(null);
    setAuthMessage(null);

    try {
      const response = isSignupMode
        ? await signUpWithEmailPassword(normalizedEmail, normalizedPassword)
        : await signInWithEmailPassword(normalizedEmail, normalizedPassword);

      if (!response.success) {
        setAuthMessage(response.error ?? "Authentication failed.");
        return;
      }

      if (response.data?.access_token) {
        setAccessToken(response.data.access_token);
        return;
      }

      setAuthMessage("Account created. Log in to continue.");
      setIsSignupMode(false);
      setPassword("");
    } catch {
      setAuthMessage("Unable to complete authentication. Try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (response?.type !== "success") return;

    const idToken =
      response.params?.id_token ??
      response.authentication?.idToken ??
      response.params?.idToken ??
      null;

    if (!idToken) {
      setGoogleError("Google sign-in failed to return an ID token.");
      setGoogleLoading(false);
      return;
    }

    login({ id_token: idToken })
      .then((apiResponse) => {
        if (!apiResponse.success || !apiResponse.data?.access_token) {
          setGoogleError(apiResponse.error ?? "Google sign-in failed.");
          setGoogleLoading(false);
          return;
        }

        setAccessToken(apiResponse.data.access_token);
        setGoogleLoading(false);
      })
      .catch(() => {
        setGoogleError("Unable to reach the server. Try again.");
        setGoogleLoading(false);
      });
  }, [response, setAccessToken]);

  const handleGooglePress = () => {
    if (!request || googleLoading) return;
    setGoogleError(null);
    setAuthMessage(null);
    setGoogleLoading(true);
    promptAsync().catch(() => {
      setGoogleError("Google sign-in was cancelled.");
      setGoogleLoading(false);
    });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.screen}
      >
        <View style={styles.card}>
          <Text style={styles.brand}>StudySpot</Text>
          <Text style={styles.title}>{titleText}</Text>
          <Text style={styles.subtitle}>{subtitleText}</Text>

          <View style={styles.form}>
            <View>
              <Text style={styles.label}>Email</Text>
              <View style={styles.inputWrapper}>
                <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  onChangeText={setEmail}
                  placeholder="ex: studiousfoo@gmail.com"
                  placeholderTextColor="#8C7A5A"
                  style={styles.input}
                  testID="emailInput"
                  textContentType="emailAddress"
                  value={email}
                />
              </View>
            </View>

            <View>
              <Text style={styles.label}>Password</Text>
              <View style={styles.inputWrapper}>
                <TextInput
                  onChangeText={setPassword}
                  placeholder={isSignupMode ? "Create a password" : "ex: studiousfoo123*"}
                  placeholderTextColor="#8C7A5A"
                  secureTextEntry={!showPassword}
                  style={styles.input}
                  testID="passwordInput"
                  textContentType={isSignupMode ? "newPassword" : "password"}
                  value={password}
                />
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setShowPassword(!showPassword)}
                  style={styles.inputRightAction}
                >
                  <Text style={styles.linkText}>{showPassword ? "Hide" : "Show"}</Text>
                </Pressable>
              </View>
            </View>

            <Pressable
              accessibilityRole="button"
              disabled={!isValid || loading}
              onPress={() => {
                void handlePrimaryPress();
              }}
              style={[styles.primaryButton, (!isValid || loading) && styles.primaryButtonDisabled]}
              testID="primaryCta"
            >
              {loading ? (
                <ActivityIndicator color="#FDFBF4" />
              ) : (
                <Text style={styles.primaryButtonText}>{primaryCtaText}</Text>
              )}
            </Pressable>

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            <Pressable
              accessibilityRole="button"
              disabled={!request || googleLoading}
              onPress={handleGooglePress}
              style={[styles.secondaryButton, (!request || googleLoading) && styles.secondaryButtonDisabled]}
            >
              {googleLoading ? (
                <ActivityIndicator color="#588764" />
              ) : (
                <Text style={styles.secondaryButtonText}>Log In with Google</Text>
              )}
            </Pressable>

            {googleError ? <Text style={styles.errorText}>{googleError}</Text> : null}
            {authMessage ? <Text style={styles.errorText}>{authMessage}</Text> : null}

            <View style={styles.linkRow}>
              <Text style={styles.mutedText}>
                {isSignupMode ? "Already have an account?" : "Need an account?"}
              </Text>
              <Pressable onPress={() => setIsSignupMode(!isSignupMode)}>
                <Text style={styles.linkText}>{isSignupMode ? "Log In" : "Sign Up"}</Text>
              </Pressable>
            </View>

            <Text style={styles.termsText}>
              By continuing, you agree to our Terms and Privacy Policy.
            </Text>
          </View>
        </View>
      </KeyboardAvoidingView>
      <View pointerEvents="none" style={styles.spotField}>
        <View style={[styles.spotBlob, styles.spotBlobLeft]} />
        <View style={[styles.spotBlob, styles.spotBlobRight]} />
        <View style={[styles.spotBlob, styles.spotBlobFar]} />
        <View style={[styles.spotBubble, styles.spotBubbleOne]} />
        <View style={[styles.spotBubble, styles.spotBubbleTwo]} />
        <View style={[styles.spotBubble, styles.spotBubbleThree]} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f1e4d8",
  },
  screen: {
    flex: 1,
    justifyContent: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingTop: 75,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    alignSelf: "center",
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  brand: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 2,
    textTransform: "uppercase",
    color: "#334226",
  },
  title: {
    marginTop: 6,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "700",
    color: "#588764",
    textAlign: "center",
  },
  subtitle: {
    marginTop: 4,
    fontSize: 14,
    lineHeight: 20,
    color: "#334226",
    textAlign: "center",
    opacity: 0.9,
  },
  form: {
    marginTop: 18,
    gap: 10,
  },
  label: {
    marginBottom: 6,
    fontSize: 14,
    fontWeight: "600",
    color: "#334226",
  },
  inputWrapper: {
    position: "relative",
  },
  input: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#B6A27D",
    backgroundColor: "#FFFDF7",
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: "#2F261A",
    fontSize: 15,
  },
  inputRightAction: {
    position: "absolute",
    right: 12,
    top: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  primaryButton: {
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#334226",
    backgroundColor: "#588764",
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FDFBF4",
  },
  linkText: {
    color: "#4f4b3b",
    fontWeight: "700",
  },
  linkRow: {
    marginTop: 6,
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
  },
  mutedText: {
    color: "#3E3426",
    opacity: 0.7,
  },
  dividerRow: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#B6A27D",
    opacity: 0.6,
  },
  dividerText: {
    color: "#3E3426",
    opacity: 0.7,
    paddingHorizontal: 6,
    fontWeight: "600",
  },
  secondaryButton: {
    marginTop: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#588764",
    backgroundColor: "#FDFBF4",
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: "center",
  },
  secondaryButtonDisabled: {
    opacity: 0.7,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#588764",
  },
  errorText: {
    marginTop: 6,
    textAlign: "center",
    color: "#8B2D2D",
    fontSize: 12,
    fontWeight: "600",
  },
  termsText: {
    marginTop: 8,
    textAlign: "center",
    color: "#3E3426",
    opacity: 0.65,
    fontSize: 11,
  },
  spotField: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 170,
  },
  spotBlob: {
    position: "absolute",
    borderRadius: 999,
    opacity: 0.22,
  },
  spotBlobLeft: {
    width: 220,
    height: 220,
    left: -60,
    bottom: -120,
    backgroundColor: "#B6A27D",
  },
  spotBlobRight: {
    width: 280,
    height: 280,
    right: -110,
    bottom: -150,
    backgroundColor: "#588764",
  },
  spotBlobFar: {
    width: 240,
    height: 240,
    right: 60,
    bottom: -170,
    backgroundColor: "#4f4b3b",
    opacity: 0.18,
  },
  spotBubble: {
    position: "absolute",
    borderRadius: 999,
    opacity: 0.7,
  },
  spotBubbleOne: {
    width: 44,
    height: 44,
    left: 34,
    bottom: 38,
    backgroundColor: "#334226",
  },
  spotBubbleTwo: {
    width: 28,
    height: 28,
    left: 120,
    bottom: 62,
    backgroundColor: "#588764",
  },
  spotBubbleThree: {
    width: 36,
    height: 36,
    right: 56,
    bottom: 46,
    backgroundColor: "#966443",
  },
});
