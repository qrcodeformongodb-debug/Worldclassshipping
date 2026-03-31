// firebase.js - Firebase configuration and services
import { initializeApp } from "firebase/app";
import { 
  getFirestore, 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  serverTimestamp, 
  increment, 
  writeBatch 
} from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";

// Your Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDN6xu1yE-AumWLGU0Jh2ZoTPYXuyh-PkI",
  authDomain: "shipping-48cb5.firebaseapp.com",
  projectId: "shipping-48cb5",
  storageBucket: "shipping-48cb5.firebasestorage.app",
  messagingSenderId: "846463137386",
  appId: "1:846463137386:web:43e11d19014ecd7a9cfc13",
  measurementId: "G-SMJZCCNCGK"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const analytics = getAnalytics(app);

// Shipment Services
export const shipmentService = {
  // Get all shipments
  async getAll() {
    const q = query(collection(db, 'shipments'), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },

  // Get shipment by tracking number
  async getByTrackingNumber(trackingNumber) {
    const q = query(
      collection(db, 'shipments'), 
      where('trackingNumber', '==', trackingNumber.toUpperCase())
    );
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() };
  },

  // Create shipment
  async create(shipment) {
    const trackingNumber = shipment.trackingNumber || generateTrackingNumber();
    const shipmentData = {
      ...shipment,
      trackingNumber: trackingNumber.toUpperCase(),
      createdAt: serverTimestamp()
    };
    await setDoc(doc(db, 'shipments', trackingNumber.toUpperCase()), shipmentData);
    return shipmentData;
  },

  // Update shipment
  async update(trackingNumber, data) {
    const ref = doc(db, 'shipments', trackingNumber.toUpperCase());
    await updateDoc(ref, {
      ...data,
      updatedAt: serverTimestamp()
    });
    return this.getByTrackingNumber(trackingNumber);
  },

  // Delete shipment
  async delete(trackingNumber) {
    await deleteDoc(doc(db, 'shipments', trackingNumber.toUpperCase()));
  },

  // Subscribe to all shipments (real-time)
  subscribeToShipments(callback) {
    const q = query(collection(db, 'shipments'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snapshot) => {
      const shipments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      callback(shipments);
    });
  }
};

// Chat Services
export const chatService = {
  // Get or create conversation
  async getOrCreateConversation(trackingNumber) {
    const tn = trackingNumber.toUpperCase();
    const q = query(
      collection(db, 'conversations'), 
      where('trackingNumber', '==', tn),
      where('status', '==', 'active')
    );
    const snapshot = await getDocs(q);
    
    if (!snapshot.empty) {
      const doc = snapshot.docs[0];
      return { id: doc.id, ...doc.data() };
    }
    
    // Create new conversation
    const convoRef = doc(collection(db, 'conversations'));
    const conversation = {
      trackingNumber: tn,
      status: 'active',
      unreadCount: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    await setDoc(convoRef, conversation);
    return { id: convoRef.id, ...conversation };
  },

  // Get all active conversations
  async getConversations() {
    const q = query(
      collection(db, 'conversations'),
      where('status', '==', 'active'),
      orderBy('updatedAt', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },

  // Subscribe to conversations (real-time)
  subscribeToConversations(callback) {
    const q = query(
      collection(db, 'conversations'),
      where('status', '==', 'active'),
      orderBy('updatedAt', 'desc')
    );
    return onSnapshot(q, (snapshot) => {
      const conversations = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      callback(conversations);
    });
  },

  // Get messages
  async getMessages(conversationId) {
    const q = query(
      collection(db, 'conversations', conversationId, 'messages'),
      orderBy('createdAt', 'asc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },

  // Subscribe to messages (real-time)
  subscribeToMessages(conversationId, callback) {
    const q = query(
      collection(db, 'conversations', conversationId, 'messages'),
      orderBy('createdAt', 'asc')
    );
    return onSnapshot(q, (snapshot) => {
      const messages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      callback(messages);
    });
  },

  // Send message
  async sendMessage(conversationId, content, sender) {
    const batch = writeBatch(db);
    
    // Add message
    const messageRef = doc(collection(db, 'conversations', conversationId, 'messages'));
    const message = {
      conversationId,
      content,
      sender,
      read: false,
      createdAt: serverTimestamp()
    };
    batch.set(messageRef, message);
    
    // Update conversation
    const convoRef = doc(db, 'conversations', conversationId);
    const updateData = {
      lastMessage: {
        content,
        sender,
        createdAt: serverTimestamp()
      },
      updatedAt: serverTimestamp()
    };
    
    if (sender === 'user') {
      updateData.unreadCount = increment(1);
    }
    
    batch.update(convoRef, updateData);
    await batch.commit();
    
    return message;
  },

  // Mark as read
  async markAsRead(conversationId) {
    const batch = writeBatch(db);
    
    // Update conversation
    const convoRef = doc(db, 'conversations', conversationId);
    batch.update(convoRef, { unreadCount: 0 });
    
    // Update unread admin messages
    const messagesQuery = query(
      collection(db, 'conversations', conversationId, 'messages'),
      where('sender', '==', 'admin'),
      where('read', '==', false)
    );
    const snapshot = await getDocs(messagesQuery);
    snapshot.docs.forEach(doc => {
      batch.update(doc.ref, { read: true });
    });
    
    await batch.commit();
  },

  // Close conversation
  async closeConversation(conversationId) {
    const ref = doc(db, 'conversations', conversationId);
    await updateDoc(ref, { status: 'closed', updatedAt: serverTimestamp() });
  },

  // Delete conversation
  async deleteConversation(conversationId) {
    // Delete all messages first
    const messagesSnapshot = await getDocs(
      collection(db, 'conversations', conversationId, 'messages')
    );
    const batch = writeBatch(db);
    messagesSnapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    await batch.commit();
    
    // Delete conversation
    await deleteDoc(doc(db, 'conversations', conversationId));
  }
};

function generateTrackingNumber() {
  return "EC-" + Math.random().toString(36).substring(2, 10).toUpperCase();
}

export { db, analytics };
