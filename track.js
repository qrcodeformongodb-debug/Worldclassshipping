// track.js - Firebase CDN version with new design (no map, video centered)
import { shipmentService, chatService } from './firebase.js';

// ===============================
// GET TRACKING NUMBER (UNCHANGED)
// ===============================
const params = new URLSearchParams(window.location.search);
const tn = params.get("tn")?.trim().toUpperCase();

if (!tn) {
  document.body.innerHTML = `
    <div class="error-state">
      <h2>No tracking number provided</h2>
      <p>Please provide a tracking number in the URL: ?tn=YOUR_TRACKING_NUMBER</p>
    </div>
  `;
  throw new Error("Tracking number missing");
}

// ===============================
// CHAT VARIABLES (UNCHANGED)
// ===============================
let conversationId = null;
let unsubscribeMessages = null;

// DOM Elements
const trackingContainer = document.getElementById("trackingContainer");

// ===============================
// LOAD SHIPMENT
// ===============================
async function loadShipment() {
  try {
    const shipment = await shipmentService.getByTrackingNumber(tn);
    
    if (!shipment) {
      trackingContainer.innerHTML = `
        <div class="error-state">
          <h2>Shipment not found</h2>
          <p>Tracking number <strong>${tn}</strong> does not exist in our system.</p>
        </div>
      `;
      return;
    }

    renderTrackingPage(shipment);
    initializeChat();

  } catch (err) {
    console.error(err);
    trackingContainer.innerHTML = `
      <div class="error-state">
        <h2>Error loading shipment</h2>
        <p>Please try again later.</p>
      </div>
    `;
  }
}

// ===============================
// RENDER TRACKING PAGE (NEW DESIGN)
// ===============================
function renderTrackingPage(shipment) {
  const videoUrl = shipment.videoUrl;
  const hasMedia = videoUrl && typeof videoUrl === 'string' && videoUrl.trim() !== "" && videoUrl.startsWith('http');
  
  // Determine status class
  let statusClass = '';
  const statusLower = (shipment.status || '').toLowerCase();
  if (statusLower.includes('delivered')) {
    statusClass = 'delivered';
  } else if (statusLower.includes('transit') || statusLower.includes('shipped')) {
    statusClass = 'in-transit';
  }
  
  // Build journey timeline (mock data based on status, or use route if available)
  const journeyHTML = buildJourneyHTML(shipment);
  
  // Build media section (centered)
  const mediaHTML = hasMedia ? `
    <div class="media-section">
      <div class="media-title">
        <span>📹</span>
        <span>Shipment Video</span>
      </div>
      <div class="media-container">
        <video controls poster="https://via.placeholder.com/600x400/0a2a66/ffffff?text=Shipment+Video">
          <source src="${videoUrl}" type="video/mp4">
          Your browser does not support the video tag.
        </video>
      </div>
    </div>
  ` : '';
  
  trackingContainer.innerHTML = `
    <!-- Tracking Number Header -->
    <div class="tracking-header">
      <span class="tracking-label">TRACKING CODE</span>
      <div class="tracking-number">${shipment.trackingNumber || tn}</div>
      <div class="status-badge ${statusClass}">
        ${shipment.status || 'Processing'}
      </div>
    </div>
    
    <!-- Media Section (Centered) -->
    ${mediaHTML}
    
    <!-- Shipment Details -->
    <div class="details-section">
      <div class="section-title">
        <span>📦</span>
        <span>Shipment Details</span>
      </div>
      <div class="details-grid">
        <div class="detail-item">
          <span class="detail-label">From</span>
          <span class="detail-value">${shipment.origin || 'N/A'}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">To</span>
          <span class="detail-value">${shipment.destination || 'N/A'}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Sender</span>
          <span class="detail-value">${shipment.sender || 'N/A'}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Receiver</span>
          <span class="detail-value">${shipment.recipient || 'N/A'}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Weight</span>
          <span class="detail-value">${shipment.weight || 'N/A'}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Est. Delivery</span>
          <span class="detail-value">${calculateEstDelivery(shipment)}</span>
        </div>
      </div>
    </div>
    
    <!-- Journey Timeline -->
    <div class="journey-section">
      <div class="section-title">
        <span>🚚</span>
        <span>Shipment Journey</span>
      </div>
      <ul class="journey-list">
        ${journeyHTML}
      </ul>
    </div>
    
    <!-- Last Update -->
    <div class="details-section" style="margin-top: 20px;">
      <div class="detail-item">
        <span class="detail-label">Last Updated</span>
        <span class="detail-value" style="color: #e74c3c;">${shipment.lastUpdate || 'Just now'}</span>
      </div>
    </div>
  `;
}

// ===============================
// BUILD JOURNEY TIMELINE
// ===============================
function buildJourneyHTML(shipment) {
  // If route exists, use it; otherwise create default journey based on status
  const route = shipment.route || [];
  const status = (shipment.status || '').toLowerCase();
  
  // Define journey steps
  const steps = [
    { title: 'Package Picked Up', location: shipment.origin || 'Origin', key: 'picked' },
    { title: 'Departed Origin', location: `${shipment.origin || 'Origin'} Intl shipmemt`, key: 'departed' },
    { title: 'In Transit - Hub', location: 'Sorting Facility', key: 'transit' },
    { title: 'Arrived in Destination Country', location: shipment.destination || 'Destination', key: 'arrived' },
    { title: 'Out for Delivery', location: shipment.destination || 'Destination', key: 'out' },
    { title: 'Delivered', location: shipment.destination || 'Destination', key: 'delivered' }
  ];
  
  // Determine which step is active based on status
  let activeIndex = 0;
  if (status.includes('delivered')) activeIndex = 5;
  else if (status.includes('out for delivery')) activeIndex = 4;
  else if (status.includes('arrived') || status.includes('customs')) activeIndex = 3;
  else if (status.includes('transit')) activeIndex = 2;
  else if (status.includes('departed')) activeIndex = 1;
  
  return steps.map((step, index) => {
    let itemClass = '';
    if (index < activeIndex) itemClass = 'completed';
    else if (index === activeIndex) itemClass = 'active';
    
    // Use route data if available
    let location = step.location;
    let time = '';
    
    if (route[index]) {
      location = route[index].label || location;
      if (route[index].time || route[index].timestamp) {
        time = route[index].time || route[index].timestamp;
      }
    }
    
    // For active step, show last update time
    if (index === activeIndex && shipment.lastUpdate) {
      time = shipment.lastUpdate;
    }
    
    return `
      <li class="journey-item ${itemClass}">
        <div class="journey-dot"></div>
        <div class="journey-title">${step.title}</div>
        <div class="journey-location">${location}</div>
        ${time ? `<div class="journey-time">Last updated: ${time}</div>` : ''}
      </li>
    `;
  }).join('');
}

// ===============================
// CALCULATE EST DELIVERY
// ===============================
function calculateEstDelivery(shipment) {
  // If already has est delivery, use it
  if (shipment.estDelivery) return shipment.estDelivery;
  
  // Calculate based on created date + 7 days
  const created = shipment.createdAt?.toDate ? shipment.createdAt.toDate() : new Date();
  const est = new Date(created);
  est.setDate(est.getDate() + 7);
  
  return est.toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
}

// ===============================
// CHAT (UNCHANGED FUNCTIONALITY)
// ===============================
async function initializeChat() {
  const chatTrackingNumber = document.getElementById("chatTrackingNumber");
  const chatFab = document.getElementById("chatFab");
  const chatWindow = document.getElementById("chatWindow");
  const chatCloseBtn = document.getElementById("chatCloseBtn");
  const chatInput = document.getElementById("chatInput");
  const chatSendBtn = document.getElementById("chatSendBtn");
  const chatMessages = document.getElementById("chatMessages");
  const chatBody = document.getElementById("chatBody");
  const chatBadge = document.getElementById("chatBadge");

  if (chatTrackingNumber) chatTrackingNumber.textContent = tn;

  if (chatFab) chatFab.addEventListener("click", toggleChat);
  if (chatCloseBtn) chatCloseBtn.addEventListener("click", closeChat);
  if (chatSendBtn) chatSendBtn.addEventListener("click", sendMessage);

  if (chatInput) {
    chatInput.addEventListener("keydown", e => {
      if (e.key === "Enter") sendMessage();
    });
  }

  try {
    const conversation = await chatService.getOrCreateConversation(tn);
    conversationId = conversation.id;
    
    unsubscribeMessages = chatService.subscribeToMessages(conversationId, (messages) => {
      renderMessages(messages);
      updateUnread(messages);
    });
    
  } catch (err) {
    console.error("Chat initialization error:", err);
  }

  function renderMessages(messages) {
    if (!messages.length) {
      if (chatMessages) chatMessages.innerHTML = "";
      return;
    }

    const html = messages.map(msg => {
      const isUser = msg.sender === "user";
      const time = msg.createdAt?.toDate 
        ? msg.createdAt.toDate().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) 
        : '';

      return `
        <div class="message ${isUser ? "user" : "admin"}">
          <div class="message-content">${escapeHtml(msg.content)}</div>
          <div class="message-time">${time}</div>
        </div>
      `;
    }).join("");

    if (chatMessages) chatMessages.innerHTML = html;
    scrollBottom();
  }

  async function sendMessage() {
    if (!chatInput) return;
    const content = chatInput.value.trim();
    if (!content || !conversationId) return;

    chatInput.value = "";

    try {
      await chatService.sendMessage(conversationId, content, "user");
    } catch (err) {
      console.error("Send error:", err);
    }
  }

  function toggleChat() {
    if (chatWindow.classList.contains("open")) {
      closeChat();
    } else {
      openChat();
    }
  }

  function openChat() {
    chatWindow.classList.add("open");
    setTimeout(() => {
      if (chatInput) chatInput.focus();
    }, 200);
    
    if (conversationId) {
      chatService.markAsRead(conversationId);
    }
  }

  function closeChat() {
    chatWindow.classList.remove("open");
  }

  function updateUnread(messages) {
    const unread = messages.filter(m => m.sender === "admin" && !m.read);
    
    if (unread.length && !chatWindow.classList.contains("open")) {
      chatBadge.textContent = unread.length;
      chatBadge.classList.add("show");
    } else {
      chatBadge.classList.remove("show");
    }
  }

  function scrollBottom() {
    if (chatBody) chatBody.scrollTop = chatBody.scrollHeight;
  }
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Cleanup
window.addEventListener('beforeunload', () => {
  if (unsubscribeMessages) {
    unsubscribeMessages();
  }
});

// Start
loadShipment();
