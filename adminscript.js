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

  // Generate tracking number
  function generateTrackingNumber() {
    return "EC-" + Math.random().toString(36).substring(2, 10).toUpperCase();
  }

  trackingInput.value = generateTrackingNumber();

  // ================= MAP =================
  const adminMap = L.map("adminMap").setView([6.5244, 3.3792], 4);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(adminMap);

  adminMap.on("click", function (e) {
    const label = prompt("Label (Origin, Transit, Destination)");
    if (!label) return;

    const marker = L.marker(e.latlng, { draggable: true })
      .addTo(adminMap)
      .bindPopup(label)
      .openPopup();

    routePoints.push({ lat: e.latlng.lat, lng: e.latlng.lng, label, marker });

    marker.on("dragend", () => {
      const p = routePoints.find(r => r.marker === marker);
      if (p) {
        p.lat = marker.getLatLng().lat;
        p.lng = marker.getLatLng().lng;
      }
    });
  });

  // ================= LOAD SHIPMENTS (Real-time) =================
  function loadShipments() {
    const q = query(collection(db, 'shipments'), orderBy('createdAt', 'desc'));
    unsubscribeShipments = onSnapshot(q, (snapshot) => {
      shipments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
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

    const shipmentData = {
      trackingNumber: trackingInput.value.toUpperCase(),
      sender: sender.value,
      recipient: recipient.value,
      origin: origin.value,
      destination: destination.value,
      weight: weight.value,
      status: status.value,
      lastUpdate: lastUpdate.value || new Date().toLocaleString(),
      route: routePoints.map(p => ({ lat: p.lat, lng: p.lng, label: p.label }))
    };

    const exists = shipments.find(s => s.trackingNumber === shipmentData.trackingNumber);

    try {
      if (exists) {
        await shipmentService.update(shipmentData.trackingNumber, shipmentData);
      } else {
        await shipmentService.create(shipmentData);
      }

      alert("Shipment saved successfully!");
      resetForm();
    } catch (err) {
      console.error(err);
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
    if (!s) return;

    trackingInput.value = s.trackingNumber;
    sender.value = s.sender || '';
    recipient.value = s.recipient || '';
    origin.value = s.origin || '';
    destination.value = s.destination || '';
    weight.value = s.weight || '';
    status.value = s.status || '';
    lastUpdate.value = s.lastUpdate || '';

    // Reset map markers
    routePoints = [];
    adminMap.eachLayer(l => {
      if (l instanceof L.Marker) adminMap.removeLayer(l);
    });

    if (s.route) {
      s.route.forEach(p => {
        const m = L.marker([p.lat, p.lng], { draggable: true })
          .addTo(adminMap)
          .bindPopup(p.label);
        routePoints.push({ ...p, marker: m });
      });

      if (s.route.length) adminMap.fitBounds(s.route.map(r => [r.lat, r.lng]));
    }
  };

  // ================= TABLE =================
  function renderTable() {
    shipmentTable.innerHTML = "";
    shipments.forEach(s => {
      shipmentTable.innerHTML += `
        <tr>
          <td>${s.trackingNumber}</td>
          <td>${s.recipient || "N/A"}</td>
          <td>${s.status || ""}</td>
          <td>${s.lastUpdate || ""}</td>
          <td>
            <button onclick="editShipment('${s.trackingNumber}')">Edit</button>
            <button onclick="removeShipment('${s.trackingNumber}')">Delete</button>
          </td>
        </tr>`;
    });
  }

  // ================= RESET =================
  function resetForm() {
    trackingInput.value = generateTrackingNumber();
    ["sender", "recipient", "origin", "destination", "weight", "status", "lastUpdate"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    routePoints = [];
    adminMap.eachLayer(l => {
      if (l instanceof L.Marker) adminMap.removeLayer(l);
    });
  }

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    if (unsubscribeShipments) {
      unsubscribeShipments();
    }
  });

  loadShipments();
});
