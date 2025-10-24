import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 3000;

// --- App Keys (predefined, 6–7 keys) ---
const APP_KEYS = [
  "APPKEY_1",
  "APPKEY_2",
  "APPKEY_3",
  "APPKEY_4",
  "APPKEY_5",
  "APPKEY_6",
  "APPKEY_7"
];

// --- Path for storing devices persistently ---
const DATA_FILE = path.join(process.cwd(), "devices.json");

// --- Load devices from file ---
let devices = new Map();
if (fs.existsSync(DATA_FILE)) {
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
    for (const device of data) {
      devices.set(device.deviceId, device);
    }
    console.log(`[SERVER] Loaded ${devices.size} devices from file.`);
  } catch (err) {
    console.error("[SERVER] Failed to read devices file:", err);
  }
}

// --- Save devices to file ---
const saveDevices = () => {
  try {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(Array.from(devices.values()), null, 2)
    );
  } catch (err) {
    console.error("[SERVER] Failed to save devices:", err);
  }
};

// --- Register a new device with app key ---
app.post("/register", (req, res) => {
  const { deviceName, isParent, appKey } = req.body;

  if (!deviceName)
    return res.status(400).json({ error: "deviceName is required" });
  if (!appKey || !APP_KEYS.includes(appKey))
    return res.status(403).json({ error: "Invalid app key" });

  const deviceId = `JRV-NODE-${Math.floor(Math.random() * 9999)
    .toString()
    .padStart(4, "0")}`;

  const newDevice = {
    deviceId,
    deviceName,
    isParent: !!isParent,
    appKey,
    lastSeen: new Date().toISOString(),
  };

  devices.set(deviceId, newDevice);
  saveDevices();

  console.log(`[SERVER] Registered: ${deviceName} (${deviceId}) using appKey: ${appKey}`);
  res.json({ deviceId });
});

// --- Middleware: Verify app key ---
const verifyAppKey = (req, res, next) => {
  const appKeyHeader = req.headers["x-app-key"];
  const device = devices.get(req.params.deviceId);

  if (!device) {
    return res.status(404).json({ error: "Device not found" });
  }

  if (!appKeyHeader || device.appKey !== appKeyHeader) {
    return res.status(403).json({ error: "Invalid app key" });
  }

  req.device = device;
  next();
};

// --- Receive messages ---
app.post("/devices/:deviceId/message", verifyAppKey, (req, res) => {
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
