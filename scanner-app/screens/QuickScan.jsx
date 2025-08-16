import React, { useState, useCallback } from 'react';
import { View, Text, TextInput, StyleSheet, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const API_BASE =
  Platform.OS === 'web' ? 'http://127.0.0.1:5000' : 'http://192.168.10.106:5000'; // set your LAN IP on device

// keep it simple: digits only; drop anything else
function normalize(raw) {
  return String(raw || '').replace(/\D+/g, '');
}

export default function QuickScan() {
  const [wedge, setWedge] = useState('');
  const [count, setCount] = useState(0);
  const [last, setLast] = useState('—');
  const [status, setStatus] = useState('');

  const adjustPlusOne = useCallback(async (barcode) => {
    const token = await SecureStore.getItemAsync('token');
    const companyStored = await SecureStore.getItemAsync('company_id');
    if (!token) throw new Error('Missing auth token');
    if (!companyStored) throw new Error('Missing company id');

    const body = {
      company_id: Number(companyStored),
      barcode,
      delta: 1,
    };

    const res = await fetch(`${API_BASE}/api/inventory/adjust`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });

    const json = await res.json();
    if (!res.ok || !json?.ok) {
      // if item doesn't exist yet on the server, you can uncomment the next block
      // to auto-create then +1. For now, keep it truly minimal:
      // throw new Error(json?.error || 'Adjust failed');
      throw new Error(json?.error || 'Adjust failed');
    }
    return json.item; // { id, name, barcode, price, qty }
  }, []);

  const onSubmit = useCallback(async () => {
    const raw = wedge;
    setWedge(''); // clear input immediately for the next scan

    const code = normalize(raw);
    if (!code) {
      setStatus('Invalid/empty scan');
      return;
    }
    setStatus('Sending…');

    try {
      const item = await adjustPlusOne(code);
      setCount(c => c + 1);
      setLast(`${item?.name || code} (qty ${item?.qty ?? '—'})`);
      setStatus('OK');
    } catch (e) {
      setStatus(`Error: ${String(e.message || e)}`);
      setLast(code);
    }
  }, [wedge, adjustPlusOne]);

  return (
    <View style={styles.container}>
      {/* Hidden TextInput captures HID scanner keystrokes + Enter */}
      <TextInput
        value={wedge}
        onChangeText={setWedge}
        autoFocus
        blurOnSubmit={false}
        onSubmitEditing={onSubmit}
        style={styles.hiddenInput}
      />

      {/* Simple operator overlay */}
      <Text style={styles.heading}>Quick Scan (Trigger)</Text>
      <Text style={styles.line}>Count: <Text style={styles.value}>{count}</Text></Text>
      <Text style={styles.line}>Last:  <Text style={styles.value}>{last}</Text></Text>
      <Text style={[styles.status, status.startsWith('Error') ? styles.err : styles.ok]}>{status || 'Ready'}</Text>
      <Text style={styles.hint}>
        Focus is in a hidden field. Aim, pull trigger, repeat.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex:1, backgroundColor:'#000', padding:16, justifyContent:'center' },
  heading:   { color:'#fff', fontSize:24, fontWeight:'800', marginBottom:16, textAlign:'center' },
  line:      { color:'#aaa', fontSize:18, marginTop:8, textAlign:'center' },
  value:     { color:'#fff', fontWeight:'800' },
  status:    { marginTop:16, fontSize:18, textAlign:'center' },
  ok:        { color:'#9fd39f' },
  err:       { color:'#ff7676' },
  hint:      { color:'#888', marginTop:24, textAlign:'center' },
  hiddenInput: { position:'absolute', opacity:0, height:0, width:0 },
});
