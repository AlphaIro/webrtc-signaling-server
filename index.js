/*
  NOTE: This file contains Node.js server-side code, not Dart code.
  It is intended as a blueprint for your backend service.
  To run this, you would need a Node.js environment with the following packages:
  - express
  - jsonwebtoken
  - body-parser

  You can install them using npm:
  npm install express jsonwebtoken body-parser
*/

const express = require('express');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');

const app = express();
// Render provides the PORT environment variable.
const PORT = process.env.PORT || 3000;

// IMPORTANT: In a real production environment, this secret should be a long,
// complex string and stored securely as an environment variable (e.g., process.env.JWT_SECRET).
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-and-long-jwt-secret-key-from-env-vars';

app.use(bodyParser.json());

// --- Middleware: Request Logging ---
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// --- In-Memory Database for Demonstration ---
let devices = [];
let deviceIdCounter = 1;

// --- Middleware for Authentication ---

/**
 * Verifies the JWT token from the Authorization header.
 */
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer <TOKEN>

    if (!token) {
        console.warn('Authentication failed: Token missing');
        return res.status(401).json({ message: 'Authentication token is missing.' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            console.warn('Authentication failed: Invalid token', err.message);
            return res.status(403).json({ message: 'Token is invalid or expired.' });
        }
        req.user = user;
        next();
    });
};

/**
 * Checks if the authenticated user has a 'parent' role.
 */
const isParent = (req, res, next) => {
    const device = devices.find(d => d.id === req.user.id);
    if (device && device.isParent) {
        next();
    } else {
        console.warn(`Access denied: Device ${req.user.id} is not a parent`);
        res.status(403).json({ message: 'Access denied: Parent role required.' });
    }
};

// --- API Endpoints ---

/**
 * [POST] /register
 * Registers a new device (parent or child) and returns a JWT for future requests.
 */
app.post('/register', (req, res) => {
    try {
        const { deviceName, isParent } = req.body;

        if (!deviceName) {
            return res.status(400).json({ message: 'deviceName is required.' });
        }

        const newDevice = {
            id: `JRV-NODE-${(deviceIdCounter++).toString().padStart(4, '0')}`,
            name: deviceName,
            isParent: isParent || false,
            status: 'Online',
            location: 'Unknown',
            latitude: 0.0,
            longitude: 0.0,
            wifiSsid: 'N/A',
            isBluetoothConnected: false,
            lastSeen: new Date().toISOString()
        };

        devices.push(newDevice);
        console.log('Device Registered:', newDevice);

        const token = jwt.sign({ id: newDevice.id, name: newDevice.name }, JWT_SECRET, { expiresIn: '30d' });

        res.status(201).json({ token: token, deviceId: newDevice.id });
    } catch (err) {
        console.error('Error in /register:', err);
        res.status(500).json({ message: 'Server error during registration.' });
    }
});

/**
 * [GET] /devices
 * Protected endpoint for parent apps to fetch a list of all child devices.
 */
app.get('/devices', authenticateToken, isParent, (req, res) => {
    try {
        const childDevices = devices.filter(d => !d.isParent);
        res.json(childDevices);
    } catch (err) {
        console.error('Error in /devices:', err);
        res.status(500).json({ message: 'Server error fetching devices.' });
    }
});

/**
 * [GET] /devices/:deviceId
 * Protected endpoint for a parent app to fetch details for a single device.
 */
app.get('/devices/:deviceId', authenticateToken, isParent, (req, res) => {
    try {
        const { deviceId } = req.params;
        const device = devices.find(d => d.id === deviceId);

        if (device) {
            res.json(device);
        } else {
            res.status(404).json({ message: 'Device not found.' });
        }
    } catch (err) {
        console.error(`Error in /devices/${req.params.deviceId}:`, err);
        res.status(500).json({ message: 'Server error fetching device.' });
    }
});

/**
 * [POST] /devices/:deviceId/command
 * Protected endpoint for parent apps to send a command to a specific child device.
 */
app.post('/devices/:deviceId/command', authenticateToken, isParent, (req, res) => {
    try {
        const { deviceId } = req.params;
        const { command, payload } = req.body;

        const targetDevice = devices.find(d => d.id === deviceId);

        if (!targetDevice) {
            return res.status(404).json({ message: 'Target device not found.' });
        }

        if (!command) {
            return res.status(400).json({ message: 'Command is required.' });
        }

        console.log(`Received command '${command}' for device ${deviceId} with payload:`, payload);

        switch (command.toLowerCase()) {
            case 'lock':
                console.log(`-> Locking device ${deviceId} for ${payload?.duration || 'an unspecified time'}.`);
                targetDevice.status = 'Locked';
                break;
            case 'locate':
                console.log(`-> Requesting location from ${deviceId}.`);
                break;
            default:
                console.warn(`-> Unknown command: ${command}`);
                return res.status(400).json({ message: 'Unknown command.' });
        }

        res.status(200).json({ message: `Command '${command}' sent to ${deviceId} successfully.` });
    } catch (err) {
        console.error('Error in /devices/:deviceId/command:', err);
        res.status(500).json({ message: 'Server error processing command.' });
    }
});

/**
 * [PUT] /devices/:deviceId
 * Protected endpoint for a parent app to update a device's properties (e.g., nickname).
 */
app.put('/devices/:deviceId', authenticateToken, isParent, (req, res) => {
    try {
        const { deviceId } = req.params;
        const { nickname } = req.body;

        const device = devices.find(d => d.id === deviceId);

        if (device) {
            if (nickname !== undefined) {
                device.nickname = nickname;
                console.log(`Updated nickname for ${deviceId} to "${nickname}"`);
            }
            res.status(200).json(device);
        } else {
            res.status(404).json({ message: 'Device not found.' });
        }
    } catch (err) {
        console.error(`Error in PUT /devices/${req.params.deviceId}:`, err);
        res.status(500).json({ message: 'Server error updating device.' });
    }
});

// --- Server Initialization ---
app.listen(PORT, () => {
    console.log(`Jarvis Auth Server is running on port ${PORT}`);
    console.log('This is a mock server. In production, use a persistent database.');
});
