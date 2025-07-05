const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.get("/", (req, res) => {
  res.send("<h2 style='color:green;'>✅ WebRTC Signaling Server is running.</h2>");
});

const sessions = {};        // { sessionId: { clientName: ws } }
const storedOffers = {};    // { sessionId: { offer: offerMessage, timestamp } }
const storedIce = {};       // { sessionId: [ice1, ice2, ...] }
const lastSeen = {};        // { sessionId: { manager: ts, receiver: ts } }

function logClients() {
  console.log(`📊 Connected clients: ${[...wss.clients].length}`);
}

wss.on("connection", (ws) => {
  console.log("🔌 New WebSocket connection");
  logClients();

  ws.on("message", (msgStr) => {
    let msg;
    try {
      msg = JSON.parse(msgStr);
    } catch (e) {
      console.log("📨 Non-JSON message received:", msgStr.toString());
      return;
    }

    const { type, session, from, to } = msg;
    console.log(`📨 Message received: ${type}`, msg);

    // Track connection
    if (!sessions[session]) sessions[session] = {};
    sessions[session][from] = ws;

    if (!lastSeen[session]) lastSeen[session] = {};
    lastSeen[session][from] = Date.now();

    // Store offer
    if (type === "offer") {
      storedOffers[session] = {
        offer: msg,
        timestamp: Date.now()
      };
      console.log("💾 Stored SDP offer for replay");
    }

    // Store ICE
    if (type === "ice") {
      if (!storedIce[session]) storedIce[session] = [];
      storedIce[session].push(msg);
    }

    // Replay offer and ICE when a client joins
    if (type === "join") {
      const stored = storedOffers[session];
      if (stored && Date.now() - stored.timestamp < 2 * 24 * 60 * 60 * 1000) {
        console.log(`📤 Sending stored offer to ${from}`);
        ws.send(JSON.stringify(stored.offer));
      } else {
        console.log("⏳ No valid stored offer found");
      }

      if (storedIce[session]) {
        console.log(`📤 Replaying stored ICE candidates to ${from}`);
        storedIce[session].forEach(iceMsg => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(iceMsg));
          }
        });
      }
    }

    // Relay messages if possible
    if (to && sessions[session] && sessions[session][to]) {
      const target = sessions[session][to];
      if (target.readyState === WebSocket.OPEN) {
        target.send(JSON.stringify(msg));
      }
    }
  });

  ws.on("close", () => {
    console.log("❌ WebSocket disconnected");
    logClients();
  });

  ws.on("error", (err) => {
    console.error("💥 WebSocket error:", err.message);
  });
});

// 🧹 Periodic cleanup of old sessions (every 1 hour)
setInterval(() => {
  const now = Date.now();
  const TWO_DAYS = 2 * 24 * 60 * 60 * 1000;

  Object.entries(lastSeen).forEach(([sessionId, clients]) => {
    const managerSeen = clients.manager || 0;
    const receiverSeen = clients.receiver || 0;

    if (now - managerSeen > TWO_DAYS && now - receiverSeen > TWO_DAYS) {
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
