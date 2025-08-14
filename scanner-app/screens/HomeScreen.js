import React, { useEffect, useLayoutEffect, useState, useCallback } from 'react';
import { View, Text, TextInput, StyleSheet, FlatList, TouchableOpacity, Platform } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import * as SecureStore from 'expo-secure-store';

const BASE = Platform.OS === 'web'
  ? 'http://127.0.0.1:5000'          // web in same machine
  : 'http://192.168.10.106:5000';    // phones/emulators on LAN

export default function HomeScreen({ route, navigation }) {
  const navToken = route?.params?.token ?? '';
  const company_id = route?.params?.company_id ?? null;
  const userId = route?.params?.userId ?? null;

  const [items, setItems] = useState([]);
  const [company, setCompany] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  useLayoutEffect(() => {
    navigation?.setOptions?.({
      headerRight: () => (
        <TouchableOpacity onPress={() => navigation.replace('Login')}>
          <Text style={{ color: 'white' }}>Logout</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  const load = useCallback(async () => {
    if (!company_id) {
      setErr('Missing company_id');
      return;
    }
    setLoading(true);
    setErr('');

    try {
      // 1) Get token
      let token = navToken || '';
if (!token) {
  try { token = await SecureStore.getItemAsync('token'); } catch {}
  if (!token && Platform.OS === 'web') {
    try { token = localStorage.getItem('token') || ''; } catch {}
  }
}
console.log('DEBUG token before fetch:', token ? token.slice(0, 24) + '...' : '(empty)');
if (!token) {
  setErr('No auth token. Please log in again.');
  navigation.replace('Login');
  return;
}


      // 2) Build URL
      const url = `${BASE}/api/inventory?company_id=${company_id}&q=${encodeURIComponent(searchTerm)}&limit=100`;

      // 3) Fetch inventory
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();

      if (res.status === 401) {
        setErr(data?.error || 'Session expired. Please log in again.');
        navigation.replace('Login');
        return;
      }
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);

      // 4) Assign inventory items
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      setErr(e.message || 'Failed to load items');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [company_id, searchTerm, navToken, navigation]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = items.filter(item =>
    (item?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (item?.barcode || '').includes(searchTerm)
  );

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      <Text style={styles.itemName}>{item.name}</Text>
      <Text>Barcode: {item.barcode}</Text>
      <Text>Price: ${item.price}</Text>
      <Text>Quantity: {item.qty}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      {userId ? <Text style={styles.userId}>User ID: {userId}</Text> : null}
      <Text style={styles.title}>Inventory</Text>

      <Picker selectedValue={company} onValueChange={setCompany} style={styles.picker}>
        <Picker.Item label="All Companies" value="" />
        <Picker.Item label="SpiritTech" value="SpiritTech" />
        <Picker.Item label="Experience" value="Experience" />
      </Picker>

      <TextInput
        style={styles.input}
        placeholder="Search by name or barcode"
        placeholderTextColor="#ccc"
        value={searchTerm}
        onChangeText={setSearchTerm}
        onSubmitEditing={load}
      />

      {err ? <Text style={styles.error}>{err}</Text> : null}
      {loading ? <Text style={styles.loading}>Loading…</Text> : null}

      <FlatList
        data={filtered}
        renderItem={renderItem}
        keyExtractor={(item, i) => item?.id?.toString() || String(i)}
        contentContainerStyle={{ paddingBottom: 20 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, backgroundColor: '#1a1a1a', flex: 1 },
  userId: { color: '#888', marginBottom: 6 },
  title: { fontSize: 24, fontWeight: '600', marginBottom: 10, color: 'white' },
  picker: { color: 'white', marginBottom: 15, backgroundColor: '#2c2c2c', borderRadius: 6, paddingHorizontal: 10 },
  input: { borderWidth: 1, borderColor: '#999', borderRadius: 6, padding: 10, marginBottom: 15, color: 'white' },
  card: { backgroundColor: '#2c2c2c', padding: 12, marginBottom: 10, borderRadius: 6 },
  itemName: { fontSize: 18, fontWeight: '500', color: 'white' },
  error: { color: '#ff7676', marginBottom: 8 },
  loading: { color: '#aaa', marginBottom: 8 },
});
