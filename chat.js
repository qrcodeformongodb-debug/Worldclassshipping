// chat.js - Firebase CDN version with real-time updates and comprehensive error handling
import { chatService } from './firebase.js';
import { collection, query, orderBy, onSnapshot, getDocs, getFirestore } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { db } from './firebase.js';

let currentChatId = null;
let currentTrackingNumber = null;
let unsubscribeMessages = null;
let unsubscribeConversations = null;
let errorLog = [];
let isFirebaseConnected = false;

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
const errorPanel = document.getElementById('errorPanel');
const errorToggle = document.getElementById('errorToggle');
const errorList = document.getElementById('errorList');
const errorCount = document.getElementById('errorCount');
const connectionStatus = document.getElementById('connectionStatus');

// ERROR HANDLING SYSTEM
function logError(type, message, stack = '', context = {}) {
  const timestamp = new Date().toLocaleTimeString();
  const errorItem = {
    timestamp,
    type,
    message,
    stack,
    context: JSON.stringify(context, null, 2)
  };
  
  errorLog.unshift(errorItem);
  updateErrorDisplay();
  console.error(`[${type}] ${message}`, context, stack);
  
  // Show toast for critical errors
  if (type === 'FIREBASE' || type === 'CONNECTION') {
    showToast(`Error: ${message}`, 'error');
  }
}

function updateErrorDisplay() {
  if (errorLog.length > 0) {
    errorToggle.classList.add('show', 'has-errors');
    errorCount.textContent = errorLog.length;
    
    errorList.innerHTML = errorLog.map(err => `
      <div class="error-item">
        <div class="timestamp">${err.timestamp}</div>
        <div class="type">${err.type}</div>
        <div class="message">${escapeHtml(err.message)}</div>
        ${err.stack ? `<div class="stack">${escapeHtml(err.stack)}</div>` : ''}
        ${err.context !== '{}' ? `<div class="stack">Context: ${escapeHtml(err.context)}</div>` : ''}
      </div>
    `).join('');
  }
}

window.toggleErrorPanel = function() {
  errorPanel.classList.toggle('show');
};

function updateConnectionStatus(status, message) {
  connectionStatus.className = `connection-status ${status}`;
  connectionStatus.textContent = message;
  console.log(`[Connection] ${status}: ${message}`);
}

// GLOBAL ERROR HANDLERS
window.onerror = function(msg, url, line, col, error) {
  logError('GLOBAL', msg, error?.stack || '', { url, line, col });
  return false;
};

window.onunhandledrejection = function(event) {
  logError('PROMISE', event.reason?.message || 'Unhandled Promise Rejection', event.reason?.stack || '', { reason: event.reason });
};

// INIT
document.addEventListener('DOMContentLoaded', () => {
  console.log('✅ chat.js loaded');
  updateConnectionStatus('connecting', 'Initializing...');
  setupEventListeners();
  testFirebaseConnection().then(() => {
    startRealTimeConversations();
  });
});

// TEST FIREBASE CONNECTION
async function testFirebaseConnection() {
  try {
    console.log('Testing Firebase connection...');
    updateConnectionStatus('connecting', 'Testing connection...');
    
    // Test basic Firestore access
    const testRef = collection(db, 'conversations');
    const testSnap = await getDocs(testRef);
    
    console.log('✅ Firebase connected! Docs found:', testSnap.size);
    isFirebaseConnected = true;
    updateConnectionStatus('connected', 'Connected');
    logError('SUCCESS', `Firebase connected successfully. Found ${testSnap.size} conversations`, '', {});
    
    return true;
  } catch (err) {
    isFirebaseConnected = false;
    updateConnectionStatus('disconnected', 'Connection Failed');
    logError('CONNECTION', `Firebase connection failed: ${err.message}`, err.stack, { code: err.code });
    
    // Display error in chat list
    chatList.innerHTML = `
      <div class="error-state">
        <p>❌ Failed to connect to database</p>
        <div class="debug-info error">
          <strong>Error:</strong> ${escapeHtml(err.message)}<br>
          <strong>Code:</strong> ${err.code || 'N/A'}<br>
          <strong>Time:</strong> ${new Date().toLocaleTimeString()}
        </div>
        <button onclick="location.reload()">Retry Connection</button>
      </div>
    `;
    
    return false;
  }
}

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
  if (!isFirebaseConnected) {
    logError('CONNECTION', 'Cannot start real-time conversations: Firebase not connected', '', {});
    return;
  }

  try {
    console.log('Starting real-time conversations...');
    updateConnectionStatus('connecting', 'Loading conversations...');
    
    unsubscribeConversations = chatService.subscribeToConversations(
      (conversations) => {
        console.log('✅ Received conversations:', conversations.length);
        updateConnectionStatus('connected', `Connected (${conversations.length} chats)`);
        renderChatList(conversations);
        updateTotalUnread(conversations);
      },
      (error) => {
        logError('FIREBASE', `Subscription error: ${error.message}`, error.stack, { code: error.code });
        updateConnectionStatus('disconnected', 'Subscription Error');
        
        chatList.innerHTML = `
          <div class="error-state">
            <p>❌ Failed to load conversations</p>
            <div class="debug-info error">
              <strong>Error:</strong> ${escapeHtml(error.message)}<br>
              <strong>Code:</strong> ${error.code || 'N/A'}<br>
              <strong>Hint:</strong> Check Firestore indexes in Firebase Console
            </div>
            <button onclick="location.reload()">Retry</button>
          </div>
        `;
      }
    );
  } catch (err) {
    logError('INIT', `Failed to start conversations: ${err.message}`, err.stack, {});
    updateConnectionStatus('disconnected', 'Initialization Error');
  }
}

// RENDER CHAT LIST
function renderChatList(chats) {
  try {
    if (!chats || !chats.length) {
      chatList.innerHTML = `
        <div class="empty-state">
          <p>No active chats</p>
          <div class="debug-info">
            Firebase connected: ${isFirebaseConnected}<br>
            Last check: ${new Date().toLocaleTimeString()}
          </div>
          <button onclick="window.createTestChat()" style="margin-top:10px;padding:8px 16px;background:#3498db;color:white;border:none;border-radius:4px;cursor:pointer;">
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
           onclick="window.selectChat('${chat.id}', '${chat.trackingNumber}')" 
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
  } catch (err) {
    logError('RENDER', `Failed to render chat list: ${err.message}`, err.stack, { chatCount: chats?.length });
  }
}

// CREATE TEST CHAT
window.createTestChat = async function() {
  const testTracking = 'TEST' + Math.floor(Math.random() * 10000);
  try {
    console.log('Creating test chat:', testTracking);
    const conversation = await chatService.getOrCreateConversation(testTracking);
    console.log('Created test chat:', conversation);
    showToast('Test chat created: ' + testTracking, 'success');
    logError('SUCCESS', `Test chat created: ${testTracking}`, '', { conversationId: conversation.id });
  } catch (err) {
    logError('CREATE_CHAT', `Failed to create test chat: ${err.message}`, err.stack, { trackingNumber: testTracking, code: err.code });
    showToast('Failed to create test chat: ' + err.message, 'error');
  }
};

// SELECT CHAT
window.selectChat = async function(chatId, trackingNumber) {
  try {
    currentChatId = chatId;
    currentTrackingNumber = trackingNumber;
    
    chatTitle.textContent = `Tracking: ${trackingNumber}`;
    
    // Get conversation data for subtitle
    const conversations = await chatService.getConversations().catch(err => {
      logError('FETCH', `Failed to get conversations: ${err.message}`, err.stack, {});
      return [];
    });
    
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
    unsubscribeMessages = chatService.subscribeToMessages(
      chatId,
      (messages) => {
        console.log('✅ Received messages:', messages.length);
        renderMessages(messages);
      },
      (error) => {
        logError('MESSAGES', `Message subscription error: ${error.message}`, error.stack, { chatId });
      }
    );
    
    // Mark as read
    await chatService.markAsRead(chatId).catch(err => {
      logError('MARK_READ', `Failed to mark as read: ${err.message}`, err.stack, { chatId });
    });
    
  } catch (err) {
    logError('SELECT_CHAT', `Failed to select chat: ${err.message}`, err.stack, { chatId, trackingNumber });
    showToast('Failed to load chat', 'error');
  }
};

// RENDER MESSAGES
function renderMessages(messages) {
  try {
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
  } catch (err) {
    logError('RENDER_MSG', `Failed to render messages: ${err.message}`, err.stack, { messageCount: messages?.length });
  }
}

// SEND MESSAGE
async function sendMessage() {
  const content = messageInput.value.trim();
  if (!content || !currentChatId) {
    logError('SEND', 'Cannot send: empty content or no chat selected', '', { hasContent: !!content, currentChatId });
    return;
  }
  
  messageInput.value = "";
  messageInput.style.height = "auto";
  
  try {
    console.log('Sending message to:', currentChatId);
    await chatService.sendMessage(currentChatId, content, "admin");
    console.log('✅ Message sent');
    // Message will appear via real-time subscription
  } catch (err) {
    logError('SEND', `Failed to send message: ${err.message}`, err.stack, { chatId: currentChatId, code: err.code });
    showToast("Failed to send message: " + err.message, "error");
  }
}

// CLOSE CHAT
async function closeCurrentChat() {
  if (!currentChatId) return;
  
  if (!confirm('Close this conversation? It will be archived.')) return;
  
  try {
    await chatService.closeConversation(currentChatId);
    showToast('Chat closed', 'success');
    logError('SUCCESS', `Chat closed: ${currentChatId}`, '', {});
    resetChatView();
  } catch (err) {
    logError('CLOSE', `Failed to close chat: ${err.message}`, err.stack, { chatId: currentChatId });
    showToast('Failed to close chat: ' + err.message, 'error');
  }
}

// DELETE CHAT
async function deleteCurrentChat() {
  if (!currentChatId) return;
  
  if (!confirm('Delete this conversation permanently? This cannot be undone.')) return;
  
  try {
    await chatService.deleteConversation(currentChatId);
    showToast('Chat deleted', 'success');
    logError('SUCCESS', `Chat deleted: ${currentChatId}`, '', {});
    resetChatView();
  } catch (err) {
    logError('DELETE', `Failed to delete chat: ${err.message}`, err.stack, { chatId: currentChatId });
    showToast('Failed to delete chat: ' + err.message, 'error');
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
    // Refresh from source
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
  try {
    const total = chats.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
    
    totalUnreadBadge.textContent = total;
    totalUnreadBadge.style.display = total ? "inline-block" : "none";
    
    if (total > 0) {
      document.title = `(${total}) Customer Support Chat | worldclassshipping Admin`;
    } else {
      document.title = `Customer Support Chat | worldclassshipping Admin`;
    }
  } catch (err) {
    logError('UNREAD', `Failed to update unread count: ${err.message}`, err.stack, {});
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
