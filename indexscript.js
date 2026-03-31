// indexscript.js - Firebase version
import { shipmentService } from './firebase.js';

async function trackShipment() {
  const input = document.getElementById("trackingNumber");
  const resultBox = document.getElementById("trackingResult");
  const trackingNumber = input.value.trim();

  resultBox.innerHTML = "";

  if (!trackingNumber) {
    resultBox.innerHTML = "<p style='color:red'>Please enter a tracking number.</p>";
    return;
  }

  try {
    // Show loading
    resultBox.innerHTML = "<p>Searching...</p>";
    
    const shipment = await shipmentService.getByTrackingNumber(trackingNumber);
    
    if (!shipment) {
      resultBox.innerHTML = "<p style='color:red'>Tracking number not found.</p>";
      return;
    }

    // Redirect to track page with the tracking number
    window.location.href = `track.html?tn=${trackingNumber.toUpperCase()}`;

  } catch (err) {
    console.error("Error:", err);
    resultBox.innerHTML = "<p style='color:red'>Error searching. Please try again.</p>";
  }
}

// Allow Enter key to submit
document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById("trackingNumber");
  if (input) {
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        trackShipment();
      }
    });
  }
});

// Make function available globally
window.trackShipment = trackShipment;
