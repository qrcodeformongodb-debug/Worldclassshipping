// track.js - Firebase CDN version with video and enhanced map
import { shipmentService, chatService } from './firebase.js';

// ===============================
// GET TRACKING NUMBER
// ===============================
const params = new URLSearchParams(window.location.search);
const tn = params.get("tn")?.trim().toUpperCase();

if (!tn) {
  document.body.innerHTML = "<h2>No tracking number provided</h2>";
  throw new Error("Tracking number missing");
}

// ===============================
// CHAT VARIABLES
// ===============================
let conversationId = null;
let unsubscribeMessages = null;

// DOM Elements
const chatFab = document.getElementById("chatFab");
const chatWindow = document.getElementById("chatWindow");
const chatCloseBtn = document.getElementById("chatCloseBtn");
const chatInput = document.getElementById("chatInput");
const chatSendBtn = document.getElementById("chatSendBtn");
const chatMessages = document.getElementById("chatMessages");
const chatBody = document.getElementById("chatBody");
const chatBadge = document.getElementById("chatBadge");
const chatTrackingNumber = document.getElementById("chatTrackingNumber");

// ===============================
// LOAD SHIPMENT
// ===============================
async function loadShipment() {
  try {
    const shipment = await shipmentService.getByTrackingNumber(tn);
    
    if (!shipment) {
      document.body.innerHTML = "<h2>Shipment not found</h2>";
      return;
    }

    document.getElementById("tn").textContent = shipment.trackingNumber || "N/A";
    document.getElementById("sender").textContent = shipment.sender || "N/A";
    document.getElementById("receiver").textContent = shipment.recipient || "N/A";
    document.getElementById("origin").textContent = shipment.origin || "N/A";
    document.getElementById("destination").textContent = shipment.destination || "N/A";
    document.getElementById("weight").textContent = shipment.weight || "N/A";
    document.getElementById("status").textContent = shipment.status || "N/A";
    document.getElementById("lastUpdate").textContent = shipment.lastUpdate || "N/A";

    // FIX: Show video if exists - check for valid URL string
    const videoSection = document.getElementById("videoSection");
    const video = document.getElementById("shipmentVideo");
    
    // Reset video section first
    if (videoSection) {
      videoSection.style.display = "none";
    }
    if (video) {
      video.src = "";
      video.load();
    }
    
    // Check if videoUrl exists and is a valid non-empty string
    const videoUrl = shipment.videoUrl;
    if (videoUrl && typeof videoUrl === 'string' && videoUrl.trim() !== "" && videoUrl.startsWith('http')) {
      if (videoSection && video) {
        video.src = videoUrl;
        video.load(); // Force reload
        videoSection.style.display = "block";
      }
    }

    initMap(shipment);
    initializeChat();

  } catch (err) {
    console.error(err);
    document.body.innerHTML = "<h2>Error loading shipment</h2>";
  }
}

// ===============================
// ENHANCED MAP
// ===============================
function initMap(shipment) {
  const map = L.map("map", {
    scrollWheelZoom: false
  }).setView([20, 0], 2);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19
  }).addTo(map);

  L.control.scale().addTo(map);

  if (!shipment.route || shipment.route.length === 0) {
    // Default view if no route
    map.setView([6.5244, 3.3792], 4);
    return;
  }

  const markers = [];
  
  shipment.route.forEach((r, index) => {
    // Determine marker style
    let bgColor = '#ffc107';
    let textColor = '#000';
    let label = r.label || `Point ${index + 1}`;
    
    if (r.type === 'origin' || label.toLowerCase().includes('origin')) {
      bgColor = '#28a745';
      textColor = '#fff';
    } else if (r.type === 'destination' || label.toLowerCase().includes('destination')) {
      bgColor = '#dc3545';
      textColor = '#fff';
    }

    const customIcon = L.divIcon({
      className: 'custom-marker',
      html: `<div style="
        background: ${bgColor};
        color: ${textColor};
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

    const marker = L.marker([r.lat, r.lng], { icon: customIcon })
      .addTo(map)
      .bindPopup(`<strong>${label}</strong><br>Lat: ${r.lat.toFixed(4)}<br>Lng: ${r.lng.toFixed(4)}`);
    
    markers.push(marker);
  });

  // Draw animated route line
  if (shipment.route.length >= 2) {
    const latlngs = shipment.route.map(r => [r.lat, r.lng]);
    
    // Animated line
    const routeLine = L.polyline(latlngs, {
      color: '#002147',
      weight: 4,
      opacity: 0.8,
      dashArray: '10, 10',
      lineCap: 'round'
    }).addTo(map);

    // Add moving marker animation
    let currentIndex = 0;
    const movingMarker = L.circleMarker(latlngs[0], {
      radius: 8,
      fillColor: '#002147',
      color: '#fff',
      weight: 2,
      opacity: 1,
      fillOpacity: 0.9
    }).addTo(map);

    // Animate along route
    function animateMarker() {
      currentIndex = (currentIndex + 1) % latlngs.length;
      movingMarker.setLatLng(latlngs[currentIndex]);
      setTimeout(animateMarker, 2000);
    }
    
    // Start animation after delay
    setTimeout(animateMarker, 1000);
  }

  // Fit bounds
  if (markers.length > 0) {
    const group = new L.featureGroup(markers);
    map.fitBounds(group.getBounds().pad(0.1));
  }
}

// ===============================
// CHAT
// ===============================
async function initializeChat() {
  chatTrackingNumber.textContent = tn;

  chatFab.addEventListener("click", toggleChat);
  chatCloseBtn.addEventListener("click", closeChat);
  chatSendBtn.addEventListener("click", sendMessage);

  chatInput.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      sendMessage();
    }
  });

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
}

function renderMessages(messages) {
  if (!messages.length) {
    chatMessages.innerHTML = "";
    return;
  }

  chatMessages.innerHTML = messages.map(msg => {
    const isUser = msg.sender === "user";
    const time = msg.createdAt?.toDate 
      ? msg.createdAt.toDate().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) 
      : '';

    return `
    <div class="message ${isUser ? "user" : "admin"}">
        <div class="message-content">
        ${escapeHtml(msg.content)}
        </div>
        <div class="message-time">
        ${time}
        </div>
    </div>
    `;
  }).join("");

  scrollBottom();
}

async function sendMessage() {
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
    chatInput.focus();
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
  chatBody.scrollTop = chatBody.scrollHeight;
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

window.addEventListener('beforeunload', () => {
  if (unsubscribeMessages) {
    unsubscribeMessages();
  }
});

loadShipment();
