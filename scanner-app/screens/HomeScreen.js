import React, { useEffect, useLayoutEffect, useState } from 'react';
import { View, Text, TextInput, StyleSheet, FlatList, TouchableOpacity, Platform } from 'react-native';
import { Picker } from '@react-native-picker/picker';

const BASE = Platform.OS === 'web'
  ? 'http://127.0.0.1:5000'          // web in same machine
  : 'http://192.168.10.106:5000';    // phones/emulators on LAN

export default function HomeScreen({ route, navigation }) {
  const userId = route?.params?.userId || null;
  const token = route?.params?.token || '';
  const defaultCompanyId = route?.params?.company_id || null;

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

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setErr('');

        let query = '';
        if (company) {
          query = `?company=${encodeURIComponent(company)}`;
        } else if (defaultCompanyId) {
          query = `?company_id=${defaultCompanyId}`;
        }

        const url = `${BASE}/api/inventory${query}`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (res.status === 401) {
          setErr('Session expired. Please log in again.');
          navigation.replace('Login');
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        if (alive) setItems(Array.isArray(data) ? data : []);
      } catch (e) {
        if (alive) {
          setErr('Failed to load items');
          setItems([]);
          console.error('Inventory fetch error:', e);
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [company, defaultCompanyId, token]);

  const filtered = items.filter(item =>
    (item?.item_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (item?.barcode || '').includes(searchTerm)
  );

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      <Text style={styles.itemName}>{item.item_name}</Text>
      <Text>Barcode: {item.barcode}</Text>
      <Text>Type: {item.asset_type}</Text>
      <Text>Condition: {item.item_condition}</Text>
      <Text>Status: {item.status}</Text>
      {item.company && <Text>Company: {item.company}</Text>}
      {item.location && <Text>Location: {item.location}</Text>}
      {item.value != null && <Text>Value: ${item.value}</Text>}
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
