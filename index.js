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

const sessions = {};        // { sessionId: { clientId: ws } }
const storedOffers = {};    // { sessionId: { [from]: { offer, timestamp } } }
const storedIce = {};       // { sessionId: { [from]: [ice1, ice2, ...] } }
const lastSeen = {};        // { sessionId: { clientId: timestamp } }

function logClients() {
  console.log(`📊 Connected clients: ${[...wss.clients].length}`);
}

function verifyJwt(token) {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;

  const [headerB64, payloadB64, signature] = parts;
  const data = `${headerB64}.${payloadB64}`;

  const expectedSig = crypto
    .createHmac("sha256", SECRET_KEY)
    .update(data)
    .digest("base64url");

  if (signature !== expectedSig) return false;

  try {
    const payloadJson = Buffer.from(payloadB64, "base64url").toString("utf8");
    const payload = JSON.parse(payloadJson);

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now - TOKEN_EXPIRY_LEEWAY) {
      console.log("⏰ Token expired");
      return false;
    }

    return true;
  } catch (err) {
    console.log("❌ Token parsing failed", err.message);
    return false;
  }
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

    const { type, session, from, to, token } = msg;

    // Validate JWT
    if (!verifyJwt(token)) {
      console.log("❌ Invalid or missing token from", from);
      ws.close(4001, "Unauthorized");
      return;
    }

    console.log(`📨 Message received: ${type}`, msg);

    // Track connection
    if (!sessions[session]) sessions[session] = {};
    sessions[session][from] = ws;

    if (!lastSeen[session]) lastSeen[session] = {};
    lastSeen[session][from] = Date.now();

    // Store offer per manager
    if (type === "offer") {
      if (!storedOffers[session]) storedOffers[session] = {};
      storedOffers[session][from] = {
        offer: msg,
        timestamp: Date.now()
      };
      console.log(`💾 Stored offer for ${from} in session ${session}`);
    }

    // Store ICE per manager
    if (type === "ice") {
      if (!storedIce[session]) storedIce[session] = {};
      if (!storedIce[session][from]) storedIce[session][from] = [];
      storedIce[session][from].push(msg);
    }

    // Handle 'join'
    if (type === "join") {
      const offers = storedOffers[session];
      const ices = storedIce[session];

      if (offers) {
        for (const managerId in offers) {
          const stored = offers[managerId];
          if (Date.now() - stored.timestamp < 2 * 24 * 60 * 60 * 1000) {
            console.log(`📤 Sending offer from ${managerId} to ${from}`);
            ws.send(JSON.stringify(stored.offer));
          }
        }
      } else {
        console.log("⏳ No stored offers found");
      }

      if (ices) {
        for (const managerId in ices) {
          ices[managerId].forEach(iceMsg => {
            if (ws.readyState === WebSocket.OPEN) {
              console.log(`📤 Replaying ICE from ${managerId} to ${from}`);
              ws.send(JSON.stringify(iceMsg));
            }
          });
        }
      }
    }

    // Relay messages
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
