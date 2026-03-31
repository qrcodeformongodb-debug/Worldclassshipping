// adminscript.js with HTML error display
import { shipmentService } from './firebase.js';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from './firebase.js';

// Log to both console and HTML
function log(msg, type = 'info') {
  console.log('[' + type + ']', msg);
  if (window.logDebug) window.logDebug(msg, type);
}

function showErr(msg) {
  console.error(msg);
  if (window.showError) window.showError(msg);
}

function showOk(msg) {
  console.log(msg);
  if (window.showStatus) window.showStatus(msg);
}

log('Script starting...');

document.addEventListener("DOMContentLoaded", function () {
  log('DOM loaded');
  
  // Check elements
  const trackingInput = document.getElementById("tracking");
  const mapDiv = document.getElementById("adminMap");
  const shipmentTable = document.getElementById("shipmentTable");
  
  if (!trackingInput) {
    showErr('Tracking input not found! Check id="tracking"');
    return;
  }
  
  if (!mapDiv) {
    showErr('Map div not found! Check id="adminMap"');
    return;
  }
  
  if (!shipmentTable) {
    showErr('Table not found! Check id="shipmentTable"');
    return;
  }

  // Check Leaflet
  if (typeof window.L === 'undefined') {
    showErr('Leaflet (map library) not loaded! Check internet connection.');
    mapDiv.innerHTML = '<p style="color:red;padding:20px;">Map failed to load. Check internet connection.</p>';
    return;
  }
  
  log('Leaflet loaded');
  
  // Generate tracking number
  function generateTrackingNumber() {
    return "EC-" + Math.random().toString(36).substring(2, 10).toUpperCase();
  }
  
  // Set initial value
  trackingInput.value = generateTrackingNumber();
  log('Tracking number set: ' + trackingInput.value, 'success');

  // State
  let routePoints = [];
  let mapMarkers = [];
  let shipments = [];
  let adminMap = null;

  // Init Map
  try {
    adminMap = window.L.map("adminMap").setView([20, 0], 2);
    window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(adminMap);
    
    adminMap.on("click", function(e) {
      const label = prompt("Label (Origin, Transit, Destination):");
      if (!label) return;

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
        
        log('Added marker: ' + label + ' at ' + e.latlng.lat.toFixed(4) + ',' + e.latlng.lng.toFixed(4), 'success');

        marker.on("dragend", function() {
          const pos = marker.getLatLng();
          point.lat = pos.lat;
          point.lng = pos.lng;
        });
      } catch (err) {
        showErr('Error adding marker: ' + err.message);
      }
    });
    
    log('Map ready', 'success');
  } catch(e) {
    showErr('Map init failed: ' + e.message);
    mapDiv.innerHTML = '<p style="color:red;padding:20px;">Map error: ' + e.message + '</p>';
    return;
  }

  // Load shipments
  try {
    const q = query(collection(db, 'shipments'), orderBy('createdAt', 'desc'));
    
    onSnapshot(q, (snapshot) => {
      shipments = snapshot.docs.map(d => ({id: d.id, ...d.data()}));
      log('Loaded ' + shipments.length + ' shipments', 'success');
      renderTable();
    }, (err) => {
      showErr('Firebase error: ' + err.message);
      shipmentTable.innerHTML = '<tr><td colspan="5" style="color:red;text-align:center;">Error: ' + err.message + '</td></tr>';
    });
    
    log('Firebase listener started', 'success');
  } catch(err) {
    showErr('Failed to start Firebase: ' + err.message);
  }

  // Render table
  function renderTable() {
    if (!shipments.length) {
      shipmentTable.innerHTML = '<tr><td colspan="5" style="text-align:center;">No shipments. Create one above!</td></tr>';
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
  }

  // Save
  window.saveShipment = async function() {
    const recipient = document.getElementById("recipient");
    
    if (!recipient || !recipient.value) {
      showErr('Please enter a recipient name');
      return;
    }

    const data = {
      trackingNumber: trackingInput.value.toUpperCase(),
      sender: document.getElementById("sender")?.value || '',
      recipient: recipient.value,
      origin: document.getElementById("origin")?.value || '',
      destination: document.getElementById("destination")?.value || '',
      weight: document.getElementById("weight")?.value || '',
      status: document.getElementById("status")?.value || '',
      lastUpdate: document.getElementById("lastUpdate")?.value || new Date().toLocaleString(),
      route: routePoints.map(p => ({lat: p.lat, lng: p.lng, label: p.label}))
    };

    const exists = shipments.find(s => s.trackingNumber === data.trackingNumber);

    try {
      log('Saving shipment...');
      
      if (exists) {
        await shipmentService.update(data.trackingNumber, data);
      } else {
        await shipmentService.create(data);
      }
      
      showOk('Shipment saved! New tracking: ' + generateTrackingNumber());
      resetForm();
    } catch(err) {
      showErr('Save failed: ' + err.message);
    }
  };

  // Delete
  window.removeShipment = async function(tn) {
    if (!confirm('Delete?')) return;
    try {
      await shipmentService.delete(tn);
      log('Deleted: ' + tn, 'success');
    } catch(e) {
      showErr('Delete failed: ' + e.message);
    }
  };

  // Edit
  window.editShipment = function(tn) {
    const s = shipments.find(x => x.trackingNumber === tn);
    if (!s) {
      showErr('Shipment not found: ' + tn);
      return;
    }

    trackingInput.value = s.trackingNumber;
    document.getElementById("sender").value = s.sender || '';
    recipient.value = s.recipient || '';
    document.getElementById("origin").value = s.origin || '';
    document.getElementById("destination").value = s.destination || '';
    document.getElementById("weight").value = s.weight || '';
    document.getElementById("status").value = s.status || '';
    document.getElementById("lastUpdate").value = s.lastUpdate || '';

    // Clear markers
    mapMarkers.forEach(m => adminMap && adminMap.removeLayer(m));
    mapMarkers = [];
    routePoints = [];

    // Load route
    if (s.route && adminMap) {
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
    
    log('Loaded shipment for edit: ' + tn, 'success');
  };

  // Reset
  function resetForm() {
    trackingInput.value = generateTrackingNumber();
    log('New tracking number: ' + trackingInput.value, 'success');
    
    ["sender", "recipient", "origin", "destination", "weight", "status", "lastUpdate"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    
    mapMarkers.forEach(m => adminMap && adminMap.removeLayer(m));
    mapMarkers = [];
    routePoints = [];
    
    if (adminMap) adminMap.setView([20, 0], 2);
  }

  log('App ready', 'success');
});
