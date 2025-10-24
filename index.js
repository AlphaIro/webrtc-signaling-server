/*
  Jarvis Auth & Messaging Server
  --------------------------------
  ✅ Works with your current Flutter `MessageService` code.
  ✅ Supports token-based authentication.
  ✅ Has /register and /devices/:id/message endpoints
*/

const express = require("express");
const bodyParser = require("body-parser");
const jwt = require("jsonwebtoken");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET =
  process.env.JWT_SECRET || "b5fd2e2a7912edfe0d6e5c51b7103ddb";

app.use(bodyParser.json());

// --- In-memory data store ---
let devices = [];
let deviceIdCounter = 1;

// --- Middleware for logging requests ---
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// --- Middleware for verifying JWT ---
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // Bearer <TOKEN>

  if (!token) {
    console.warn("Authentication failed: Token missing");
    return res.status(401).json({ message: "Authentication token is missing." });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      console.warn("Authentication failed: Invalid token", err.message);
      return res.status(403).json({ message: "Token is invalid or expired." });
    }
    req.user = user;
    next();
  });
};

// --- [POST] /register ---
// Register a new device and return a token.
app.post("/register", (req, res) => {
  const { deviceName, isParent } = req.body;

  if (!deviceName) {
    return res.status(400).json({ message: "deviceName is required." });
  }

  const newDevice = {
    id: `JRV-NODE-${(deviceIdCounter++).toString().padStart(4, "0")}`,
    name: deviceName,
    isParent: isParent || false,
    status: "Online",
    lastSeen: new Date().toISOString(),
  };

  devices.push(newDevice);
  console.log("Device Registered:", newDevice);

  const token = jwt.sign(
    { id: newDevice.id, name: newDevice.name },
    JWT_SECRET,
    { expiresIn: "30d" }
  );

  res.status(201).json({ token, deviceId: newDevice.id });
});

// --- [POST] /devices/:deviceId/message ---
// NEW ENDPOINT: Works with your Flutter app
app.post("/devices/:deviceId/message", authenticateToken, (req, res) => {
  const { deviceId } = req.params;
  const { message } = req.body;

  const device = devices.find((d) => d.id === deviceId);

  if (!device) {
    console.warn(`Device ${deviceId} not found.`);
    return res.status(404).json({ message: "Device not found." });
  }

  if (!message) {
    return res.status(400).json({ message: "Message is required." });
  }

  console.log(`📩 Message received for ${deviceId}: "${message}"`);

  // Simulate handling message (store, log, trigger event, etc.)
  device.lastSeen = new Date().toISOString();

  return res.status(200).json({
    success: true,
    deviceId,
    receivedMessage: message,
    timestamp: device.lastSeen,
  });
});

// --- [GET] /devices --- (optional: see registered devices)
app.get("/devices", authenticateToken, (req, res) => {
  res.json(devices);
});

// --- Start Server ---
app.listen(PORT, () => {
  console.log(`✅ Jarvis Messaging Server running on port ${PORT}`);
  console.log("⚙️  Ready to receive messages from Flutter app!");
});
