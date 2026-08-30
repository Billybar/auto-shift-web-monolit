import React from 'react';
import { Tabs, Redirect } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { CalendarDays, Clock, User } from 'lucide-react-native';
import { useAuth } from '../../hooks/useAuth';

export default function TabsLayout() {
  const { isAuthenticated, isLoading } = useAuth();

  // Show a loading spinner while checking the token in local storage
  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#ffffff' }}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  // Redirect to login screen if the user is not authenticated
  if (!isAuthenticated) {
    return <Redirect href="/(auth)/login" />;
  }

  // Render the bottom tabs for authenticated employees
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#2563eb', // blue-600
        tabBarInactiveTintColor: '#6b7280', // gray-500
        tabBarStyle: {
          backgroundColor: '#ffffff',
          borderTopWidth: 1,
          borderTopColor: '#f3f4f6',
          paddingBottom: 5,
          paddingTop: 5,
          height: 60,
        },
        headerStyle: {
          backgroundColor: '#ffffff',
        },
        headerTitleStyle: {
          fontWeight: '600',
          color: '#111827',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'סידור עבודה',
          tabBarLabel: 'משמרות',
          tabBarIcon: ({ color }) => <CalendarDays color={color} size={24} />,
        }}
      />
      <Tabs.Screen
        name="constraints"
        options={{
          title: 'הגשת אילוצים',
          tabBarLabel: 'אילוצים',
          tabBarIcon: ({ color }) => <Clock color={color} size={24} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'פרופיל אישי',
          tabBarLabel: 'פרופיל',
          tabBarIcon: ({ color }) => <User color={color} size={24} />,
        }}
      />
    </Tabs>
  );
}