import { Redirect } from 'expo-router';

export default function Index() {
  // Redirect to the login screen as the default entry point
  return <Redirect href="/(auth)/login" />;
}