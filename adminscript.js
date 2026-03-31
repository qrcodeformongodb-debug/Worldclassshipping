// adminscript.js - Firebase version with real-time updates
import { shipmentService } from './firebase.js';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from './firebase.js';

document.addEventListener("DOMContentLoaded", function () {
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
    return "EC-" + Math.random().toString(36).substring(2, 10).toUpperCase();
  }

  // Set initial tracking number
  if (trackingInput) {
    trackingInput.value = generateTrackingNumber();
    console.log("Tracking number set:", trackingInput.value);
  } else {
    console.error("Tracking input not found!");
  }

  // ================= MAP =================
  function initMap() {
    const mapDiv = document.getElementById("adminMap");
    if (!mapDiv) {
      console.error("Map container #adminMap not found!");
      return null;
    }

    // Check if Leaflet is loaded
    if (typeof L === 'undefined') {
      console.error("Leaflet not loaded! Check script tag.");
      return null;
    }

    const map = L.map("adminMap").setView([6.5244, 3.3792], 4);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);

    // Click to add marker
    map.on("click", function (e) {
      const label = prompt("Label (Origin, Transit, Destination):");
      if (!label) return;

      const marker = L.marker(e.latlng, { draggable: true })
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

      marker.on("dragend", function() {
        const newLatLng = marker.getLatLng();
        point.lat = newLatLng.lat;
        point.lng = newLatLng.lng;
        console.log("Marker moved to:", point.lat, point.lng);
      });
    });

    console.log("Map initialized successfully");
    return map;
  }

  adminMap = initMap();

  // ================= LOAD SHIPMENTS =================
  function loadShipments() {
    const q = query(collection(db, 'shipments'), orderBy('createdAt', 'desc'));
    unsubscribeShipments = onSnapshot(q, (snapshot) => {
      shipments = snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data() 
      }));
      console.log("Shipments loaded:", shipments.length);
      renderTable();
    }, (err) => {
      console.error("Error loading shipments:", err);
    });
  }

  // ================= SAVE / UPDATE =================
  window.saveShipment = async function () {
    if (!recipient.value) {
      alert("Please enter a recipient name");
      return;
    }

    // Build clean route data (no marker objects)
    const routeData = routePoints.map(p => ({ 
      lat: p.lat, 
      lng: p.lng, 
      label: p.label 
    }));

    const shipmentData = {
      trackingNumber: trackingInput.value.toUpperCase(),
      sender: sender.value,
      recipient: recipient.value,
      origin: origin.value,
      destination: destination.value,
      weight: weight.value,
      status: status.value,
      lastUpdate: lastUpdate.value || new Date().toLocaleString(),
      route: routeData
    };

    const exists = shipments.find(s => s.trackingNumber === shipmentData.trackingNumber);

    try {
      console.log("Saving shipment:", shipmentData);
      
      if (exists) {
        await shipmentService.update(shipmentData.trackingNumber, shipmentData);
      } else {
        await shipmentService.create(shipmentData);
      }

      alert("Shipment saved successfully!");
      resetForm();
    } catch (err) {
      console.error("Save error:", err);
      alert("Error saving shipment: " + err.message);
    }
  };

  // ================= DELETE =================
  window.removeShipment = async function (tn) {
    if (!confirm('Delete this shipment?')) return;
    try {
      await shipmentService.delete(tn);
    } catch (err) {
      console.error(err);
      alert("Error deleting shipment");
    }
  };

  // ================= EDIT =================
  window.editShipment = function (tn) {
    const s = shipments.find(x => x.trackingNumber === tn);
    if (!s) {
      console.error("Shipment not found:", tn);
      return;
    }

    console.log("Editing shipment:", s);

    // Set form values
    trackingInput.value = s.trackingNumber || generateTrackingNumber();
    sender.value = s.sender || '';
    recipient.value = s.recipient || '';
    origin.value = s.origin || '';
    destination.value = s.destination || '';
    weight.value = s.weight || '';
    status.value = s.status || '';
    lastUpdate.value = s.lastUpdate || '';

    // Clear existing markers
    clearMapMarkers();

    // Load route markers
    if (s.route && Array.isArray(s.route) && adminMap) {
      s.route.forEach((p, index) => {
        if (p.lat != null && p.lng != null) {
          const m = L.marker([p.lat, p.lng], { draggable: true })
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
            const newLatLng = m.getLatLng();
            point.lat = newLatLng.lat;
            point.lng = newLatLng.lng;
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
    if (!shipmentTable) {
      console.error("shipmentTable not found!");
      return;
    }
    
    shipmentTable.innerHTML = "";
    
    if (shipments.length === 0) {
      shipmentTable.innerHTML = '<tr><td colspan="5" style="text-align:center;">No shipments yet</td></tr>';
      return;
    }
    
    shipments.forEach(s => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${s.trackingNumber || 'N/A'}</td>
        <td>${s.recipient || "N/A"}</td>
        <td>${s.status || ""}</td>
        <td>${s.lastUpdate || ""}</td>
        <td>
          <button onclick="editShipment('${s.trackingNumber}')">Edit</button>
          <button onclick="removeShipment('${s.trackingNumber}')">Delete</button>
        </td>
      `;
      shipmentTable.appendChild(tr);
    });
  }

  // Cleanup
  window.addEventListener('beforeunload', () => {
    if (unsubscribeShipments) {
      unsubscribeShipments();
    }
  });

  // Start
  loadShipments();
});
