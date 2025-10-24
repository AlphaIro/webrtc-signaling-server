import express from "express";
import crypto from "crypto";
import cors from "cors";
import fs from "fs";
import path from "path";

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 3000;

// Path for storing devices persistently
const DATA_FILE = path.join(process.cwd(), "devices.json");

// Load devices from file
let devices = new Map();
if (fs.existsSync(DATA_FILE)) {
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
    for (const device of data) {
      devices.set(device.token, device);
    }
    console.log(`[SERVER] Loaded ${devices.size} devices from file.`);
  } catch (err) {
    console.error("[SERVER] Failed to read devices file:", err);
  }
}

// Save devices to file
const saveDevices = () => {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(Array.from(devices.values()), null, 2));
  } catch (err) {
    console.error("[SERVER] Failed to save devices:", err);
  }
};

// --- Register a new device ---
app.post("/register", (req, res) => {
  const { deviceName, isParent } = req.body;

  if (!deviceName) return res.status(400).json({ error: "deviceName is required" });

  const token = crypto.randomBytes(32).toString("hex");
  const deviceId = `JRV-NODE-${Math.floor(Math.random() * 9999).toString().padStart(4, "0")}`;
  const newDevice = { deviceId, deviceName, token, isParent: !!isParent, lastSeen: new Date().toISOString() };

  devices.set(token, newDevice);
  saveDevices();

  console.log(`[SERVER] Registered: ${deviceName} (${deviceId})`);
  res.json({ deviceId, token });
});

// --- Verify token middleware ---
const verifyDeviceToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Device ")) {
    return res.status(401).json({ error: "Missing or invalid token format" });
  }

  const token = authHeader.split(" ")[1];
  const device = devices.get(token);

  if (!device || device.deviceId !== req.params.deviceId) {
    return res.status(403).json({ error: "Invalid device token" });
  }

  req.device = device;
  next();
};

// --- Receive messages ---
app.post("/devices/:deviceId/message", verifyDeviceToken, (req, res) => {
  const device = req.device;
  const { message } = req.body;

  if (!message) return res.status(400).json({ error: "Message is required" });

  device.lastSeen = new Date().toISOString();
  saveDevices();

  console.log(`[MESSAGE] From ${device.deviceName} (${device.deviceId}): "${message}"`);
  res.json({ success: true, deviceId: device.deviceId, receivedMessage: message, timestamp: device.lastSeen });
});

// --- Optional: list devices ---
app.get("/devices", (req, res) => {
  res.json(Array.from(devices.values()));
});

// --- Health check ---
app.get("/", (_, res) => res.send("Jarvis Auth Server is running"));

// --- Start server ---
app.listen(PORT, () => console.log(`[SERVER] Listening on port ${PORT}`));
