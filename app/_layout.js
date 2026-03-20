import { Stack, router } from 'expo-router';
import { useEffect } from 'react';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { ThemeProvider } from '../context/ThemeContext';
import { ActivityIndicator, View } from 'react-native';

function RootLayoutNav() {
  const { accessToken, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!accessToken) {
      router.replace('/login');
    } else {
      router.replace('/chat');
    }
  }, [accessToken, loading]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFF0F6' }}>
        <ActivityIndicator size="large" color="#E4387A" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="chat" />
      <Stack.Screen name="home" />
      <Stack.Screen name="upload" />
      <Stack.Screen name="view" />
      <Stack.Screen name="profile" />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <RootLayoutNav />
      </ThemeProvider>
    </AuthProvider>
  );
}
