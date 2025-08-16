import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ScanScreen from './screens/ScanScreen';
import LoginScreen from './screens/LoginScreen';
import HomeScreen from './screens/HomeScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Login"  // ✅ This ensures Login shows first
        screenOptions={{
          headerStyle: { backgroundColor: '#1a1a1a' },
          headerTintColor: '#fff',
        }}
      >
        <Stack.Screen name="Login" component={LoginScreen} options={{ title: 'Sign In' }} />
        <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'Inventory' }} />
       <Stack.Screen name="Scan" component={ScanScreen} options={{ title: 'Scan' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
