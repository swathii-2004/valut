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
import { getIsChatActive } from '../utils/notificationState';

Notifications.setNotificationHandler({
  handleNotification: async () => {
    const chatActive = getIsChatActive();
    return {
      shouldShowAlert: !chatActive,
      shouldPlaySound: !chatActive,
      shouldSetBadge: !chatActive,
    };
  },
});

Notifications.setNotificationCategoryAsync('message', [
  { identifier: 'LIKE', buttonTitle: '❤️ Like', options: { opensAppToForeground: false } },
  {
    identifier: 'REPLY', buttonTitle: '💬 Reply',
    textInput: { submitButtonTitle: 'Send', placeholder: 'Type a reply...' },
    options: { opensAppToForeground: false },
  },
]).catch(() => {});

const EAS_PROJECT_ID = 'ba4ad1e5-bedc-4654-86e7-91277672c1b2';

async function registerForPushNotificationsAsync() {
  if (!Device.isDevice) return null;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default', importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250], lightColor: '#E4387A', sound: 'default',
    });
    await Notifications.setNotificationChannelAsync('messages', {
      name: 'Messages', importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250], lightColor: '#E4387A', sound: 'default',
      bypassDnd: false, lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') return null;
  try {
    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ??
      Constants?.easConfig?.projectId ??
      EAS_PROJECT_ID;
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    return tokenData.data;
  } catch { return null; }
}

function RootLayoutNav() {
  const { accessToken, loading, vaultId, vaultStatus, setVaultId, setVaultStatus } = useAuth();

  useEffect(() => {
    if (loading) return;

    if (!accessToken) {
      router.replace('/login');
      return;
    }

    // Fetch vault state from server (source of truth)
    (async () => {
      try {
        const res = await apiClient.get('/api/vault/mine');
        const vault = res.data?.vault;

        if (!vault) {
          // No vault yet — onboarding
          await setVaultId(null);
          await setVaultStatus(null);
          router.replace('/setup');
        } else if (vault.status === 'pending') {
          await setVaultId(vault.id);
          await setVaultStatus('pending');
          router.replace('/waiting');
        } else if (vault.status === 'active') {
          await setVaultId(vault.id);
          await setVaultStatus('active');
          router.replace('/chat');

          // Register push token
          const token = await registerForPushNotificationsAsync();
          if (token) {
            try { await apiClient.post('/api/profile/push-token', { token }); } catch {}
          }

          // Foreground notification handler
          const foregroundSub = Notifications.addNotificationReceivedListener(n => {
            console.log('[PUSH] Foreground:', n.request.content.title);
          });

          // Notification tap / action handler
          const responseSub = Notifications.addNotificationResponseReceivedListener(async (response) => {
            const { actionIdentifier, userText, notification } = response;
            const data = notification.request.content.data || {};
            if (actionIdentifier === 'LIKE' && data.messageId) {
              try { await apiClient.post(`/api/messages/${data.messageId}/react`, { emoji: '❤️' }); } catch {}
            } else if (actionIdentifier === 'REPLY' && data.messageId && userText?.trim()) {
              try {
                await apiClient.post('/api/messages', { content: userText.trim(), reply_to_id: data.messageId });
              } catch {}
            } else {
              router.navigate('/chat');
            }
          });

          return () => {
            Notifications.removeNotificationSubscription(foregroundSub);
            Notifications.removeNotificationSubscription(responseSub);
          };
        } else {
          // Suspended or unknown
          await setVaultId(vault.id);
          await setVaultStatus(vault.status);
          router.replace('/login');
        }
      } catch {
        // Network error — fall back to cached vault state
        if (!vaultId) {
          router.replace('/setup');
        } else if (vaultStatus === 'pending') {
          router.replace('/waiting');
        } else {
          router.replace('/chat');
        }
      }
    })();
  }, [accessToken, loading]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0D0D0D' }}>
        <ActivityIndicator size="large" color="#E4387A" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="login" />
      <Stack.Screen name="setup" />
      <Stack.Screen name="create-vault" />
      <Stack.Screen name="waiting" />
      <Stack.Screen name="join-vault" />
      <Stack.Screen name="connected" />
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
