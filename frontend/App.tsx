import { StatusBar } from "expo-status-bar";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  ActivityIndicator,
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
        //SS: page duration until fade
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

function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignupMode, setIsSignupMode] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  //Login: Main title text
  const titleText = useMemo(() => (isSignupMode ? "Create your account" : "Welcome"), [isSignupMode]);
  const subtitleText = useMemo(
    () =>
      isSignupMode
        ? "Join StudySpot to find and share the best places to focus."
        : "We Saved You A Spot!", //Login: subtitle text
    [isSignupMode]
  );
  const primaryCtaText = useMemo(() => (isSignupMode ? "Sign Up" : "Sign Up"), [isSignupMode]); //Login: Sign up button text
  const isValid = email.trim().length > 0 && password.trim().length > 0;
  const handlePrimaryPress = () => {
    if (!isValid || loading) return;
    setLoading(true);
    setTimeout(() => setLoading(false), 1000);
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
                  textContentType="emailAddress"
                  testID="emailInput"
                  onChangeText={setEmail}
                  placeholder="studiousfoo@gmail.com" //Login: email placeholder
                  placeholderTextColor="#8C7A5A"
                  style={styles.input}
                  value={email}
                />
              </View>
            </View>

            <View>
              <Text style={styles.label}>Password</Text>
              <View style={styles.inputWrapper}>
                <TextInput
                  onChangeText={setPassword}
                  placeholder={isSignupMode ? "Create a password" : "studiousfoo123*"} //Login: PW placeholder
                  placeholderTextColor="#8C7A5A"
                  secureTextEntry={!showPassword}
                  textContentType={isSignupMode ? "newPassword" : "password"}
                  testID="passwordInput"
                  style={styles.input}
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
              style={[styles.primaryButton, (!isValid || loading) && styles.primaryButtonDisabled]}
              disabled={!isValid || loading}
              onPress={handlePrimaryPress}
              accessibilityRole="button"
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

            <Pressable style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Log In with Google</Text>
            </Pressable>

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

  // Login page background color
  safeArea: {
    flex: 1,
    backgroundColor: "#f1e4d8",
  },
  openingScreen: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
    backgroundColor: "#f1e4d8", //SS: main background color
  },

  openingGlowLarge: {
    position: "absolute",
    width: 340,
    height: 340,
    borderRadius: 170,
    backgroundColor: "#588764",  //SS: top right circle color
    top: -40,
    right: -70,
    opacity: 0.35, 
    //SS: top right circle opacity
    // 0 = background color
    //0 < closer to true color
  },
  openingGlowSmall: {
    position: "absolute",
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: "#966443", //SS: lower left circle color
    bottom: -55,
    left: -60,
    opacity: 0.4, 
    //SS: lower left circle opacity
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
    color: "#334226", //SS: mini title text color
  },
  openingBrand: {
    marginTop: 12,
    fontSize: 38,
    lineHeight: 42,
    fontWeight: "800",
    letterSpacing: 0.6,
    color: "#588764", //SS: main title text color
  },
  screen: {
    flex: 1,
    justifyContent: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingTop: 75, 
    //Login: ALL text spacing from top of screen
    //1 = closest to top of screen 
    //100+ = farther down vertically from screen
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
    //Login: STUDYSPOT text color
    color: "#334226", //dark green P2
  },
  title: {
    marginTop: 6,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "700",
    //Login: Title text color 
    color: "#588764", //light green P2
    textAlign: "center",
  },
  subtitle: {
    marginTop: 4,
    fontSize: 14,
    lineHeight: 20,
    //Login: subtitle text color
    color: "#334226", //dark green P2
    textAlign: "center",
    opacity: 0.9,
  },
  form: {
    marginTop: 18,
    gap: 10,
  },
  //Login: Email / PW text color
  label: {
    marginBottom: 6,
    fontSize: 14,
    fontWeight: "600",
    color: "#334226", //dark green P2
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
    backgroundColor: "#588764", //Login: Sign up button color
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
  linkRight: {
    alignSelf: "flex-end",
    marginTop: 6,
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
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#588764",
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

  //Login: large spot colors
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

  //Login: mini spot colors
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
