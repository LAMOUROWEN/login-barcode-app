import React, { useEffect, useState } from 'react';

const ScanResults = ({ scannedCode, userId, companyId }) => {
  const [result, setResult] = useState(null);
  const [inventory, setInventory] = useState([]);

  // Fetch entire inventory on page load
  useEffect(() => {
    fetch('http://192.168.10.106:5000/api/inventory')
      .then(res => res.json())
      .then(data => setInventory(data))
      .catch(err => console.error("Error loading inventory:", err));
  }, []);

  // Fetch scan result if scannedCode is passed
  useEffect(() => {
    if (!scannedCode) return;

    fetch('http://192.168.10.106:5000/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        barcode: scannedCode,
        user_id: userId,
        company_id: companyId
      })
    })
      .then(res => res.json())
      .then(data => setResult(data))
      .catch(err => console.error("Error fetching scan result:", err));
  }, [scannedCode]);

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">Inventory</h2>

      {inventory.length === 0 ? (
        <p className="text-gray-400">No items in inventory.</p>
      ) : (
        inventory.map(item => (
          <div key={item.id} className="bg-gray-800 text-white p-3 mb-2 rounded">
            <p><strong>{item.item_name}</strong></p>
            <p>Barcode: {item.barcode}</p>
            <p>Qty: {item.quantity}</p>
          </div>
        ))
      )}

      {result && (
        <div className="mt-6 bg-white text-black p-4 rounded shadow">
          <h3 className="text-lg font-semibold mb-2">Scanned Item</h3>
          <p><strong>Status:</strong> {result.status}</p>
          <p><strong>Item Name:</strong> {result.item.item_name}</p>
          <p><strong>Barcode:</strong> {result.item.barcode}</p>
          <p><strong>Condition:</strong> {result.item.item_condition}</p>
          <p><strong>Quantity:</strong> {result.item.quantity}</p>
          <p><strong>Status:</strong> {result.item.status}</p>
        </div>
      )}
    </div>
  );
};

export default ScanResults;
