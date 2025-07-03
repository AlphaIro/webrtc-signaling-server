const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.get("/", (req, res) => {
  res.send("<h2 style='color:green;'>✅ WebRTC Signaling Server is running.</h2>");
});

// Helper to print clients info
function logClients() {
  console.log(`📊 Connected clients: ${[...wss.clients].length}`);
}

wss.on("connection", (ws) => {
  console.log("🔌 New WebSocket connection");
  logClients();

  ws.on("message", (message) => {
    try {
      const parsed = JSON.parse(message);
      console.log("📨 Message received:", parsed.type || "Unknown", parsed);
    } catch (e) {
      console.log("📨 Non-JSON message received:", message.toString());
    }

    // Broadcast to all other clients
    wss.clients.forEach((client) => {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
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
