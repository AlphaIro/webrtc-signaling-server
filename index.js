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

    // Track clients by session and name
    if (!sessions[session]) sessions[session] = {};
    sessions[session][from] = ws;

    // If offer, store it temporarily
    if (type === "offer") {
      storedOffers[session] = {
        offer: msg,
        timestamp: Date.now()
      };
    }

    // If receiver joins later, send stored offer
    if (type === "join" && from === "receiver") {
      const stored = storedOffers[session];
      if (stored && Date.now() - stored.timestamp < 60000) {  // valid for 60 seconds
        console.log("📤 Sending stored offer to late-joining receiver");
        ws.send(JSON.stringify(stored.offer));
      }
    }

    // Forward message to intended recipient
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ WebRTC Signaling Server is running on port ${PORT}`);
});
