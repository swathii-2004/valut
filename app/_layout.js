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

// Hardcoded projectId - most reliable approach for production APKs
const EAS_PROJECT_ID = 'ba4ad1e5-bedc-4654-86e7-91277672c1b2';

async function registerForPushNotificationsAsync() {
  if (!Device.isDevice) {
    console.log('[PUSH] Skipping — not a physical device');
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#E4387A',
      sound: 'default',
      enableVibrate: true,
    });
    // High-priority 'messages' channel that matches backend channelId
    await Notifications.setNotificationChannelAsync('messages', {
      name: 'Messages',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#E4387A',
      sound: 'default',
      enableVibrate: true,
      bypassDnd: false,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('[PUSH] ❌ Permission denied — user must enable notifications in Settings');
    return null;
  }

  try {
    // Try Constants first, fall back to hardcoded ID
    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ??
      Constants?.easConfig?.projectId ??
      EAS_PROJECT_ID;

    console.log('[PUSH] Using projectId:', projectId);
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenData.data;
    console.log('[PUSH] ✅ Token obtained:', token);
    return token;
  } catch (e) {
    console.log('[PUSH] ❌ Error getting token:', e.message);
    return null;
  }
}

function RootLayoutNav() {
  const { accessToken, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!accessToken) {
      router.replace('/login');
    } else {
      router.replace('/chat');

      // Register push token with retries
      const saveToken = async () => {
        const token = await registerForPushNotificationsAsync();
        if (token) {
          try {
            await apiClient.post('/api/profile/push-token', { token });
            console.log('[PUSH] ✅ Token saved to server');
          } catch (err) {
            console.log('[PUSH] ❌ Failed to save token:', err.message);
          }
        }
      };
      saveToken();

      // Show notifications when app is in foreground
      const foregroundSub = Notifications.addNotificationReceivedListener(notification => {
        console.log('[PUSH] Foreground notification received:', notification.request.content.title);
      });

      // Handle notification taps
      const responseSub = Notifications.addNotificationResponseReceivedListener(() => {
        router.navigate('/chat');
      });

      return () => {
        Notifications.removeNotificationSubscription(foregroundSub);
        Notifications.removeNotificationSubscription(responseSub);
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
