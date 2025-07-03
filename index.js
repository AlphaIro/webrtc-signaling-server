const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.get("/", (req, res) => {
  res.send("<h2 style='color:green;'>✅ WebRTC Signaling Server is running.</h2>");
});

wss.on("connection", (ws) => {
  console.log("🔌 New WebSocket connection");

  ws.on("message", (message) => {
    wss.clients.forEach((client) => {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  });

  ws.on("close", () => {
    console.log("🔌 WebSocket disconnected");
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ WebRTC Signaling Server is running on port ${PORT}`);
});
