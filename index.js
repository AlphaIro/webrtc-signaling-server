const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const SECRET_KEY = "815815815avich";

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const sessions = {}; // { sessionId: { receiver: ws, managers: { clientId: ws } } }
const storedOffers = {}, storedIce = {}, lastSeen = {};

wss.on("connection", ws => {
  ws.on("message", msgStr => {
    let msg;
    try {
      msg = JSON.parse(msgStr);
    } catch { return; }

    if (!msg.secret || msg.secret !== SECRET_KEY) {
      ws.close();
      return;
    }

    const { type, session, from, to } = msg;
    if (!sessions[session]) sessions[session] = { receiver: null, managers: {} };
    if (!lastSeen[session]) lastSeen[session] = {};

    sessions[session][ from === "receiver" ? "receiver" : "managers" ][ from ] = ws;
    lastSeen[session][from] = Date.now();

    if (type === "offer") storedOffers[session] = { offer: msg, timestamp: Date.now() };
    if (type === "ice") {
      storedIce[session] = storedIce[session] || [];
      storedIce[session].push(msg);
    }

    if (type === "join") {
      const stored = storedOffers[session];
      if (stored && Date.now() - stored.timestamp < 2*24*3600*1000) {
        ws.send(JSON.stringify(stored.offer));
      }
      (storedIce[session] || []).forEach(iceMsg => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(iceMsg));
      });
    }

    // Relay
    if (to) {
      const dest = (to === "receiver") ? sessions[session].receiver : sessions[session].managers[to];
      if (dest && dest.readyState === WebSocket.OPEN) dest.send(msgStr);
    }
  });

  ws.on("close", () => {});
});

setInterval(() => {
  const now = Date.now(), TTL = 2*24*3600*1000;
  for (const s in lastSeen) {
    const l = lastSeen[s];
    if ((l.manager||0) < now-TTL && (l.receiver||0) < now-TTL) {
      delete sessions[s]; delete storedOffers[s]; delete storedIce[s]; delete lastSeen[s];
    }
  }
}, 3600000);

server.listen(process.env.PORT || 3000, () => {
  console.log(`Server up`);
});
