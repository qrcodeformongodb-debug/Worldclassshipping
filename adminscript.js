// adminscript.js - Fixed Cloudinary upload with debug info
import { shipmentService } from './firebase.js';
import { collection, query, orderBy, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { db } from './firebase.js';

// ==========================================
// CLOUDINARY CONFIG - VERIFY THESE!
// ==========================================
const CLOUDINARY_CLOUD_NAME = 'du3nmhdh9';  // Your cloud name
const CLOUDINARY_UPLOAD_PRESET = 'shipping_videos';  // Must exist and be UNSIGNED

// Debug: Log config on load
console.log('🔧 Cloudinary Config:', {
  cloudName: CLOUDINARY_CLOUD_NAME,
  uploadPreset: CLOUDINARY_UPLOAD_PRESET,
  uploadUrl: `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/video/upload`
});

// State
let shipments = [];
let selectedVideoFile = null;

// ==========================================
// LOGGING HELPERS
// ==========================================
function log(msg, type = 'info') {
  console.log(`[${type}]`, msg);
}

function showErr(msg, details = '') {
  console.error(msg, details);
  const box = document.getElementById('errorBox');
  if (box) {
    box.innerHTML = `❌ ${msg}${details ? `<br><small style="opacity:0.8;">${details}</small>` : ''}`;
    box.style.display = 'block';
    setTimeout(() => box.style.display = 'none', 10000);
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

// ==========================================
// INITIALIZATION
// ==========================================
document.addEventListener("DOMContentLoaded", function () {
  log('Admin panel loaded');
  
  const trackingInput = document.getElementById("tracking");
  const trackingDisplay = document.getElementById("trackingDisplay");
  
  if (!trackingInput || !trackingDisplay) {
    showErr('Required form elements not found!');
    return;
  }

  generateNewTracking();
  setupVideoHandlers();
  loadShipments();
  
  log('Admin ready');
});

// ==========================================
// TRACKING NUMBER
// ==========================================
function generateNewTracking() {
  const tracking = "EC-" + Math.random().toString(36).substring(2, 10).toUpperCase();
  document.getElementById("tracking").value = tracking;
  const display = document.getElementById("trackingDisplay");
  if (display) display.textContent = tracking;
  return tracking;
}

// ==========================================
// VIDEO HANDLERS
// ==========================================
function setupVideoHandlers() {
  const videoInput = document.getElementById('videoInput');
  const uploadBtn = document.getElementById('uploadVideoBtn');
  
  if (videoInput) {
    videoInput.addEventListener('change', function(e) {
      const file = e.target.files[0];
      if (!file) return;
      
      console.log('📁 File selected:', {
        name: file.name,
        type: file.type,
        size: (file.size / 1024 / 1024).toFixed(2) + ' MB'
      });
      
      // Validate file type
      if (!file.type.startsWith('video/')) {
        showErr('Please select a valid video file (MP4, MOV, etc.)');
        return;
      }
      
      // Validate file size (max 100MB)
      if (file.size > 100 * 1024 * 1024) {
        showErr('Video file too large. Maximum size is 100MB.', `Your file: ${(file.size/1024/1024).toFixed(1)}MB`);
        return;
      }
      
      selectedVideoFile = file;
      
      const fileNameEl = document.getElementById('videoFileName');
      if (fileNameEl) {
        fileNameEl.textContent = `Selected: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
      }
      
      if (uploadBtn) uploadBtn.disabled = false;
      
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
    <video controls style="max-height: 400px; width: 100%;" ${isUploaded ? '' : 'style="opacity: 0.7; max-height: 400px; width: 100%;"'}>
      <source src="${url}" type="video/mp4">
      Your browser does not support the video tag.
    </video>
  `;
  
  if (clearBtn) clearBtn.style.display = 'inline-flex';
}

// ==========================================
// VIDEO UPLOAD - FIXED WITH DEBUG
// ==========================================
window.uploadVideo = async function() {
  if (!selectedVideoFile) {
    showErr('Please select a video first');
    return;
  }

  const uploadBtn = document.getElementById('uploadVideoBtn');
  const progressBar = document.getElementById('progressBar');
  const progressFill = document.getElementById('progressFill');
  
  if (uploadBtn) uploadBtn.disabled = true;
  if (progressBar) progressBar.classList.add('show');
  
  // Build FormData
  const formData = new FormData();
  formData.append('file', selectedVideoFile);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  
  // IMPORTANT: Do NOT append cloud_name to formData for unsigned uploads
  // It's only needed in the URL
  
  const uploadUrl = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/video/upload`;
  
  console.log('🚀 Starting upload to:', uploadUrl);
  console.log('📤 FormData entries:', [...formData.entries()].map(e => e[0]));

  try {
    const xhr = new XMLHttpRequest();
    
    // Track progress
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && progressFill) {
        const percent = Math.round((e.loaded / e.total) * 100);
        progressFill.style.width = percent + '%';
        console.log(`📊 Upload progress: ${percent}%`);
      }
    });
    
    // Success handler
    xhr.addEventListener('load', () => {
      console.log('✅ Upload complete. Status:', xhr.status);
      console.log('Response:', xhr.responseText.substring(0, 200));
      
      if (xhr.status === 200) {
        try {
          const response = JSON.parse(xhr.responseText);
          
          if (response.secure_url) {
            const videoUrl = response.secure_url;
            
            const videoUrlInput = document.getElementById('videoUrl');
            if (videoUrlInput) videoUrlInput.value = videoUrl;
            
            showVideoPreview(videoUrl, true);
            
            const fileNameEl = document.getElementById('videoFileName');
            if (fileNameEl) {
              fileNameEl.innerHTML = `✅ Uploaded successfully! <a href="${videoUrl}" target="_blank" style="color: #3498db; font-size: 12px;">View Video</a>`;
            }
            
            showOk('Video uploaded successfully!');
            log('Video uploaded: ' + videoUrl);
            
            setTimeout(() => {
              if (progressBar) progressBar.classList.remove('show');
              if (progressFill) progressFill.style.width = '0%';
            }, 1000);
          } else {
            showErr('Upload failed: No URL in response', JSON.stringify(response));
            if (uploadBtn) uploadBtn.disabled = false;
          }
        } catch (parseErr) {
          showErr('Failed to parse upload response', xhr.responseText.substring(0, 100));
          if (uploadBtn) uploadBtn.disabled = false;
        }
      } else {
        // Handle specific error codes
        let errorMsg = 'Upload failed';
        let errorDetails = `Status: ${xhr.status}`;
        
        try {
          const errorResponse = JSON.parse(xhr.responseText);
          errorMsg = errorResponse.error?.message || errorMsg;
          errorDetails = `Code: ${errorResponse.error?.code || 'unknown'}`;
          console.error('❌ Cloudinary error:', errorResponse);
        } catch (e) {
          errorDetails = `Status ${xhr.status}: ${xhr.statusText}`;
        }
        
        showErr(errorMsg, errorDetails);
        if (uploadBtn) uploadBtn.disabled = false;
      }
    });
    
    // ERROR HANDLER - This catches network errors
    xhr.addEventListener('error', (e) => {
      console.error('❌ Network error details:', e);
      console.error('XHR Status:', xhr.status);
      console.error('XHR ReadyState:', xhr.readyState);
      
      showErr(
        'Network error - Cannot connect to Cloudinary',
        `Check: 1) Internet connection, 2) Upload preset "${CLOUDINARY_UPLOAD_PRESET}" exists and is UNSIGNED, 3) Cloud name "${CLOUDINARY_CLOUD_NAME}" is correct`
      );
      if (uploadBtn) uploadBtn.disabled = false;
      if (progressBar) progressBar.classList.remove('show');
    });
    
    // Abort handler
    xhr.addEventListener('abort', () => {
      showErr('Upload was cancelled');
      if (uploadBtn) uploadBtn.disabled = false;
    });
    
    // Timeout handler
    xhr.addEventListener('timeout', () => {
      showErr('Upload timed out. File may be too large or connection too slow.');
      if (uploadBtn) uploadBtn.disabled = false;
    });
    
    // Open and send
    xhr.open('POST', uploadUrl, true);
    // No custom headers needed for unsigned upload
    xhr.send(formData);
    
  } catch (err) {
    console.error('❌ Upload exception:', err);
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
  
  const videoInput = document.getElementById('videoInput');
  if (videoInput) videoInput.value = '';
  
  log('Video cleared');
};

// ==========================================
// LOAD SHIPMENTS
// ==========================================
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

// ==========================================
// RENDER TABLE
// ==========================================
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

// ==========================================
// SAVE SHIPMENT
// ==========================================
window.saveShipment = async function() {
  const recipientEl = document.getElementById("recipient");
  const videoUrlEl = document.getElementById("videoUrl");
  
  if (!recipientEl || !recipientEl.value.trim()) {
    showErr('Please enter a receiver name');
    recipientEl?.focus();
    return;
  }
  
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
    
    resetForm();
    
  } catch(err) {
    showErr('Save failed: ' + err.message);
    console.error('Save error:', err);
  }
};

// ==========================================
// DELETE SHIPMENT
// ==========================================
window.removeShipment = async function(tn) {
  if (!confirm('Delete shipment ' + tn + '? This cannot be undone.')) return;
  
  try {
    await shipmentService.delete(tn);
    showOk('Shipment deleted');
  } catch(e) {
    showErr('Delete failed: ' + e.message);
  }
};

// ==========================================
// EDIT SHIPMENT
// ==========================================
window.editShipment = function(tn) {
  const s = shipments.find(x => x.trackingNumber === tn);
  if (!s) {
    showErr('Shipment not found: ' + tn);
    return;
  }

  document.getElementById("tracking").value = s.trackingNumber;
  const display = document.getElementById("trackingDisplay");
  if (display) display.textContent = s.trackingNumber;
  
  document.getElementById("sender").value = s.sender || '';
  document.getElementById("recipient").value = s.recipient || '';
  document.getElementById("origin").value = s.origin || '';
  document.getElementById("destination").value = s.destination || '';
  document.getElementById("weight").value = s.weight || '';
  document.getElementById("status").value = s.status || '';
  document.getElementById("lastUpdate").value = s.lastUpdate || '';
  document.getElementById("estDelivery").value = s.estDelivery || '';
  
  const videoUrlEl = document.getElementById("videoUrl");
  const fileNameEl = document.getElementById("videoFileName");
  
  if (s.videoUrl && s.videoUrl.trim()) {
    if (videoUrlEl) videoUrlEl.value = s.videoUrl;
    showVideoPreview(s.videoUrl, true);
    if (fileNameEl) {
      fileNameEl.innerHTML = `Current: <a href="${s.videoUrl}" target="_blank" style="color: #3498db;">View Video</a>`;
    }
  } else {
    clearVideo();
  }
  
  window.scrollTo({ top: 0, behavior: 'smooth' });
  
  showOk('Editing shipment: ' + tn);
  log('Loaded for edit: ' + tn);
};

// ==========================================
// RESET FORM
// ==========================================
window.resetForm = function() {
  generateNewTracking();
  
  ["sender", "recipient", "origin", "destination", "weight", "lastUpdate", "estDelivery"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  
  const statusEl = document.getElementById("status");
  if (statusEl) statusEl.value = '';
  
  clearVideo();
  
  showOk('Form reset - Ready for new shipment');
  log('Form reset');
};
