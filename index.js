const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const crypto = require("crypto");

const SECRET_KEY = "815815815avich";
const TOKEN_EXPIRY_LEEWAY = 60; // seconds

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.get("/", (req, res) => {
  res.send("<h2 style='color:green;'>✅ WebRTC Signaling Server is running with JWT & multi-manager support.</h2>");
});

// ✅ NEW: List all active manager IDs
app.get("/managers", (req, res) => {
  const managerSet = new Set();
  for (const sessionId in sessions) {
    for (const clientId in sessions[sessionId]) {
      if (clientId.startsWith("manager")) {
        managerSet.add(clientId);
      }
    }
  }
  res.json([...managerSet]);
});

const sessions = {};        // { sessionId: { clientId: ws } }
const storedOffers = {};    // { sessionId: { [from]: { offer, timestamp } } }
const storedIce = {};       // { sessionId: { [from]: [ice1, ice2, ...] } }
const lastSeen = {};        // { sessionId: { clientId: timestamp } }

// ... rest of your WebSocket setup (unchanged) ...

// 🧹 Periodic cleanup of old sessions (every 1 hour)
setInterval(() => {
  const now = Date.now();
  const TWO_DAYS = 2 * 24 * 60 * 60 * 1000;

  Object.entries(lastSeen).forEach(([sessionId, clients]) => {
    const allInactive = Object.values(clients).every(ts => now - ts > TWO_DAYS);
    if (allInactive) {
      console.log(`🗑️ Expiring inactive session: ${sessionId}`);
      delete sessions[sessionId];
      delete storedOffers[sessionId];
      delete storedIce[sessionId];
      delete lastSeen[sessionId];
    }
  });
}, 3600000); // every 1 hour

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ WebRTC Signaling Server is running on port ${PORT}`);
});
