import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const BASE =
  Platform.OS === 'web'
    ? 'http://127.0.0.1:5000'
    : 'http://192.168.10.106:5000'; // change to your LAN IP when testing on device

export default function ScanResult({ route, navigation }) {
  const paramsCompanyId = route?.params?.company_id;
  const initialBarcode = route?.params?.barcode || '';

  const [barcode, setBarcode] = useState(initialBarcode);
  const [foundItem, setFoundItem] = useState(null);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [qty, setQty] = useState('1');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  async function getAuth() {
    const token = await SecureStore.getItemAsync('token');
    const storedCompanyId = await SecureStore.getItemAsync('company_id');
    const company_id = paramsCompanyId ?? (storedCompanyId ? Number(storedCompanyId) : undefined);
    if (!token) throw new Error('Missing auth token. Please log in again.');
    if (!company_id) throw new Error('Missing company id.');
    return { token, company_id };
  }

  const checkBarcode = async () => {
    setErr(''); setMsg('');
    if (!barcode) { setErr('Scan or enter a barcode'); return; }
    try {
      const { token, company_id } = await getAuth();
      const url = `${BASE}/api/inventory/${encodeURIComponent(barcode)}?company_id=${encodeURIComponent(company_id)}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();

      if (res.status === 404) {
        setFoundItem(null);
        setMsg('Not found. You can add it below.');
      } else if (!res.ok) {
        throw new Error(data?.error || 'Lookup failed');
      } else {
        setFoundItem(data.item);
        setMsg('Item found.');
      }
    } catch (e) {
      setErr(String(e.message || e));
    }
  };

  const addItem = async () => {
    setErr(''); setMsg('');
    if (!barcode) { setErr('Barcode is required'); return; }
    if (!name.trim()) { setErr('Name is required'); return; }

    const priceNum = Number(price || 0);
    const qtyNum = parseInt(qty || '0', 10);
    if (Number.isNaN(priceNum) || Number.isNaN(qtyNum)) {
      setErr('Price/Qty must be numbers'); return;
    }

    try {
      const { token, company_id } = await getAuth();
      const body = {
        company_id,
        barcode: String(barcode).trim(),
        name: name.trim(),
        price: priceNum,
        qty: qtyNum,
      };
      const res = await fetch(`${BASE}/api/inventory`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || data?.error) throw new Error(data?.error || 'Save failed');

      setMsg('Saved!');
      navigation.goBack();
    } catch (e) {
      setErr(String(e.message || e));
    }
  };

  async function adjust(delta) {
    if (!foundItem?.barcode) return;
    setErr(''); setMsg('');
    try {
      const { token, company_id } = await getAuth();
      const res = await fetch(`${BASE}/api/inventory/adjust`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          company_id,
          barcode: foundItem.barcode,
          delta,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || 'Adjust failed');

      setFoundItem(it => it ? { ...it, qty: json.item?.qty ?? it.qty } : it);
      setMsg(`${delta > 0 ? '+' : ''}${delta} applied.`);
    } catch (e) {
      setErr(String(e.message || e));
    }
  }

  const addPlusOne = () => adjust(+1);
  const addMinusOne = () => adjust(-1); // server guards against < 0 (GREATEST(...,0))

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Scan Result / Add Item</Text>

      <TextInput
        style={styles.input}
        value={barcode}
        onChangeText={setBarcode}
        placeholder="Scanned barcode"
        placeholderTextColor="#aaa"
        autoCapitalize="none"
      />

      <TouchableOpacity style={styles.button} onPress={checkBarcode}>
        <Text style={styles.buttonText}>Check</Text>
      </TouchableOpacity>

      {!!msg && <Text style={{ color:'#9fd39f', marginTop:8 }}>{msg}</Text>}
      {!!err && <Text style={{ color:'#ff7676', marginTop:8 }}>{err}</Text>}

      {foundItem ? (
        <View style={styles.card}>
          <Text style={styles.label}>Name</Text>
          <Text style={styles.value}>{foundItem.name}</Text>
          <Text style={styles.label}>Price</Text>
          <Text style={styles.value}>${Number(foundItem.price || 0).toFixed(2)}</Text>
          <Text style={styles.label}>Qty</Text>
          <Text style={styles.value}>{foundItem.qty}</Text>

          <View style={{ flexDirection:'row', gap:10, marginTop:12 }}>
            <TouchableOpacity style={[styles.button, { flex:1, backgroundColor:'#3fb95b' }]} onPress={addPlusOne}>
              <Text style={styles.buttonText}>+1</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.button, { flex:1, backgroundColor:'#d05e5e' }]} onPress={addMinusOne}>
              <Text style={styles.buttonText}>-1</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <>
          <Text style={[styles.subtitle, { marginTop:16 }]}>Add New Item</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Name"
            placeholderTextColor="#aaa"
          />
          <TextInput
            style={styles.input}
            value={price}
            onChangeText={setPrice}
            placeholder="Price (e.g., 12.50)"
            placeholderTextColor="#aaa"
            keyboardType={Platform.OS === 'ios' ? 'decimal-pad' : 'numeric'}
          />
          <TextInput
            style={styles.input}
            value={qty}
            onChangeText={setQty}
            placeholder="Quantity"
            placeholderTextColor="#aaa"
            keyboardType="number-pad"
          />
          <TouchableOpacity style={styles.button} onPress={addItem}>
            <Text style={styles.buttonText}>Save Item</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex:1, backgroundColor:'#1a1a1a', padding:16 },
  title: { color:'white', fontSize:22, fontWeight:'700', marginBottom:12 },
  subtitle: { color:'#fff', fontSize:16, fontWeight:'600' },
  input: { backgroundColor:'#2c2c2c', color:'white', padding:12, borderRadius:8, marginTop:10 },
  button: { backgroundColor:'#4a90e2', paddingVertical:12, paddingHorizontal:14, borderRadius:10, alignItems:'center', marginTop:10 },
  buttonText: { color:'white', fontWeight:'600' },
  card: { backgroundColor:'#222', borderRadius:12, padding:12, marginTop:12 },
  label: { color:'#bbb', fontSize:12, marginTop:6 },
  value: { color:'#fff', fontSize:16, fontWeight:'600' },
});
