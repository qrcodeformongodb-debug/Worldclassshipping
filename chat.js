// chat.js - Firebase version with real-time updates
import { chatService } from './firebase.js';

let currentChatId = null;
let currentTrackingNumber = null;
let unsubscribeMessages = null;
let unsubscribeConversations = null;

// DOM Elements
const chatList = document.getElementById('chatList');
const chatMessages = document.getElementById('chatMessages');
const chatTitle = document.getElementById('chatTitle');
const chatSubtitle = document.getElementById('chatSubtitle');
const chatInputArea = document.getElementById('chatInputArea');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const searchInput = document.getElementById('searchChats');
const closeChatBtn = document.getElementById('closeChatBtn');
const deleteChatBtn = document.getElementById('deleteChatBtn');
const totalUnreadBadge = document.getElementById('totalUnread');
const toast = document.getElementById('toast');

// INIT
document.addEventListener('DOMContentLoaded', () => {
  console.log('✅ chat.js loaded');
  setupEventListeners();
  startRealTimeConversations();
});

// EVENT LISTENERS
function setupEventListeners() {
  if (sendBtn) sendBtn.addEventListener('click', sendMessage);
  
  if (messageInput) {
    messageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
    messageInput.addEventListener('input', autoResize);
  }
  
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      filterChats(e.target.value);
    });
  }
  
  if (closeChatBtn) closeChatBtn.addEventListener('click', closeCurrentChat);
  if (deleteChatBtn) deleteChatBtn.addEventListener('click', deleteCurrentChat);
}

// REAL-TIME CONVERSATIONS
function startRealTimeConversations() {
  unsubscribeConversations = chatService.subscribeToConversations((conversations) => {
    renderChatList(conversations);
    updateTotalUnread(conversations);
  });
}

// RENDER CHAT LIST
function renderChatList(chats) {
  if (!chats || !chats.length) {
    chatList.innerHTML = `
      <div class="empty-state">
        <p>No active chats</p>
        <button onclick="createTestChat()" style="margin-top:10px;padding:8px 16px;background:#3498db;color:white;border:none;border-radius:4px;cursor:pointer;">
          Create Test Chat
        </button>
      </div>`;
    return;
  }

  chatList.innerHTML = chats.map(chat => {
    let lastMessage = chat.lastMessage || {};
    if (typeof lastMessage === "string") {
      try { lastMessage = JSON.parse(lastMessage); } catch { lastMessage = {}; }
    }
    
    const unreadCount = chat.unreadCount || 0;
    const preview = lastMessage.content || "No messages yet";
    const time = lastMessage.createdAt?.toDate 
      ? formatTime(lastMessage.createdAt.toDate()) 
      : "";
    
    return `
    <div class="chat-item ${chat.id === currentChatId ? 'active' : ''}" 
         onclick="selectChat('${chat.id}', '${chat.trackingNumber}')" 
         style="cursor: pointer; padding: 12px; border-bottom: 1px solid #eee; display: flex; align-items: center; gap: 12px;">
      
      <div class="chat-avatar" style="width: 40px; height: 40px; background: #3498db; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold;">
        ${chat.trackingNumber ? chat.trackingNumber.slice(0,2).toUpperCase() : "??"}
      </div>
      
      <div class="chat-info" style="flex: 1; min-width: 0;">
        <div class="chat-name" style="font-weight: 600; margin-bottom: 4px;">${chat.trackingNumber || "Unknown"}</div>
        <div class="chat-preview" style="font-size: 13px; color: #666; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${preview}</div>
      </div>
      
      <div class="chat-meta" style="text-align: right;">
        <div class="chat-time" style="font-size: 12px; color: #999; margin-bottom: 4px;">${time}</div>
        ${unreadCount ? `<span class="chat-unread" style="background: #e74c3c; color: white; padding: 2px 6px; border-radius: 10px; font-size: 12px;">${unreadCount}</span>` : ''}
      </div>
      
    </div>
    `;
  }).join("");
}

// CREATE TEST CHAT
window.createTestChat = async function() {
  const testTracking = 'TEST' + Math.floor(Math.random() * 10000);
  try {
    const conversation = await chatService.getOrCreateConversation(testTracking);
    console.log('Created test chat:', conversation);
    showToast('Test chat created: ' + testTracking, 'success');
  } catch (err) {
    console.error('Failed to create test chat:', err);
    showToast('Failed to create test chat', 'error');
  }
};

// SELECT CHAT
window.selectChat = async function(chatId, trackingNumber) {
  currentChatId = chatId;
  currentTrackingNumber = trackingNumber;
  
  chatTitle.textContent = `Tracking: ${trackingNumber}`;
  
  // Get conversation data for subtitle
  const conversations = await chatService.getConversations();
  const chat = conversations.find(c => c.id === chatId);
  if (chat) {
    chatSubtitle.textContent = `Started: ${formatDate(chat.createdAt?.toDate())}`;
  }
  
  chatInputArea.style.display = "block";
  
  // Unsubscribe from previous messages
  if (unsubscribeMessages) {
    unsubscribeMessages();
  }
  
  // Subscribe to real-time messages
  unsubscribeMessages = chatService.subscribeToMessages(chatId, (messages) => {
    renderMessages(messages);
  });
  
  // Mark as read
  await chatService.markAsRead(chatId);
};

// RENDER MESSAGES
function renderMessages(messages) {
  if (!messages || !messages.length) {
    chatMessages.innerHTML = `
    <div class="empty-chat" style="text-align: center; padding: 40px; color: #999;">
      <div class="empty-icon" style="font-size: 48px; margin-bottom: 16px;">💬</div>
      <p>No messages yet</p>
    </div>`;
    return;
  }

  chatMessages.innerHTML = messages.map(msg => {
    const isAdmin = msg.sender === "admin";
    const time = msg.createdAt?.toDate 
      ? formatTime(msg.createdAt.toDate()) 
      : '';
    
    return `
    <div class="message ${isAdmin ? "sent" : "received"}" 
         style="margin-bottom: 16px; max-width: 70%; ${isAdmin ? 'margin-left: auto;' : 'margin-right: auto;'}">
      
      <div class="message-header" style="font-size: 12px; color: #666; margin-bottom: 4px;">
        ${isAdmin ? "You (Admin)" : "Customer"}
      </div>
      
      <div class="message-content" 
           style="padding: 12px 16px; border-radius: 16px; ${isAdmin ? 'background: #3498db; color: white; border-bottom-right-radius: 4px;' : 'background: #f0f0f0; color: #333; border-bottom-left-radius: 4px;'}">
        ${escapeHtml(msg.content)}
      </div>
      
      <div class="message-time" style="font-size: 11px; color: #999; margin-top: 4px; text-align: ${isAdmin ? 'right' : 'left'};">
        ${time}
        ${msg.read && isAdmin ? ' ✓✓' : ''}
      </div>
      
    </div>
    `;
  }).join("");

  scrollToBottom();
}

// SEND MESSAGE
async function sendMessage() {
  const content = messageInput.value.trim();
  if (!content || !currentChatId) return;
  
  messageInput.value = "";
  messageInput.style.height = "auto";
  
  try {
    await chatService.sendMessage(currentChatId, content, "admin");
    // Message will appear via real-time subscription
  } catch (err) {
    console.error('❌ Send failed:', err);
    showToast("Failed to send message", "error");
  }
}

// CLOSE CHAT
async function closeCurrentChat() {
  if (!currentChatId) return;
  
  if (!confirm('Close this conversation? It will be archived.')) return;
  
  try {
    await chatService.closeConversation(currentChatId);
    showToast('Chat closed', 'success');
    resetChatView();
  } catch (err) {
    console.error('❌ Close chat failed:', err);
    showToast('Failed to close chat', 'error');
  }
}

// DELETE CHAT
async function deleteCurrentChat() {
  if (!currentChatId) return;
  
  if (!confirm('Delete this conversation permanently? This cannot be undone.')) return;
  
  try {
    await chatService.deleteConversation(currentChatId);
    showToast('Chat deleted', 'success');
    resetChatView();
  } catch (err) {
    console.error('❌ Delete chat failed:', err);
    showToast('Failed to delete chat', 'error');
  }
}

// RESET VIEW
function resetChatView() {
  currentChatId = null;
  currentTrackingNumber = null;
  
  if (unsubscribeMessages) {
    unsubscribeMessages();
    unsubscribeMessages = null;
  }
  
  chatTitle.textContent = "Select a chat";
  chatSubtitle.textContent = "Click on a conversation to start";
  chatInputArea.style.display = "none";
  chatMessages.innerHTML = `
  <div class="empty-chat" style="text-align: center; padding: 40px; color: #999;">
    <div class="empty-icon" style="font-size: 48px; margin-bottom: 16px;">💬</div>
    <p>Select a conversation from the sidebar</p>
  </div>`;
}

// FILTER CHATS
function filterChats(query) {
  if (!query) {
    startRealTimeConversations();
    return;
  }
  
  const items = document.querySelectorAll(".chat-item");
  items.forEach(item => {
    const name = item.querySelector(".chat-name")?.textContent.toLowerCase() || '';
    item.style.display = name.includes(query.toLowerCase()) ? "flex" : "none";
  });
}

// UPDATE TOTAL UNREAD
function updateTotalUnread(chats) {
  const total = chats.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
  
  totalUnreadBadge.textContent = total;
  totalUnreadBadge.style.display = total ? "inline-block" : "none";
  
  if (total > 0) {
    document.title = `(${total}) Customer Support Chat | worldclassshipping Admin`;
  } else {
    document.title = `Customer Support Chat | worldclassshipping Admin`;
  }
}

// AUTO RESIZE TEXTAREA
function autoResize() {
  this.style.height = "auto";
  this.style.height = Math.min(this.scrollHeight, 120) + "px";
}

// SCROLL TO BOTTOM
function scrollToBottom() {
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// FORMAT TIME
function formatTime(date) {
  if (!date) return '';
  const d = new Date(date);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  
  if (isToday) {
    return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  } else {
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
}

// FORMAT DATE
function formatDate(date) {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleString("en-US", { 
    month: "short", 
    day: "numeric", 
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

// ESCAPE HTML
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// TOAST NOTIFICATION
function showToast(msg, type = "info") {
  toast.textContent = msg;
  toast.className = `toast ${type} show`;
  
  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    padding: 12px 24px;
    border-radius: 8px;
    color: white;
    font-weight: 500;
    z-index: 1000;
    transition: all 0.3s ease;
    opacity: 0;
    transform: translateY(20px);
    ${type === 'error' ? 'background: #e74c3c;' : type === 'success' ? 'background: #27ae60;' : 'background: #3498db;'}
  `;
  
  setTimeout(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  }, 10);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(20px)';
    setTimeout(() => {
      toast.classList.remove("show");
    }, 300);
  }, 3000);
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (unsubscribeConversations) unsubscribeConversations();
  if (unsubscribeMessages) unsubscribeMessages();
});
