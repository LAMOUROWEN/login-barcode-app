import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, Button, ActivityIndicator, Alert, Platform } from 'react-native';
import { Camera, CameraType, useCameraPermissions } from 'expo-camera';
import * as SecureStore from 'expo-secure-store';

const API_BASE =
  Platform.OS === 'web' ? 'http://127.0.0.1:5000' : 'http://192.168.10.106:5000'; // set your LAN IP for device

const SCAN_COOLDOWN_MS = 1200;

export default function ScanScreen({ navigation, route }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState('stock'); // optional ("stock" | "produce")
  const lastScanAt = useRef(0);

  // company_id from route or SecureStore
  const [companyId, setCompanyId] = useState(route?.params?.company_id ?? null);
  useEffect(() => {
    (async () => {
      if (!companyId) {
        const stored = await SecureStore.getItemAsync('company_id');
        if (stored) setCompanyId(Number(stored));
      }
    })();
  }, [companyId]);

  useEffect(() => {
    if (!permission) requestPermission();
  }, [permission]);

  // --- helpers ---
  async function getAuth() {
    const token = await SecureStore.getItemAsync('token');
    if (!token) throw new Error('Missing auth token. Log in again.');
    if (!companyId) throw new Error('Missing company id.');
    return { token, company_id: companyId };
  }

  async function adjustPlusOne(barcode) {
    const { token, company_id } = await getAuth();
    const res = await fetch(`${API_BASE}/api/inventory/adjust`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ company_id, barcode, delta: 1 }),
    });
    const json = await res.json();
    if (!res.ok || !json?.ok) throw new Error(json?.error || 'Adjust failed');
    return json.item; // { id, name, barcode, price, qty }
  }

  async function createThenAddOne({ barcode, name, price = 0 }) {
    const { token, company_id } = await getAuth();
    // create/upsert
    let res = await fetch(`${API_BASE}/api/inventory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ company_id, barcode, name: name || 'New Item', price, qty: 0 }),
    });
    let json = await res.json();
    if (!res.ok || json?.error) throw new Error(json?.error || 'Create failed');

    // then +1
    res = await fetch(`${API_BASE}/api/inventory/adjust`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ company_id, barcode, delta: 1 }),
    });
    json = await res.json();
    if (!res.ok || !json?.ok) throw new Error(json?.error || 'Adjust failed');
    return json.item;
  }

  // --- main scan flow: immediate write ---
  const onScan = useCallback(async ({ data }) => {
    const now = Date.now();
    if (busy || now - lastScanAt.current < SCAN_COOLDOWN_MS) return;
    lastScanAt.current = now;
    setBusy(true);

    const barcode = String(data).trim();
    if (!barcode) { setBusy(false); return; }

    try {
      // classify first
      const res = await fetch(`${API_BASE}/api/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ barcode, mode }),
      });
      const json = await res.json();

      if (!res.ok) {
        // not_in_catalog or other
        if (json?.error === 'not_in_catalog') {
          Alert.alert(
            'New item?',
            `Barcode ${barcode} not in catalog.\nCreate it and add +1 now?`,
            [
              { text: 'Cancel' },
              {
                text: 'Yes',
                onPress: async () => {
                  try {
                    // If /api/scan returned stub info, prefer that name/price
                    const name = json?.item?.name || 'New Item';
                    const price = json?.item?.price ?? 0;
                    const created = await createThenAddOne({ barcode, name, price });
                    Alert.alert('Created', `${created.name || barcode} qty: ${created.qty}`);
                  } catch (e) {
                    Alert.alert('Error', String(e));
                  }
                },
              },
            ]
          );
        } else {
          Alert.alert('Scan error', json?.error || 'Unknown error');
        }
        return;
      }

      // Found something
      if (json.source === 'local') {
        const updated = await adjustPlusOne(barcode);
        Alert.alert('Added', `+1 → ${json.item?.name || barcode} (qty: ${updated.qty})`);
      } else if (json.source === 'external_stub') {
        Alert.alert(
          'Add from stub?',
          `Create ${json.item?.name || 'New Item'} and add +1?`,
          [
            { text: 'Cancel' },
            {
              text: 'Yes',
              onPress: async () => {
                try {
                  const created = await createThenAddOne({
                    barcode,
                    name: json.item?.name,
                    price: json.item?.price,
                  });
                  Alert.alert('Created', `${created.name || barcode} qty: ${created.qty}`);
                } catch (e) {
                  Alert.alert('Error', String(e));
                }
              },
            },
          ]
        );
      }
    } catch (e) {
      Alert.alert('Network error', String(e));
    } finally {
      setTimeout(() => setBusy(false), 400);
    }
  }, [busy, companyId, mode]);

  if (!permission) {
    return <View style={styles.center}><ActivityIndicator /></View>;
  }
  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={{ marginBottom: 12 }}>Camera access required.</Text>
        <Button title="Allow Camera" onPress={requestPermission} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={{ padding: 12, flexDirection:'row', justifyContent:'space-between', alignItems:'center' }}>
        <Text style={{ fontSize: 18, fontWeight: '600' }}>Scan (auto +1)</Text>
        <Button title={`Mode: ${mode.toUpperCase()}`} onPress={() => setMode(m => m === 'stock' ? 'produce' : 'stock')} />
      </View>

      <Camera
        style={{ flex: 1 }}
        type={CameraType.back}
        onBarCodeScanned={onScan}
        barCodeScannerSettings={{
          barCodeTypes: ['ean13','ean8','upc_a','upc_e','code128','code39','qr'],
        }}
      />
    </View>
  );
}

const styles = { center: { flex: 1, alignItems: 'center', justifyContent: 'center' } };
