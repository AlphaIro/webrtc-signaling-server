import express from "express";
import crypto from "crypto";
import cors from "cors";

const app = express();
app.use(express.json());
app.use(cors());

// Store devices in memory (you can replace with a DB later)
const devices = new Map();

// Register a new device and issue a permanent token
app.post("/register", (req, res) => {
  const { deviceName, isParent } = req.body;

  if (!deviceName) {
    return res.status(400).json({ error: "deviceName is required" });
  }

  const token = crypto.randomBytes(32).toString("hex");
  const deviceId = `JRV-NODE-${Math.floor(Math.random() * 9999)}`;
  const newDevice = { deviceId, deviceName, token, isParent: !!isParent };

  devices.set(token, newDevice);

  console.log(`[SERVER] Registered: ${deviceName} (${deviceId})`);
  res.json({ deviceId, token });
});

// Verify and accept messages
app.post("/devices/:deviceId/message", (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Device ")) {
    return res.status(401).json({ error: "Missing or invalid token format" });
  }

  const token = authHeader.split(" ")[1];
  const device = devices.get(token);

  if (!device || device.deviceId !== req.params.deviceId) {
    return res.status(403).json({ error: "Invalid device token" });
  }

  console.log(`[MESSAGE] From ${device.deviceName}: ${req.body.message}`);
  res.json({ success: true });
});

// Health check
app.get("/", (_, res) => res.send("Jarvis Auth Server is running"));

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`[SERVER] Listening on port ${PORT}`));
