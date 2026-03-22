import { Stack, router } from 'expo-router';
import { useEffect } from 'react';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { ThemeProvider } from '../context/ThemeContext';
import { ActivityIndicator, View, Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import apiClient from '../api/client';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

async function registerForPushNotificationsAsync() {
  if (!Device.isDevice) {
    console.log('[PUSH] Must use a physical device — skipping on emulator/simulator');
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#E4387A',
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') {
    console.log('[PUSH] Permission denied');
    return null;
  }

  try {
    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ??
      Constants?.easConfig?.projectId;

    if (!projectId) {
      console.log('[PUSH] Project ID not found — run "eas init" to configure project.');
      return null;
    }

    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    console.log('[PUSH] Token obtained:', token);
    return token;
  } catch (e) {
    console.log('[PUSH] Error getting push token:', e.message);
  }
  return null;
}


function RootLayoutNav() {
  const { accessToken, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!accessToken) {
      router.replace('/login');
    } else {
      router.replace('/chat');

      // Register for push notifications once logged in
      registerForPushNotificationsAsync().then(token => {
        if (token) {
          apiClient.post('/api/profile/push-token', { token })
            .catch(err => console.log('Failed to save push token:', err.message));
        }
      });

      // Handle notification taps
      const responseListener = Notifications.addNotificationResponseReceivedListener(response => {
        router.navigate('/chat');
      });

      return () => {
        Notifications.removeNotificationSubscription(responseListener);
      };
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
      <Stack.Screen name="index" />
      <Stack.Screen name="login" />
      <Stack.Screen name="chat" />
      <Stack.Screen name="home" />
      <Stack.Screen name="upload" />
      <Stack.Screen name="view" />
      <Stack.Screen name="profile" />
      <Stack.Screen name="dates" />
      <Stack.Screen name="starred" />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <ThemeProvider>
          <RootLayoutNav />
        </ThemeProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
