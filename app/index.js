import { Redirect } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { View, ActivityIndicator } from 'react-native';

export default function Index() {
    const { accessToken, loading, vaultStatus } = useAuth();

    if (loading) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFF0F6' }}>
                <ActivityIndicator size="large" color="#E4387A" />
            </View>
        );
    }

    if (!accessToken) return <Redirect href="/login" />;
    
    // Only go to chat if we know the vault is active, otherwise _layout.js will handle the final routing
    if (vaultStatus === 'active') return <Redirect href="/chat" />;
    if (vaultStatus === 'pending') return <Redirect href="/waiting" />;
    
    // If no vault status yet, stay on index (or go to setup). 
    // _layout.js is fetching the truth asynchronously and will route us.
    return (
        <View style={{ flex: 1, backgroundColor: '#0D0D0D' }} />
    );
}
