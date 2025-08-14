import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Platform } from 'react-native';

const BASE = Platform.OS === 'web'
  ? 'http://127.0.0.1:5000'          // web in same machine as Flask
  : 'http://192.168.10.106:5000';    // phones/emulators on LAN

export default function LoginScreen({ navigation }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');

  const handleLogin = async () => {
    console.log("Login button pressed");
    setErr('');
    try {
      const res = await fetch(`${BASE}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();
      console.log('Login response:', data);

      if (!res.ok) {
        console.log('Login failed:', data);
        setErr(data?.error || 'Login failed');
        return;
      }

      const { token, user } = data;
      console.log('Token:', token);
      console.log('User:', user);

      navigation.replace('Home', {
        userId: user.id,
        token,
        company_id: user.company_id,
      });
      console.log('Navigated to Home');
    } catch (e) {
      console.log('Network error:', e);
      setErr('Network error');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Sign in</Text>

      <TextInput
        style={styles.input}
        placeholder="Username"
        placeholderTextColor="#aaa"
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        placeholderTextColor="#aaa"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      {!!err && <Text style={styles.error}>{err}</Text>}

      <TouchableOpacity style={styles.button} onPress={handleLogin}>
        <Text style={styles.buttonText}>Log in</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a1a', padding: 20, justifyContent: 'center' },
  title: { color: 'white', fontSize: 24, fontWeight: '600', marginBottom: 20, textAlign: 'center' },
  input: { backgroundColor: '#2c2c2c', color: 'white', padding: 12, borderRadius: 8, marginBottom: 12 },
  button: { backgroundColor: '#4a90e2', padding: 14, borderRadius: 10, alignItems: 'center', marginTop: 6 },
  buttonText: { color: 'white', fontWeight: '600', fontSize: 16 },
  error: { color: '#ff7676', marginBottom: 10 },
});
