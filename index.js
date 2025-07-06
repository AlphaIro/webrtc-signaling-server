const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const SECRET_KEY = "815815815avich";
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const sessions = {}; // { sessionId: { clientId: ws } }
const storedOffers = {}; // { sessionId: { [from]: { offer, timestamp } } }
const storedIce = {}; // { sessionId: { [from]: [ice1, ice2, ...] } }
const lastSeen = {}; // { sessionId: { clientId: timestamp } }

app.get("/", (req, res) => {
  res.send("<h2 style='color:green;'>✅ WebRTC Signaling Server is running.</h2>");
});

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

wss.on("connection", (ws) => {
  let sessionId = null;
  let clientId = null;

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data);
      const { type, session, from, to, sdp, ice, secret } = msg;

      if (secret !== SECRET_KEY) {
        console.warn("❌ Invalid secret from:", from);
        return;
      }

      if (!sessions[session]) sessions[session] = {};
      if (!lastSeen[session]) lastSeen[session] = {};

      lastSeen[session][from] = Date.now();

      switch (type) {
        case "join": {
          sessionId = session;
          clientId = from;
          sessions[session][from] = ws;
          console.log(`📥 ${from} joined session ${session}`);

          // Send stored offer + ICE to receiver if available
          if (from === "receiver") {
            if (storedOffers[session]) {
              for (const [managerId, offerObj] of Object.entries(storedOffers[session])) {
                console.log(`📤 Sending stored offer from ${managerId} to receiver`);
                ws.send(
                  JSON.stringify({
                    type: "offer",
                    session,
                    from: managerId,
                    to: "receiver",
                    sdp: offerObj.offer,
                  })
                );
              }
            }

            if (storedIce[session]) {
              for (const [managerId, ices] of Object.entries(storedIce[session])) {
                for (const iceObj of ices) {
                  console.log(`📤 Sending stored ICE from ${managerId} to receiver`);
                  ws.send(
                    JSON.stringify({
                      type: "ice",
                      session,
                      from: managerId,
                      to: "receiver",
                      ice: iceObj,
                    })
                  );
                }
              }
            }
          }

          break;
        }

        case "offer": {
          console.log(`📡 Offer from ${from} to ${to} in session ${session}`);
          if (!storedOffers[session]) storedOffers[session] = {};
          storedOffers[session][from] = { offer: sdp, timestamp: Date.now() };
          sendToClient(session, to, msg);
          break;
        }

        case "answer": {
          console.log(`📡 Answer from ${from} to ${to}`);
          sendToClient(session, to, msg);
          break;
        }

        case "ice": {
          console.log(`🧊 ICE from ${from} to ${to}`);
          if (!storedIce[session]) storedIce[session] = {};
          if (!storedIce[session][from]) storedIce[session][from] = [];
          storedIce[session][from].push(ice);
          sendToClient(session, to, msg);
          break;
        }

        case "switch_camera": {
          console.log(`🔄 Camera switch requested by receiver to ${to}`);
          sendToClient(session, to, msg);
          break;
        }

        default:
          console.warn("⚠️ Unknown message type:", type);
      }
    } catch (err) {
      console.error("❌ Error handling message:", err);
    }
  });

  ws.on("close", () => {
    if (sessionId && clientId && sessions[sessionId]) {
      delete sessions[sessionId][clientId];
      console.log(`❌ ${clientId} disconnected from session ${sessionId}`);
    }
  });
});

function sendToClient(session, clientId, msg) {
  const ws = sessions[session]?.[clientId];
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  } else {
    console.warn(`⚠️ Cannot send to ${clientId}, not connected.`);
  }
}

setInterval(() => {
  const now = Date.now();
  const TWO_DAYS = 2 * 24 * 60 * 60 * 1000;
  Object.entries(lastSeen).forEach(([sessionId, clients]) => {
    const allInactive = Object.values(clients).every(
      (ts) => now - ts > TWO_DAYS
    );
    if (allInactive) {
      console.log(`🗑️ Expiring inactive session: ${sessionId}`);
      delete sessions[sessionId];
      delete storedOffers[sessionId];
      delete storedIce[sessionId];
      delete lastSeen[sessionId];
    }
  });
}, 3600000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ WebRTC Signaling Server is running on port ${PORT}`);
});
