// adminscript.js - DEBUG VERSION
console.log("=== SCRIPT STARTED ===");

import { shipmentService } from './firebase.js';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from './firebase.js';

console.log("=== IMPORTS OK ===");

// Wait for DOM
document.addEventListener("DOMContentLoaded", function () {
  console.log("=== DOM LOADED ===");
  
  // Check all critical elements
  const trackingInput = document.getElementById("tracking");
  const mapDiv = document.getElementById("adminMap");
  const shipmentTable = document.getElementById("shipmentTable");
  
  console.log("trackingInput:", trackingInput ? "FOUND" : "NOT FOUND", trackingInput);
  console.log("mapDiv:", mapDiv ? "FOUND" : "NOT FOUND");
  console.log("shipmentTable:", shipmentTable ? "FOUND" : "NOT FOUND");
  
  // Check Leaflet
  console.log("window.L:", typeof window.L);
  if (typeof window.L === 'undefined') {
    console.error("LEAFLET NOT LOADED - waiting 1 second...");
    setTimeout(initApp, 1000);
    return;
  }
  
  initApp();
});

function initApp() {
  console.log("=== INIT APP ===");
  
  // Double check Leaflet
  if (typeof window.L === 'undefined') {
    console.error("LEAFLET STILL NOT AVAILABLE");
    alert("Error: Map library failed to load. Check your internet connection.");
    return;
  }

  const trackingInput = document.getElementById("tracking");
  const sender = document.getElementById("sender");
  const recipient = document.getElementById("recipient");
  const origin = document.getElementById("origin");
  const destination = document.getElementById("destination");
  const weight = document.getElementById("weight");
  const status = document.getElementById("status");
  const lastUpdate = document.getElementById("lastUpdate");
  const shipmentTable = document.getElementById("shipmentTable");
  const mapDiv = document.getElementById("adminMap");

  // Generate tracking number
  function generateTrackingNumber() {
    return "EC-" + Math.random().toString(36).substring(2, 10).toUpperCase();
  }

  // Set tracking number
  if (trackingInput) {
    trackingInput.value = generateTrackingNumber();
    console.log("✅ TRACKING NUMBER SET:", trackingInput.value);
  } else {
    console.error("❌ CANNOT SET TRACKING - input not found");
  }

  let routePoints = [];
  let mapMarkers = [];
  let shipments = [];
  let adminMap = null;

  // INIT MAP
  console.log("Initializing map...");
  if (mapDiv) {
    try {
      adminMap = window.L.map("adminMap").setView([20, 0], 2);
      console.log("✅ Map created");
      
      window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(adminMap);
      console.log("✅ Tiles added");

      adminMap.on("click", function(e) {
        console.log("MAP CLICKED at:", e.latlng);
        
        const label = prompt("Label (Origin, Transit, Destination):");
        console.log("Prompt returned:", label);
        
        if (!label) {
          console.log("No label, canceling");
          return;
        }

        try {
          const marker = window.L.marker(e.latlng, {draggable: true})
            .addTo(adminMap)
            .bindPopup(label)
            .openPopup();
          
          const point = {
            lat: e.latlng.lat,
            lng: e.latlng.lng,
            label: label,
            marker: marker
          };
          
          routePoints.push(point);
          mapMarkers.push(marker);
          
          console.log("✅ MARKER ADDED:", point);

          marker.on("dragend", function() {
            const pos = marker.getLatLng();
            point.lat = pos.lat;
            point.lng = pos.lng;
            console.log("Marker moved to:", point.lat, point.lng);
          });
        } catch (err) {
          console.error("ERROR ADDING MARKER:", err);
        }
      });
      
      console.log("✅ Map ready with click handler");
    } catch(e) {
      console.error("❌ MAP INIT ERROR:", e);
      mapDiv.innerHTML = '<p style="color:red;padding:20px;">Map error: ' + e.message + '</p>';
    }
  } else {
    console.error("❌ MAP DIV NOT FOUND");
  }

  // LOAD SHIPMENTS
  console.log("Loading shipments...");
  try {
    const q = query(collection(db, 'shipments'), orderBy('createdAt', 'desc'));
    console.log("Query created");
    
    onSnapshot(q, (snapshot) => {
      console.log("Snapshot received, docs:", snapshot.docs.length);
      shipments = snapshot.docs.map(d => ({id: d.id, ...d.data()}));
      renderTable();
    }, (err) => {
      console.error("❌ FIRESTORE ERROR:", err);
      if (shipmentTable) {
        shipmentTable.innerHTML = `<tr><td colspan="5" style="color:red;">Firebase Error: ${err.message}</td></tr>`;
      }
    });
    
    console.log("✅ Shipment listener started");
  } catch(err) {
    console.error("❌ ERROR STARTING LISTENER:", err);
  }

  // RENDER TABLE
  function renderTable() {
    console.log("Rendering table, shipments:", shipments.length);
    if (!shipmentTable) {
      console.error("❌ shipmentTable not found in renderTable");
      return;
    }
    
    if (!shipments.length) {
      shipmentTable.innerHTML = '<tr><td colspan="5" style="text-align:center;">No shipments yet. Create one above!</td></tr>';
      return;
    }
    
    shipmentTable.innerHTML = shipments.map(s => `
      <tr>
        <td>${s.trackingNumber || 'N/A'}</td>
        <td>${s.recipient || 'N/A'}</td>
        <td>${s.status || '-'}</td>
        <td>${s.lastUpdate || '-'}</td>
        <td>
          <button onclick="editShipment('${s.trackingNumber}')">Edit</button>
          <button onclick="removeShipment('${s.trackingNumber}')" style="background:#dc3545;color:white;">Delete</button>
        </td>
      </tr>
    `).join('');
    
    console.log("✅ Table rendered");
  }

  // SAVE
  window.saveShipment = async function() {
    console.log("SAVE CLICKED");
    
    if (!recipient.value) {
      alert("Please enter a recipient name");
      return;
    }

    const data = {
      trackingNumber: trackingInput.value.toUpperCase(),
      sender: sender.value,
      recipient: recipient.value,
      origin: origin.value,
      destination: destination.value,
      weight: weight.value,
      status: status.value,
      lastUpdate: lastUpdate.value || new Date().toLocaleString(),
      route: routePoints.map(p => ({lat: p.lat, lng: p.lng, label: p.label}))
    };

    console.log("Saving data:", data);

    const exists = shipments.find(s => s.trackingNumber === data.trackingNumber);

    try {
      if (exists) {
        console.log("Updating existing...");
        await shipmentService.update(data.trackingNumber, data);
      } else {
        console.log("Creating new...");
        await shipmentService.create(data);
      }
      
      console.log("✅ SAVE SUCCESS");
      alert("Shipment saved!");
      resetForm();
    } catch(err) {
      console.error("❌ SAVE FAILED:", err);
      alert("Error saving: " + err.message);
    }
  };

  // DELETE
  window.removeShipment = async function(tn) {
    console.log("DELETE:", tn);
    if (!confirm('Delete this shipment?')) return;
    try {
      await shipmentService.delete(tn);
      console.log("✅ DELETED");
    } catch(e) {
      console.error("❌ DELETE FAILED:", e);
      alert("Delete failed: " + e.message);
    }
  };

  // EDIT
  window.editShipment = function(tn) {
    console.log("EDIT:", tn);
    const s = shipments.find(x => x.trackingNumber === tn);
    if (!s) {
      console.error("Shipment not found:", tn);
      return;
    }

    trackingInput.value = s.trackingNumber;
    sender.value = s.sender || '';
    recipient.value = s.recipient || '';
    origin.value = s.origin || '';
    destination.value = s.destination || '';
    weight.value = s.weight || '';
    status.value = s.status || '';
    lastUpdate.value = s.lastUpdate || '';

    // Clear markers
    mapMarkers.forEach(m => adminMap && adminMap.removeLayer(m));
    mapMarkers = [];
    routePoints = [];

    // Load route
    if (s.route && adminMap) {
      console.log("Loading route with", s.route.length, "points");
      s.route.forEach(p => {
        if (p.lat != null && p.lng != null) {
          const m = window.L.marker([p.lat, p.lng], {draggable: true})
            .addTo(adminMap)
            .bindPopup(p.label || 'Point');
          
          routePoints.push({...p, marker: m});
          mapMarkers.push(m);
        }
      });
    }
  };

  // RESET
  function resetForm() {
    console.log("RESETTING FORM");
    trackingInput.value = generateTrackingNumber();
    console.log("New tracking:", trackingInput.value);
    
    [sender, recipient, origin, destination, weight, status, lastUpdate].forEach(el => {
      if (el) el.value = '';
    });
    
    mapMarkers.forEach(m => adminMap && adminMap.removeLayer(m));
    mapMarkers = [];
    routePoints = [];
    
    if (adminMap) adminMap.setView([20, 0], 2);
  }

  console.log("=== APP FULLY INITIALIZED ===");
}
