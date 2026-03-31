// adminscript.js - CDN version with Cloudinary video upload and enhanced map
import { shipmentService } from './firebase.js';
import { collection, query, orderBy, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { db } from './firebase.js';

// Cloudinary config
const CLOUDINARY_CLOUD_NAME = 'du3nmhdh9';
const CLOUDINARY_UPLOAD_PRESET = 'shipping_videos'; // You'll need to create this in Cloudinary

// Log to both console and HTML
function log(msg, type = 'info') {
  console.log('[' + type + ']', msg);
}

function showErr(msg) {
  console.error(msg);
  const box = document.getElementById('errorBox');
  if (box) {
    box.textContent = 'ERROR: ' + msg;
    box.style.display = 'block';
  }
}

function showOk(msg) {
  console.log(msg);
  const box = document.getElementById('statusBox');
  if (box) {
    box.textContent = msg;
    box.style.display = 'block';
    setTimeout(() => box.style.display = 'none', 5000);
  }
}

log('Script starting...');

document.addEventListener("DOMContentLoaded", function () {
  log('DOM loaded');
  
  // Check elements
  const trackingInput = document.getElementById("tracking");
  const mapDiv = document.getElementById("adminMap");
  const shipmentTable = document.getElementById("shipmentTable");
  
  if (!trackingInput) {
    showErr('Tracking input not found!');
    return;
  }
  
  if (!mapDiv) {
    showErr('Map div not found!');
    return;
  }

  // Check Leaflet
  if (typeof window.L === 'undefined') {
    showErr('Leaflet not loaded! Check internet.');
    mapDiv.innerHTML = '<p style="color:red;padding:20px;">Map failed to load.</p>';
    return;
  }
  
  log('Leaflet loaded');

  // Generate tracking number
  function generateTrackingNumber() {
    return "EC-" + Math.random().toString(36).substring(2, 10).toUpperCase();
  }
  
  // Set initial value
  trackingInput.value = generateTrackingNumber();
  log('Tracking number: ' + trackingInput.value);

  // State
  let routePoints = [];
  let mapMarkers = [];
  let routeLine = null;
  let shipments = [];
  let adminMap = null;
  let selectedVideoFile = null;

  // ================= VIDEO UPLOAD =================
  const videoInput = document.getElementById('videoInput');
  const uploadBtn = document.getElementById('uploadVideoBtn');
  const fileNameSpan = document.getElementById('videoFileName');
  const progressBar = document.getElementById('progressBar');
  const progressFill = document.getElementById('progressFill');
  const videoPreview = document.getElementById('videoPreview');
  const videoUrlInput = document.getElementById('videoUrl');

  // Handle file selection
  if (videoInput) {
    videoInput.addEventListener('change', function(e) {
      const file = e.target.files[0];
      if (file) {
        selectedVideoFile = file;
        fileNameSpan.textContent = file.name;
        uploadBtn.disabled = false;
        
        // Show local preview
        const url = URL.createObjectURL(file);
        videoPreview.innerHTML = `
          <p><strong>Preview (not uploaded yet):</strong></p>
          <video controls src="${url}" style="max-width:100%; max-height:200px;"></video>
        `;
      }
    });
  }

  // Upload to Cloudinary
  window.uploadVideo = async function() {
    if (!selectedVideoFile) {
      showErr('Please select a video first');
      return;
    }

    uploadBtn.disabled = true;
    progressBar.classList.add('show');
    
    const formData = new FormData();
    formData.append('file', selectedVideoFile);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    formData.append('cloud_name', CLOUDINARY_CLOUD_NAME);

    try {
      log('Uploading to Cloudinary...');
      
      const xhr = new XMLHttpRequest();
      
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percent = (e.loaded / e.total) * 100;
          progressFill.style.width = percent + '%';
        }
      });
      
      xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
          const response = JSON.parse(xhr.responseText);
          const videoUrl = response.secure_url;
          
          videoUrlInput.value = videoUrl;
          videoPreview.innerHTML = `
            <p><strong>✅ Uploaded successfully!</strong></p>
            <video controls src="${videoUrl}" style="max-width:100%; max-height:200px;"></video>
            <p style="font-size:12px; color:#666;">URL: ${videoUrl}</p>
          `;
          
          showOk('Video uploaded successfully!');
          progressBar.classList.remove('show');
          progressFill.style.width = '0%';
          log('Video uploaded: ' + videoUrl);
        } else {
          showErr('Upload failed: ' + xhr.statusText);
          uploadBtn.disabled = false;
        }
      });
      
      xhr.addEventListener('error', () => {
        showErr('Upload error occurred');
        uploadBtn.disabled = false;
      });
      
      xhr.open('POST', `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/video/upload`);
      xhr.send(formData);
      
    } catch (err) {
      showErr('Upload error: ' + err.message);
      uploadBtn.disabled = false;
    }
  };

  // ================= ENHANCED MAP =================
  function initMap() {
    try {
      // Create map with better styling
      adminMap = window.L.map("adminMap", {
        scrollWheelZoom: false
      }).setView([20, 0], 2);

      // Add styled tile layer (satellite/streets hybrid look)
      window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
      }).addTo(adminMap);

      // Add scale control
      window.L.control.scale().addTo(adminMap);

      log('Map created');

      // Click to add marker
      adminMap.on("click", function(e) {
        const label = prompt("Label (Origin, Transit, Destination):");
        if (!label) return;

        // Determine marker type based on label
        let markerClass = 'custom-marker';
        const lowerLabel = label.toLowerCase();
        if (lowerLabel.includes('origin') || lowerLabel.includes('from')) {
          markerClass += ' marker-origin';
        } else if (lowerLabel.includes('destination') || lowerLabel.includes('to') || lowerLabel.includes('delivery')) {
          markerClass += ' marker-destination';
        } else {
          markerClass += ' marker-transit';
        }

        // Create custom icon
        const customIcon = window.L.divIcon({
          className: markerClass,
          html: `<div style="
            background: ${lowerLabel.includes('origin') ? '#28a745' : lowerLabel.includes('destination') ? '#dc3545' : '#ffc107'};
            color: ${lowerLabel.includes('transit') ? '#000' : '#fff'};
            padding: 8px 12px;
            border-radius: 20px;
            font-weight: bold;
            font-size: 12px;
            border: 3px solid white;
            box-shadow: 0 2px 5px rgba(0,0,0,0.3);
            white-space: nowrap;
          ">${label}</div>`,
          iconSize: null,
          iconAnchor: [15, 30]
        });

        const marker = window.L.marker(e.latlng, {
          draggable: true,
          icon: customIcon
        }).addTo(adminMap).bindPopup(label).openPopup();

        const point = {
          lat: e.latlng.lat,
          lng: e.latlng.lng,
          label: label,
          marker: marker,
          type: lowerLabel.includes('origin') ? 'origin' : lowerLabel.includes('destination') ? 'destination' : 'transit'
        };
        
        routePoints.push(point);
        mapMarkers.push(marker);

        log('Added: ' + label);

        // Update route line
        updateRouteLine();

        marker.on("dragend", function() {
          const pos = marker.getLatLng();
          point.lat = pos.lat;
          point.lng = pos.lng;
          updateRouteLine();
        });
      });

      return adminMap;
    } catch(e) {
      showErr('Map init failed: ' + e.message);
      return null;
    }
  }

  // Update animated route line
  function updateRouteLine() {
    if (routeLine) {
      adminMap.removeLayer(routeLine);
    }
    
    if (routePoints.length < 2) return;

    const latlngs = routePoints.map(p => [p.lat, p.lng]);
    
    // Create animated polyline
    routeLine = window.L.polyline(latlngs, {
      color: '#002147',
      weight: 4,
      opacity: 0.8,
      dashArray: '10, 10',
      lineCap: 'round'
    }).addTo(adminMap);

    // Fit bounds to show all points
    adminMap.fitBounds(routeLine.getBounds(), { padding: [50, 50] });
  }

  adminMap = initMap();

  // ================= LOAD SHIPMENTS =================
  function loadShipments() {
    const q = query(collection(db, 'shipments'), orderBy('createdAt', 'desc'));
    
    onSnapshot(q, (snapshot) => {
      shipments = snapshot.docs.map(d => ({id: d.id, ...d.data()}));
      log('Loaded ' + shipments.length + ' shipments');
      renderTable();
    }, (err) => {
      showErr('Firebase error: ' + err.message);
    });
  }

  // ================= RENDER TABLE =================
  function renderTable() {
    if (!shipments.length) {
      shipmentTable.innerHTML = '<tr><td colspan="6" style="text-align:center;">No shipments. Create one!</td></tr>';
      return;
    }
    
    shipmentTable.innerHTML = shipments.map(s => `
      <tr>
        <td>${s.trackingNumber || 'N/A'}</td>
        <td>${s.recipient || 'N/A'}</td>
        <td>${s.status || '-'}</td>
        <td>${s.lastUpdate || '-'}</td>
        <td>${s.videoUrl ? '<a href="' + s.videoUrl + '" target="_blank">📹 View</a>' : '-'}</td>
        <td>
          <button onclick="editShipment('${s.trackingNumber}')">Edit</button>
          <button onclick="removeShipment('${s.trackingNumber}')" style="background:#dc3545;color:white;">Delete</button>
        </td>
      </tr>
    `).join('');
  }

  // ================= SAVE =================
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
      route: routePoints.map(p => ({lat: p.lat, lng: p.lng, label: p.label, type: p.type})),
      videoUrl: document.getElementById("videoUrl")?.value || ''
    };

    const exists = shipments.find(s => s.trackingNumber === data.trackingNumber);

    try {
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

  // ================= DELETE =================
  window.removeShipment = async function(tn) {
    if (!confirm('Delete?')) return;
    try {
      await shipmentService.delete(tn);
    } catch(e) {
      showErr('Delete failed: ' + e.message);
    }
  };

  // ================= EDIT =================
  window.editShipment = function(tn) {
    const s = shipments.find(x => x.trackingNumber === tn);
    if (!s) {
      showErr('Shipment not found: ' + tn);
      return;
    }

    // Set form values
    trackingInput.value = s.trackingNumber;
    document.getElementById("sender").value = s.sender || '';
    recipient.value = s.recipient || '';
    document.getElementById("origin").value = s.origin || '';
    document.getElementById("destination").value = s.destination || '';
    document.getElementById("weight").value = s.weight || '';
    document.getElementById("status").value = s.status || '';
    document.getElementById("lastUpdate").value = s.lastUpdate || '';
    
    // Set video if exists
    if (s.videoUrl) {
      document.getElementById("videoUrl").value = s.videoUrl;
      document.getElementById("videoPreview").innerHTML = `
        <p><strong>Current Video:</strong></p>
        <video controls src="${s.videoUrl}" style="max-width:100%; max-height:200px;"></video>
      `;
    }

    // Clear and reload map markers
    clearMapMarkers();

    if (s.route && adminMap) {
      s.route.forEach((p, index) => {
        if (p.lat != null && p.lng != null) {
          let markerClass = 'custom-marker marker-transit';
          if (p.type === 'origin') markerClass = 'custom-marker marker-origin';
          if (p.type === 'destination') markerClass = 'custom-marker marker-destination';

          const customIcon = window.L.divIcon({
            className: markerClass,
            html: `<div style="
              background: ${p.type === 'origin' ? '#28a745' : p.type === 'destination' ? '#dc3545' : '#ffc107'};
              color: ${p.type === 'transit' ? '#000' : '#fff'};
              padding: 8px 12px;
              border-radius: 20px;
              font-weight: bold;
              font-size: 12px;
              border: 3px solid white;
              box-shadow: 0 2px 5px rgba(0,0,0,0.3);
              white-space: nowrap;
            ">${p.label || 'Point ' + (index + 1)}</div>`,
            iconSize: null,
            iconAnchor: [15, 30]
          });

          const m = window.L.marker([p.lat, p.lng], {
            draggable: true,
            icon: customIcon
          }).addTo(adminMap).bindPopup(p.label || 'Point');

          const point = {...p, marker: m};
          routePoints.push(point);
          mapMarkers.push(m);

          m.on("dragend", function() {
            const pos = m.getLatLng();
            point.lat = pos.lat;
            point.lng = pos.lng;
            updateRouteLine();
          });
        }
      });

      updateRouteLine();
    }
    
    log('Loaded for edit: ' + tn);
  };

  // ================= HELPERS =================
  function clearMapMarkers() {
    if (!adminMap) return;
    
    mapMarkers.forEach(m => {
      if (m) adminMap.removeLayer(m);
    });
    mapMarkers = [];
    routePoints = [];
    
    if (routeLine) {
      adminMap.removeLayer(routeLine);
      routeLine = null;
    }
  }

  function resetForm() {
    trackingInput.value = generateTrackingNumber();
    
    ["sender", "recipient", "origin", "destination", "weight", "status", "lastUpdate"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    
    // Clear video
    document.getElementById("videoUrl").value = '';
    document.getElementById("videoPreview").innerHTML = '';
    document.getElementById("videoFileName").textContent = '';
    document.getElementById("uploadVideoBtn").disabled = true;
    selectedVideoFile = null;
    
    clearMapMarkers();
    
    if (adminMap) {
      adminMap.setView([20, 0], 2);
    }
  }

  // Start
  loadShipments();
  log('App ready');
});
