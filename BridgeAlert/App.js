import './src/tasks/locationTask'; // registers TaskManager task at module load — must be first

import React from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Platform, Text } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import HomeScreen     from './src/screens/HomeScreen';
import SettingsScreen from './src/screens/SettingsScreen';

const Tab = createBottomTabNavigator();

const DarkTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: '#0a0a0a',
    card:        '#0d0d0d',
    border:      '#1a1a1a',
    text:        '#e0e0e0',
  },
};

const FONT = Platform.OS === 'ios' ? 'Courier New' : 'monospace';

export default function App() {
  return (
    <NavigationContainer theme={DarkTheme}>
      <StatusBar style="light" />
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerStyle:            { backgroundColor: '#0d0d0d', borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
          headerTitleStyle:       { fontFamily: FONT, fontSize: 13, fontWeight: '700', letterSpacing: 1, color: '#e0e0e0' },
          tabBarStyle:            { backgroundColor: '#0d0d0d', borderTopColor: '#1a1a1a', height: 56 },
          tabBarLabelStyle:       { fontFamily: FONT, fontSize: 9, letterSpacing: 0.5 },
          tabBarActiveTintColor:  '#FF6B00',
          tabBarInactiveTintColor:'#444',
          tabBarIcon: ({ color }) => {
            const icon = route.name === 'Home' ? '⌖' : '⚙';
            return <Text style={{ fontSize: 18, color }}>{icon}</Text>;
          },
        })}
      >
        <Tab.Screen name="Home"     component={HomeScreen}     options={{ title: 'Bridge Alert' }} />
        <Tab.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
