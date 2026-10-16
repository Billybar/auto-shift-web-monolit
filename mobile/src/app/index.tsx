import { Redirect } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { useAuth } from '../hooks/useAuth';

export default function Index() {
  const { isAuthenticated, isLoading } = useAuth();

  // Wait until the stored token is loaded before choosing the entry screen
  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#ffffff' }}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  // Signed-in users go straight to the app; everyone else to the login screen
  return <Redirect href={isAuthenticated ? '/(tabs)' : '/(auth)/login'} />;
}
