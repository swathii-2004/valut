import { Redirect } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { View, ActivityIndicator } from 'react-native';

export default function Index() {
    const { accessToken, loading } = useAuth();

    if (loading) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFF0F6' }}>
                <ActivityIndicator size="large" color="#E4387A" />
            </View>
        );
    }

    return <Redirect href={accessToken ? '/chat' : '/login'} />;
}
