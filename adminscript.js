// adminscript.js - Firebase version with real-time updates
import { shipmentService } from './firebase.js';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from './firebase.js';

// Wait for DOM and Leaflet to be ready
document.addEventListener("DOMContentLoaded", function () {
  
  // Check if Leaflet loaded
  if (typeof window.L === 'undefined') {
    console.error("Leaflet not loaded! Retrying in 500ms...");
    setTimeout(initApp, 500);
    return;
  }
  
  initApp();
});

function initApp() {
  // Check again for Leaflet
  if (typeof window.L === 'undefined') {
    console.error("Leaflet still not available");
    alert("Map library failed to load. Please refresh the page.");
    return;
  }

  // Form inputs
  const trackingInput = document.getElementById("tracking");
  const sender = document.getElementById("sender");
  const recipient = document.getElementById("recipient");
  const origin = document.getElementById("origin");
  const destination = document.getElementById("destination");
  const weight = document.getElementById("weight");
  const status = document.getElementById("status");
  const lastUpdate = document.getElementById("lastUpdate");
  const shipmentTable = document.getElementById("shipmentTable");

  let routePoints = [];
  let shipments = [];
  let unsubscribeShipments = null;
  let mapMarkers = [];
  let adminMap = null;

  // Generate tracking number
  function generateTrackingNumber() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = 'EC-';
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  // Set initial tracking number
  if (trackingInput) {
    trackingInput.value = generateTrackingNumber();
    console.log("✅ Tracking number set:", trackingInput.value);
  }

  // ================= MAP =================
  function initMap() {
    const mapDiv = document.getElementById("adminMap");
    if (!mapDiv) {
      console.error("❌ Map container #adminMap not found!");
      return null;
    }

    console.log("Initializing map...");
    
    try {
      // Create map
      const map = window.L.map("adminMap").setView([6.5244, 3.3792], 4);
      
      // Add tile layer
      window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '© OpenStreetMap contributors'
      }).addTo(map);

      console.log("✅ Map created successfully");

      // Click handler
      map.on("click", function (e) {
        console.log("Map clicked at:", e.latlng);
        
        const label = prompt("Label (Origin, Transit, Destination):");
        if (!label) return;

        const marker = window.L.marker(e.latlng, { draggable: true })
          .addTo(map)
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

        console.log("📍 Marker added:", point.lat, point.lng, label);

        // Drag handler
        marker.on("dragend", function() {
          const newPos = marker.getLatLng();
          point.lat = newPos.lat;
          point.lng = newPos.lng;
          console.log("📍 Marker moved to:", point.lat, point.lng);
        });
      });

      return map;
    } catch (err) {
      console.error("❌ Map init error:", err);
      return null;
    }
  }

  adminMap = initMap();

  // ================= LOAD SHIPMENTS =================
  function loadShipments() {
    console.log("Loading shipments...");
    
    const q = query(collection(db, 'shipments'), orderBy('createdAt', 'desc'));
    
    unsubscribeShipments = onSnapshot(q, (snapshot) => {
      shipments = snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data() 
      }));
      console.log("✅ Shipments loaded:", shipments.length);
      renderTable();
    }, (err) => {
      console.error("❌ Error loading shipments:", err);
    });
  }

  // ================= SAVE / UPDATE =================
  window.saveShipment = async function () {
    console.log("Save clicked");

    if (!recipient.value) {
      alert("Please enter a recipient name");
      return;
    }

    // Build clean route data
    const routeData = routePoints.map(p => ({ 
      lat: p.lat, 
      lng: p.lng, 
      label: p.label 
    }));

    const shipmentData = {
      trackingNumber: trackingInput.value.toUpperCase(),
      sender: sender.value || '',
      recipient: recipient.value || '',
      origin: origin.value || '',
      destination: destination.value || '',
      weight: weight.value || '',
      status: status.value || '',
      lastUpdate: lastUpdate.value || new Date().toLocaleString(),
      route: routeData
    };

    const exists = shipments.find(s => s.trackingNumber === shipmentData.trackingNumber);

    try {
      console.log("Saving:", shipmentData);
      
      if (exists) {
        await shipmentService.update(shipmentData.trackingNumber, shipmentData);
        console.log("✅ Updated existing shipment");
      } else {
        await shipmentService.create(shipmentData);
        console.log("✅ Created new shipment");
      }

      alert("Shipment saved successfully!");
      resetForm();
    } catch (err) {
      console.error("❌ Save error:", err);
      alert("Error saving shipment: " + err.message);
    }
  };

  // ================= DELETE =================
  window.removeShipment = async function (tn) {
    if (!confirm('Delete this shipment?')) return;
    try {
      await shipmentService.delete(tn);
      console.log("✅ Deleted:", tn);
    } catch (err) {
      console.error("❌ Delete error:", err);
      alert("Error deleting shipment");
    }
  };

  // ================= EDIT =================
  window.editShipment = function (tn) {
    console.log("Editing:", tn);
    
    const s = shipments.find(x => x.trackingNumber === tn);
    if (!s) {
      console.error("Shipment not found:", tn);
      return;
    }

    // Set form values
    trackingInput.value = s.trackingNumber || generateTrackingNumber();
    sender.value = s.sender || '';
    recipient.value = s.recipient || '';
    origin.value = s.origin || '';
    destination.value = s.destination || '';
    weight.value = s.weight || '';
    status.value = s.status || '';
    lastUpdate.value = s.lastUpdate || '';

    // Clear old markers
    clearMapMarkers();

    // Load route
    if (s.route && Array.isArray(s.route) && adminMap) {
      console.log("Loading route with", s.route.length, "points");
      
      s.route.forEach((p, index) => {
        if (p.lat != null && p.lng != null) {
          const m = window.L.marker([p.lat, p.lng], { draggable: true })
            .addTo(adminMap)
            .bindPopup(p.label || `Point ${index + 1}`);
          
          const point = { 
            lat: p.lat, 
            lng: p.lng, 
            label: p.label || `Point ${index + 1}`,
            marker: m 
          };
          
          routePoints.push(point);
          mapMarkers.push(m);

          m.on("dragend", function() {
            const newPos = m.getLatLng();
            point.lat = newPos.lat;
            point.lng = newPos.lng;
          });
        }
      });

      // Fit bounds
      if (routePoints.length > 0) {
        const bounds = routePoints.map(p => [p.lat, p.lng]);
        adminMap.fitBounds(bounds);
      }
    }
  };

  // ================= HELPERS =================
  function clearMapMarkers() {
    if (!adminMap) return;
    
    mapMarkers.forEach(m => {
      if (m) adminMap.removeLayer(m);
    });
    mapMarkers = [];
    routePoints = [];
  }

  function resetForm() {
    trackingInput.value = generateTrackingNumber();
    
    const fields = ["sender", "recipient", "origin", "destination", "weight", "status", "lastUpdate"];
    fields.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    
    clearMapMarkers();
    
    if (adminMap) {
      adminMap.setView([6.5244, 3.3792], 4);
    }
  }

  function renderTable() {
    if (!shipmentTable) return;
    
    shipmentTable.innerHTML = "";
    
    if (shipments.length === 0) {
      shipmentTable.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">No shipments yet. Create one above!</td></tr>';
      return;
    }
    
    shipments.forEach(s => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${s.trackingNumber || 'N/A'}</td>
        <td>${s.recipient || "N/A"}</td>
        <td>${s.status || "-"}</td>
        <td>${s.lastUpdate || "-"}</td>
        <td>
          <button onclick="editShipment('${s.trackingNumber}')">Edit</button>
          <button onclick="removeShipment('${s.trackingNumber}')" style="background:#dc3545;color:white;">Delete</button>
        </td>
      `;
      shipmentTable.appendChild(tr);
    });
  }

  // Cleanup
  window.addEventListener('beforeunload', () => {
    if (unsubscribeShipments) unsubscribeShipments();
  });

  // Start
  console.log("🚀 Admin app starting...");
  loadShipments();
}
