import React, { useState } from "react";
import { StyleSheet, View } from "react-native";

import { OpeningScreen } from "./components/OpeningScreen";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { HomeScreen } from "./screens/HomeScreen";
import { LoginScreen } from "./screens/LoginScreen";

function AppShell() {
  const { isAuthenticated } = useAuth();
  const [showOpeningScreen, setShowOpeningScreen] = useState(true);

  return (
    <View style={styles.appShell}>
      {isAuthenticated ? <HomeScreen /> : <LoginScreen />}
      {showOpeningScreen ? <OpeningScreen onFinish={() => setShowOpeningScreen(false)} /> : null}
    </View>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  appShell: {
    flex: 1,
  },
});
