import React, { useEffect, useLayoutEffect, useState, useCallback, useRef } from 'react';
import { View, Text, TextInput, StyleSheet, FlatList, TouchableOpacity, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const BASE = Platform.OS === 'web'
  ? 'http://127.0.0.1:5000'          // if testing in browser on same machine
  : 'http://192.168.10.106:5000';    // replace with your PC LAN IP if scanning from phone

export default function HomeScreen({ route, navigation }) {
  const navToken   = route?.params?.token ?? '';
  const userId     = route?.params?.userId ?? null;
  const [companyId, setCompanyId] = useState(null);

  const [items, setItems]       = useState([]);
  const [loading, setLoading]   = useState(false);
  const [err, setErr]           = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // --- scanner states
  const [scanEnabled, setScanEnabled] = useState(false);
  const [scanCount, setScanCount]     = useState(0);
  const [lastLabel, setLastLabel]     = useState('');
  const [scanStatus, setScanStatus]   = useState('');
  const [wedge, setWedge]             = useState('');
  const hiddenRef     = useRef(null);
  const idleTimerRef  = useRef(null);

  // debug
  const [debugLastRaw, setDebugLastRaw] = useState('');
  const [debugFocused, setDebugFocused] = useState(false);

  useLayoutEffect(() => {
    navigation?.setOptions?.({
      headerRight: () => (
        <TouchableOpacity onPress={() => navigation.replace('Login')}>
          <Text style={{ color: 'white' }}>Logout</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  // --- helpers
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

  // replace your normalizeBarcode with this:
const normalizeBarcode = (s) => {
  const digits = String(s || "").replace(/\D/g, ""); // keep only digits

  // UPC-A 12 digits, but some scanners drop the leading 0 (11)
  if (digits.length === 11) return "0" + digits;

  // EAN-13 often has a leading 0 for the same product; drop it to compare to UPC-A
  if (digits.length === 13 && digits.startsWith("0")) return digits.slice(1);

  return digits; // 12 or other
};


  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true); setErr('');
    try {
      const token = await getToken();
      if (!token) { setErr('No auth token.'); return; }

      const url = `${BASE}/api/inventory?company_id=${companyId}&q=${encodeURIComponent(searchTerm)}&limit=100`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      setErr(e.message || 'Failed to load items'); setItems([]);
    } finally { setLoading(false); }
  }, [companyId, searchTerm, getToken]);

  useEffect(() => { load(); }, [load]);

  const adjustPlusOne = useCallback(async (code) => {
    const token = await getToken();
    const body = { company_id: companyId, barcode: code, delta: 1 };
    const res = await fetch(`${BASE}/api/inventory/adjust`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || 'Adjust failed');
    return data.item;
  }, [companyId, getToken]);

  const onSubmitScan = useCallback(async () => {
    const raw  = wedge;
    const code = normalizeBarcode(raw);
    setWedge('');
    setDebugLastRaw('');
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
      if (idleTimerRef.current) { clearTimeout(idleTimerRef.current); idleTimerRef.current = null; }
    }
  }, [wedge, scanEnabled, adjustPlusOne, load]);

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

      {/* Company toggle buttons */}
      <View style={styles.companyRow}>
        <TouchableOpacity
          style={[styles.companyButton, companyId === 1 && styles.activeCompany]}
          onPress={() => setCompanyId(1)}
        >
          <Text style={styles.companyText}>SpiritTech</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.companyButton, companyId === 3 && styles.activeCompany]}
          onPress={() => setCompanyId(3)}
        >
          <Text style={styles.companyText}>Experience</Text>
        </TouchableOpacity>
      </View>

      {/* Start/Stop scan buttons */}
      {companyId && (
        <View style={{ flexDirection: 'row', marginVertical: 10 }}>
          <TouchableOpacity
            style={[styles.scanButton, scanEnabled && styles.scanButtonActive]}
            onPress={() => {
              setScanEnabled(true);
              setScanCount(0);
              setLastLabel('');
              setScanStatus('');
              setTimeout(() => hiddenRef.current?.focus?.(), 100);
            }}
          >
            <Text style={styles.scanButtonText}>Start</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.scanButton, !scanEnabled && styles.scanButtonActive]}
            onPress={() => setScanEnabled(false)}
          >
            <Text style={styles.scanButtonText}>Stop</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Debug input visible while scanEnabled */}
      {scanEnabled && (
        <>
          <TextInput
            ref={hiddenRef}
            value={wedge}
            onChangeText={(txt) => {
              setWedge(txt);
              setDebugLastRaw(txt);
              if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
              idleTimerRef.current = setTimeout(() => {
                const code = normalizeBarcode(txt);
                if (code) onSubmitScan();
              }, 120);
            }}
            autoFocus
            blurOnSubmit={false}
            onSubmitEditing={onSubmitScan}
            onFocus={() => setDebugFocused(true)}
            onBlur={() => setDebugFocused(false)}
            style={{
              backgroundColor: debugFocused ? '#335' : '#333',
              color: 'white',
              padding: 10,
              borderRadius: 8,
              marginBottom: 8,
            }}
            placeholder="Scanner input (visible for debug)"
            placeholderTextColor="#bbb"
          />
          <Text style={{ color:'#aaa', marginBottom: 6 }}>
            Focus: {debugFocused ? 'Yes' : 'No'} • Last raw: {debugLastRaw || '—'}
          </Text>
          <Text style={{ color:'white' }}>
            Count: {scanCount} | Last: {lastLabel} | Status: {scanStatus}
          </Text>
        </>
      )}

      {err ? <Text style={styles.error}>{err}</Text> : null}
      {loading ? <Text style={styles.loading}>Loading…</Text> : null}

      {companyId && (
        <FlatList
          data={items}
          renderItem={renderItem}
          keyExtractor={(item, i) => item?.id?.toString() || String(i)}
          contentContainerStyle={{ paddingBottom: 20 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, backgroundColor: '#1a1a1a', flex: 1 },
  userId: { color: '#888', marginBottom: 6 },
  title: { fontSize: 24, fontWeight: '600', marginBottom: 10, color: 'white' },
  card: { backgroundColor: '#2c2c2c', padding: 12, marginBottom: 10, borderRadius: 6 },
  itemName: { fontSize: 18, fontWeight: '500', color: 'white' },
  error: { color: '#ff7676', marginBottom: 8 },
  loading: { color: '#aaa', marginBottom: 8 },

  companyRow: { flexDirection: 'row', marginBottom: 10 },
  companyButton: {
    flex: 1,
    padding: 12,
    marginHorizontal: 4,
    backgroundColor: '#333',
    borderRadius: 6,
    alignItems: 'center',
  },
  activeCompany: { backgroundColor: '#4a90e2' },
  companyText: { color: 'white', fontWeight: '600' },

  scanButton: {
    flex: 1,
    padding: 12,
    marginHorizontal: 4,
    backgroundColor: '#555',
    borderRadius: 6,
    alignItems: 'center',
  },
  scanButtonActive: { backgroundColor: '#4a90e2' },
  scanButtonText: { color: 'white', fontWeight: '600' },
});
