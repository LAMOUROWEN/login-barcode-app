import React, { useEffect, useLayoutEffect, useState, useCallback, useRef } from 'react';
import { View, Text, TextInput, StyleSheet, FlatList, TouchableOpacity, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { useFocusEffect } from '@react-navigation/native';

const BASE =
  Platform.OS === 'web'
    ? 'http://127.0.0.1:5000'
    : 'http://192.168.10.106:5000';

const normalizeBarcode = (s) => String(s || '').replace(/\s/g, '');

export default function HomeScreen({ route, navigation }) {
  const navToken   = route?.params?.token ?? '';
  const userId     = route?.params?.userId ?? null;

  // ✅ Match your DB: SpiritTech=1, Experience=2
  const companies = [
    { id: 3, label: 'Experience' },
    { id: 1, label: 'Spirit Technologies' },
  ];

  // Start with NO company selected
  const [selectedCompanyId, setSelectedCompanyId] = useState(null);

  const [items, setItems]     = useState([]);
  const [searchTerm, setQ]    = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState('');

  const [scanEnabled, setScanEnabled] = useState(false);
  const [wedge, setWedge]             = useState('');
  const [scanCount, setScanCount]     = useState(0);
  const [lastLabel, setLastLabel]     = useState('—');
  const [scanStatus, setScanStatus]   = useState('');
  const hiddenRef = useRef(null);

  useLayoutEffect(() => {
    navigation?.setOptions?.({
      headerRight: () => (
        <View style={{ flexDirection:'row', gap:16 }}>
          <TouchableOpacity
            onPress={() => setScanEnabled(v => !v)}
            disabled={!selectedCompanyId}
          >
            <Text style={{ color: selectedCompanyId ? 'white' : '#777' }}>
              {scanEnabled ? 'Stop' : 'Start'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.replace('Login')}>
            <Text style={{ color: 'white' }}>Logout</Text>
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation, scanEnabled, selectedCompanyId]);

  useEffect(() => {
    if (scanEnabled && hiddenRef.current) {
      setTimeout(() => hiddenRef.current?.focus?.(), 50);
      setScanStatus('Ready');
    } else {
      setScanStatus('');
      setWedge('');
    }
  }, [scanEnabled]);

  const getToken = useCallback(async () => {
    let token = navToken || '';
    if (!token) {
      try { token = await SecureStore.getItemAsync('token'); } catch {}
      if (!token && Platform.OS === 'web') {
        try { token = localStorage.getItem('token') || ''; } catch {}
      }
    }
    return token;
  }, [navToken]);

  const load = useCallback(async () => {
    if (!selectedCompanyId) return;
    setLoading(true);
    setErr('');
    try {
      const token = await getToken();
      if (!token) {
        setErr('No auth token. Please log in again.');
        navigation.replace('Login');
        return;
      }
      const url = `${BASE}/api/inventory?company_id=${selectedCompanyId}&q=${encodeURIComponent(searchTerm)}&limit=100`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (res.status === 401) {
        setErr(data?.error || 'Session expired. Please log in again.');
        navigation.replace('Login');
        return;
      }
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      setErr(e.message || 'Failed to load items');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [selectedCompanyId, searchTerm, getToken, navigation]);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const adjustPlusOne = useCallback(async (barcode) => {
    const token = await getToken();
    if (!token) throw new Error('Missing auth token');
    const body = { company_id: selectedCompanyId, barcode, delta: 1 };
    const res = await fetch(`${BASE}/api/inventory/adjust`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok || !json?.ok) throw new Error(json?.error || 'Adjust failed');
    return json.item;
  }, [selectedCompanyId, getToken]);

  const onSubmitScan = useCallback(async () => {
    const code = normalizeBarcode(wedge);
    setWedge('');
    if (!code) { setScanStatus('Invalid/empty scan'); return; }
    setScanStatus('Sending…');
    try {
      const item = await adjustPlusOne(code);
      setScanCount(c => c + 1);
      setLastLabel(`${item?.name || code} (qty ${item?.qty ?? '—'})`);
      setScanStatus('OK');
      load();
    } catch (e) {
      setScanStatus(`Error: ${String(e.message || e)}`);
      setLastLabel(code);
    } finally {
      if (scanEnabled && hiddenRef.current) setTimeout(() => hiddenRef.current?.focus?.(), 20);
    }
  }, [wedge, scanEnabled, adjustPlusOne, load]);

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      <Text style={styles.itemName}>{item.name}</Text>
      <Text style={styles.dim}>Barcode: {item.barcode}</Text>
      <Text style={styles.dim}>Price: ${item.price ?? ''}</Text>
      <Text style={styles.dim}>Quantity: {item.qty}</Text>
    </View>
  );

  const CompanyTiles = () => (
    <View style={styles.tilesWrap}>
      {companies.map(c => {
        const active = c.id === selectedCompanyId;
        return (
          <TouchableOpacity
            key={c.id}
            onPress={() => {
              setSelectedCompanyId(c.id);
              setScanEnabled(false);
              setScanCount(0);
              setLastLabel('—');
              setTimeout(load, 0);
            }}
            style={[styles.tile, active && styles.tileActive]}
          >
            <Text style={[styles.tileTitle, active && styles.tileTitleActive]}>{c.label}</Text>
            <Text style={styles.tileSub}>inventory</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  return (
    <View style={styles.container}>
      {scanEnabled && (
        <TextInput
          ref={hiddenRef}
          value={wedge}
          onChangeText={setWedge}
          autoFocus
          blurOnSubmit={false}
          onSubmitEditing={onSubmitScan}
          style={styles.hiddenInput}
        />
      )}

      {userId ? <Text style={styles.userId}>User ID: {userId}</Text> : null}
      <Text style={styles.title}>Inventory</Text>

      <CompanyTiles />

      {!!selectedCompanyId && (
        <>
          <View style={styles.scanBar}>
            <Text style={styles.scanText}>
              Trigger Scan: {scanEnabled ? 'ON' : 'OFF'} • Company ID {selectedCompanyId}
            </Text>
            <TouchableOpacity
              style={[styles.scanToggle, scanEnabled ? styles.scanOn : styles.scanOff]}
              onPress={() => setScanEnabled(v => !v)}
            >
              <Text style={styles.btnText}>{scanEnabled ? 'Stop' : 'Start'}</Text>
            </TouchableOpacity>
          </View>

          {scanEnabled && (
            <View style={styles.scanStatusWrap}>
              <Text style={styles.scanStatus}>
                Count: <Text style={styles.white}>{scanCount}</Text> • Last: <Text style={styles.white}>{lastLabel}</Text>
              </Text>
              <Text style={[styles.scanMsg, scanStatus.startsWith('Error') ? styles.err : styles.ok]}>
                {scanStatus || 'Ready'}
              </Text>
            </View>
          )}

          <TextInput
            style={styles.search}
            placeholder="Search by name or barcode"
            placeholderTextColor="#ccc"
            value={searchTerm}
            onChangeText={setQ}
            onSubmitEditing={load}
          />

          {err ? <Text style={styles.error}>{err}</Text> : null}
          {loading ? <Text style={styles.loading}>Loading…</Text> : null}

          <FlatList
            data={items}
            renderItem={renderItem}
            keyExtractor={(item, i) => item?.id?.toString() || String(i)}
            contentContainerStyle={{ paddingBottom: 20 }}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, backgroundColor: '#1a1a1a', flex: 1 },
  userId: { color: '#888', marginBottom: 6 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 12, color: 'white' },

  // tiles
  tilesWrap: { gap: 12, marginBottom: 14 },
  tile: {
    backgroundColor: '#2b4a6a',
    borderWidth: 2,
    borderColor: '#2b4a6a',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  tileActive: {
    backgroundColor: '#2f5680',
    borderColor: '#4e79a7',
  },
  tileTitle: { color: '#dce7f3', fontWeight: '800', fontSize: 18, textDecorationLine: 'underline' },
  tileTitleActive: { color: '#ffffff' },
  tileSub: { color: '#a8b5c4', marginTop: 2, fontSize: 14 },

  // scan UI
  scanBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor:'#222', padding:10, borderRadius:10, marginBottom: 12,
  },
  scanText: { color:'#cfcfcf', fontWeight:'600' },
  scanToggle: { paddingVertical:8, paddingHorizontal:14, borderRadius:8 },
  scanOn: { backgroundColor:'#2a7b2a' },
  scanOff: { backgroundColor:'#4a90e2' },
  btnText: { color:'#fff', fontWeight:'700' },
  scanStatusWrap: { marginBottom: 12 },
  scanStatus: { color:'#bbb', marginTop: 4 },
  scanMsg: { marginTop: 4 },
  ok: { color:'#9fd39f' },
  err: { color:'#ff7676' },
  white: { color:'#fff', fontWeight:'800' },

  search: { borderWidth: 1, borderColor: '#999', borderRadius: 6, padding: 10, marginBottom: 12, color: 'white' },
  card: { backgroundColor: '#2c2c2c', padding: 12, marginBottom: 10, borderRadius: 6 },
  itemName: { fontSize: 18, fontWeight: '500', color: 'white' },
  dim: { color:'#cfcfcf', marginTop: 2 },

  error: { color: '#ff7676', marginBottom: 8 },
  loading: { color: '#aaa', marginBottom: 8 },

  hiddenInput: { position: 'absolute', opacity: 0, height: 0, width: 0 },
});
