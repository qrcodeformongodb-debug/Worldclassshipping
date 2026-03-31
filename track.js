// track.js - Firebase CDN version with real-time chat
import { shipmentService, chatService } from './firebase.js';
import { collection, query, orderBy, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

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

    initMap(shipment);
    initializeChat();

  } catch (err) {
    console.error(err);
    document.body.innerHTML = "<h2>Error loading shipment</h2>";
  }
}

// ===============================
// MAP
// ===============================
function initMap(shipment) {
  const map = L.map("map").setView([6.5244, 3.3792], 4);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);

  if (!shipment.route) return;

  shipment.route.forEach(r => {
    L.marker([r.lat, r.lng]).addTo(map).bindPopup(r.label || "");
  });

  const coords = shipment.route.map(r => [r.lat, r.lng]);
  if (coords.length) {
    map.fitBounds(coords);
  }
}

// ===============================
// CHAT INITIALIZE
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
    
    // Subscribe to real-time messages
    unsubscribeMessages = chatService.subscribeToMessages(conversationId, (messages) => {
      renderMessages(messages);
      updateUnread(messages);
    });
    
  } catch (err) {
    console.error("Chat initialization error:", err);
  }
}

// ===============================
// RENDER MESSAGES
// ===============================
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

// ===============================
// SEND MESSAGE
// ===============================
async function sendMessage() {
  const content = chatInput.value.trim();
  if (!content || !conversationId) return;

  chatInput.value = "";

  try {
    await chatService.sendMessage(conversationId, content, "user");
    // Message will appear via real-time subscription
  } catch (err) {
    console.error("Send error:", err);
  }
}

// ===============================
// OPEN / CLOSE CHAT
// ===============================
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
  
  // Mark as read when opening
  if (conversationId) {
    chatService.markAsRead(conversationId);
  }
}

function closeChat() {
  chatWindow.classList.remove("open");
}

// ===============================
// UNREAD COUNT
// ===============================
function updateUnread(messages) {
  const unread = messages.filter(m => m.sender === "admin" && !m.read);
  
  if (unread.length && !chatWindow.classList.contains("open")) {
    chatBadge.textContent = unread.length;
    chatBadge.classList.add("show");
  } else {
    chatBadge.classList.remove("show");
  }
}

// ===============================
// HELPERS
// ===============================
function scrollBottom() {
  chatBody.scrollTop = chatBody.scrollHeight;
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (unsubscribeMessages) {
    unsubscribeMessages();
  }
});

// Load shipment on page load
loadShipment();
