// adminscript.js - Updated with video as main focus, no map
import { shipmentService } from './firebase.js';
import { collection, query, orderBy, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { db } from './firebase.js';

// Cloudinary config
const CLOUDINARY_CLOUD_NAME = 'du3nmhdh9';
const CLOUDINARY_UPLOAD_PRESET = 'shipping_videos';

// State
let shipments = [];
let selectedVideoFile = null;

// ===============================
// LOGGING HELPERS
// ===============================
function log(msg, type = 'info') {
  console.log(`[${type}]`, msg);
}

function showErr(msg) {
  console.error(msg);
  const box = document.getElementById('errorBox');
  if (box) {
    box.textContent = '❌ ' + msg;
    box.style.display = 'block';
    setTimeout(() => box.style.display = 'none', 8000);
  }
}

function showOk(msg) {
  console.log(msg);
  const box = document.getElementById('statusBox');
  if (box) {
    box.textContent = '✅ ' + msg;
    box.style.display = 'block';
    setTimeout(() => box.style.display = 'none', 4000);
  }
}

// ===============================
// INITIALIZATION
// ===============================
document.addEventListener("DOMContentLoaded", function () {
  log('Admin panel loaded');
  
  // Check required elements
  const trackingInput = document.getElementById("tracking");
  const trackingDisplay = document.getElementById("trackingDisplay");
  
  if (!trackingInput || !trackingDisplay) {
    showErr('Required form elements not found!');
    return;
  }

  // Generate initial tracking number
  generateNewTracking();
  
  // Setup video handlers
  setupVideoHandlers();
  
  // Load shipments
  loadShipments();
  
  log('Admin ready');
});

// ===============================
// TRACKING NUMBER
// ===============================
function generateNewTracking() {
  const tracking = "EC-" + Math.random().toString(36).substring(2, 10).toUpperCase();
  document.getElementById("tracking").value = tracking;
  const display = document.getElementById("trackingDisplay");
  if (display) display.textContent = tracking;
  return tracking;
}

// ===============================
// VIDEO HANDLERS
// ===============================
function setupVideoHandlers() {
  const videoInput = document.getElementById('videoInput');
  const uploadBtn = document.getElementById('uploadVideoBtn');
  
  if (videoInput) {
    videoInput.addEventListener('change', function(e) {
      const file = e.target.files[0];
      if (!file) return;
      
      // Validate file type
      if (!file.type.startsWith('video/')) {
        showErr('Please select a valid video file');
        return;
      }
      
      // Validate file size (max 100MB)
      if (file.size > 100 * 1024 * 1024) {
        showErr('Video file too large. Maximum size is 100MB.');
        return;
      }
      
      selectedVideoFile = file;
      
      // Show file name
      const fileNameEl = document.getElementById('videoFileName');
      if (fileNameEl) {
        fileNameEl.textContent = `Selected: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
      }
      
      // Enable upload button
      if (uploadBtn) uploadBtn.disabled = false;
      
      // Show local preview
      showVideoPreview(URL.createObjectURL(file), false);
      
      log('Video selected: ' + file.name);
    });
  }
}

function showVideoPreview(url, isUploaded = false) {
  const container = document.getElementById('videoPreviewContainer');
  const clearBtn = document.getElementById('clearVideoBtn');
  
  if (!container) return;
  
  container.innerHTML = `
    <video controls ${isUploaded ? '' : 'style="opacity: 0.7;"'}>
      <source src="${url}" type="video/mp4">
      Your browser does not support the video tag.
    </video>
  `;
  
  // Show clear button if video exists
  if (clearBtn) {
    clearBtn.style.display = 'inline-flex';
  }
}

// ===============================
// VIDEO UPLOAD
// ===============================
window.uploadVideo = async function() {
  if (!selectedVideoFile) {
    showErr('Please select a video first');
    return;
  }

  const uploadBtn = document.getElementById('uploadVideoBtn');
  const progressBar = document.getElementById('progressBar');
  const progressFill = document.getElementById('progressFill');
  
  // Disable button during upload
  if (uploadBtn) uploadBtn.disabled = true;
  if (progressBar) progressBar.classList.add('show');
  
  const formData = new FormData();
  formData.append('file', selectedVideoFile);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  formData.append('cloud_name', CLOUDINARY_CLOUD_NAME);

  try {
    log('Uploading to Cloudinary...');
    
    const xhr = new XMLHttpRequest();
    
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && progressFill) {
        const percent = (e.loaded / e.total) * 100;
        progressFill.style.width = percent + '%';
      }
    });
    
    xhr.addEventListener('load', () => {
      if (xhr.status === 200) {
        const response = JSON.parse(xhr.responseText);
        const videoUrl = response.secure_url;
        
        // Save URL to hidden input
        const videoUrlInput = document.getElementById('videoUrl');
        if (videoUrlInput) videoUrlInput.value = videoUrl;
        
        // Update preview with uploaded video
        showVideoPreview(videoUrl, true);
        
        // Update UI
        const fileNameEl = document.getElementById('videoFileName');
        if (fileNameEl) {
          fileNameEl.innerHTML = `✅ Uploaded: <a href="${videoUrl}" target="_blank" style="color: #3498db;">${videoUrl.substring(0, 50)}...</a>`;
        }
        
        showOk('Video uploaded successfully!');
        log('Video uploaded: ' + videoUrl);
        
        // Reset progress
        setTimeout(() => {
          if (progressBar) progressBar.classList.remove('show');
          if (progressFill) progressFill.style.width = '0%';
        }, 1000);
        
      } else {
        showErr('Upload failed: ' + xhr.statusText);
        if (uploadBtn) uploadBtn.disabled = false;
      }
    });
    
    xhr.addEventListener('error', () => {
      showErr('Network error during upload. Please try again.');
      if (uploadBtn) uploadBtn.disabled = false;
    });
    
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/video/upload`);
    xhr.send(formData);
    
  } catch (err) {
    showErr('Upload error: ' + err.message);
    if (uploadBtn) uploadBtn.disabled = false;
  }
};

window.clearVideo = function() {
  selectedVideoFile = null;
  
  const videoUrlInput = document.getElementById('videoUrl');
  const fileNameEl = document.getElementById('videoFileName');
  const uploadBtn = document.getElementById('uploadVideoBtn');
  const clearBtn = document.getElementById('clearVideoBtn');
  const container = document.getElementById('videoPreviewContainer');
  
  if (videoUrlInput) videoUrlInput.value = '';
  if (fileNameEl) fileNameEl.textContent = '';
  if (uploadBtn) uploadBtn.disabled = true;
  if (clearBtn) clearBtn.style.display = 'none';
  
  if (container) {
    container.innerHTML = `
      <div class="video-placeholder">
        <div class="video-placeholder-icon">🎥</div>
        <p>No video selected</p>
        <p style="font-size: 12px; margin-top: 5px;">Upload a video of the item being packaged</p>
      </div>
    `;
  }
  
  // Clear file input
  const videoInput = document.getElementById('videoInput');
  if (videoInput) videoInput.value = '';
  
  log('Video cleared');
};

// ===============================
// LOAD SHIPMENTS
// ===============================
function loadShipments() {
  const q = query(collection(db, 'shipments'), orderBy('createdAt', 'desc'));
  
  onSnapshot(q, (snapshot) => {
    shipments = snapshot.docs.map(d => ({id: d.id, ...d.data()}));
    log('Loaded ' + shipments.length + ' shipments');
    renderTable();
  }, (err) => {
    showErr('Firebase error: ' + err.message);
    log('Firebase error: ' + err.message, 'error');
  });
}

// ===============================
// RENDER TABLE
// ===============================
function renderTable() {
  const tbody = document.getElementById('shipmentTable');
  if (!tbody) return;
  
  if (!shipments.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:40px; color:#7f8c8d;">No shipments yet. Create one above!</td></tr>';
    return;
  }
  
  tbody.innerHTML = shipments.map(s => {
    const hasVideo = s.videoUrl && s.videoUrl.trim() !== '';
    
    return `
      <tr>
        <td style="font-family: 'Courier New', monospace; font-weight: 600;">${s.trackingNumber || 'N/A'}</td>
        <td>${s.recipient || 'N/A'}</td>
        <td>
          <span style="
            display: inline-block;
            padding: 4px 12px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 600;
            background: ${getStatusColor(s.status)};
            color: white;
          ">${s.status || '-'}</span>
        </td>
        <td>${s.lastUpdate || '-'}</td>
        <td>${hasVideo ? `<a href="${s.videoUrl}" target="_blank" class="video-link">📹 View</a>` : '-'}</td>
        <td>
          <div class="table-actions">
            <button class="btn-edit" onclick="editShipment('${s.trackingNumber}')">Edit</button>
            <button class="btn-delete-table" onclick="removeShipment('${s.trackingNumber}')">Delete</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function getStatusColor(status) {
  const s = (status || '').toLowerCase();
  if (s.includes('delivered')) return '#27ae60';
  if (s.includes('transit')) return '#3498db';
  if (s.includes('picked')) return '#f39c12';
  if (s.includes('received')) return '#9b59b6';
  return '#95a5a6';
}

// ===============================
// SAVE SHIPMENT
// ===============================
window.saveShipment = async function() {
  const recipientEl = document.getElementById("recipient");
  const videoUrlEl = document.getElementById("videoUrl");
  
  // Validation
  if (!recipientEl || !recipientEl.value.trim()) {
    showErr('Please enter a receiver name');
    recipientEl?.focus();
    return;
  }
  
  // Video is now required
  const videoUrl = videoUrlEl ? videoUrlEl.value.trim() : '';
  if (!videoUrl) {
    showErr('Please upload a video of the shipment');
    document.getElementById('videoInput')?.click();
    return;
  }

  const data = {
    trackingNumber: document.getElementById("tracking").value.toUpperCase().trim(),
    sender: document.getElementById("sender")?.value?.trim() || '',
    recipient: recipientEl.value.trim(),
    origin: document.getElementById("origin")?.value?.trim() || '',
    destination: document.getElementById("destination")?.value?.trim() || '',
    weight: document.getElementById("weight")?.value?.trim() || '',
    status: document.getElementById("status")?.value?.trim() || 'Package Received',
    lastUpdate: document.getElementById("lastUpdate")?.value?.trim() || new Date().toLocaleString(),
    estDelivery: document.getElementById("estDelivery")?.value?.trim() || '',
    videoUrl: videoUrl,
    updatedAt: new Date().toISOString()
  };

  // Check if exists
  const exists = shipments.find(s => 
    s.trackingNumber && s.trackingNumber.toUpperCase() === data.trackingNumber.toUpperCase()
  );

  try {
    if (exists) {
      await shipmentService.update(data.trackingNumber, data);
      showOk('Shipment updated successfully!');
    } else {
      data.createdAt = new Date().toISOString();
      await shipmentService.create(data);
      showOk('Shipment created! Tracking: ' + data.trackingNumber);
    }
    
    // Reset form for next entry
    resetForm();
    
  } catch(err) {
    showErr('Save failed: ' + err.message);
    console.error('Save error:', err);
  }
};

// ===============================
// DELETE SHIPMENT
// ===============================
window.removeShipment = async function(tn) {
  if (!confirm('Delete shipment ' + tn + '? This cannot be undone.')) return;
  
  try {
    await shipmentService.delete(tn);
    showOk('Shipment deleted');
  } catch(e) {
    showErr('Delete failed: ' + e.message);
  }
};

// ===============================
// EDIT SHIPMENT
// ===============================
window.editShipment = function(tn) {
  const s = shipments.find(x => x.trackingNumber === tn);
  if (!s) {
    showErr('Shipment not found: ' + tn);
    return;
  }

  // Set tracking number
  document.getElementById("tracking").value = s.trackingNumber;
  const display = document.getElementById("trackingDisplay");
  if (display) display.textContent = s.trackingNumber;
  
  // Fill form fields
  document.getElementById("sender").value = s.sender || '';
  document.getElementById("recipient").value = s.recipient || '';
  document.getElementById("origin").value = s.origin || '';
  document.getElementById("destination").value = s.destination || '';
  document.getElementById("weight").value = s.weight || '';
  document.getElementById("status").value = s.status || '';
  document.getElementById("lastUpdate").value = s.lastUpdate || '';
  document.getElementById("estDelivery").value = s.estDelivery || '';
  
  // Handle video
  const videoUrlEl = document.getElementById("videoUrl");
  const fileNameEl = document.getElementById("videoFileName");
  
  if (s.videoUrl && s.videoUrl.trim()) {
    // Has existing video
    if (videoUrlEl) videoUrlEl.value = s.videoUrl;
    showVideoPreview(s.videoUrl, true);
    if (fileNameEl) {
      fileNameEl.innerHTML = `Current: <a href="${s.videoUrl}" target="_blank" style="color: #3498db;">View Video</a>`;
    }
  } else {
    // No video
    clearVideo();
  }
  
  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });
  
  showOk('Editing shipment: ' + tn);
  log('Loaded for edit: ' + tn);
};

// ===============================
// RESET FORM
// ===============================
window.resetForm = function() {
  // Generate new tracking
  generateNewTracking();
  
  // Clear text inputs
  ["sender", "recipient", "origin", "destination", "weight", "lastUpdate", "estDelivery"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  
  // Reset status to empty
  const statusEl = document.getElementById("status");
  if (statusEl) statusEl.value = '';
  
  // Clear video completely
  clearVideo();
  
  showOk('Form reset - Ready for new shipment');
  log('Form reset');
};
