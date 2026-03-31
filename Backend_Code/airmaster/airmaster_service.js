const express = require('express');
const { createClient } = require('redis');

const app = express();
app.use(express.json());

const redisClient = createClient({ url: "redis://redis:6379" });
const REDIS_KEY = "airConditionerState";

// Default device state
let airConditionerState = {
  status: 'off',
  temperature: 24,
  mode: 'cool',
  fanSpeed: 'medium'
};

// Load state from Redis
async function loadState() {
  try {
    const data = await redisClient.get(REDIS_KEY);
    if (data) {
      airConditionerState = JSON.parse(data);
      console.log("✅ Loaded AC state from Redis:", airConditionerState);
    }
  } catch (err) {
    console.error("❌ Failed to load AC state:", err);
  }
}

// Save current state to Redis
async function saveState() {
  try {
    await redisClient.set(REDIS_KEY, JSON.stringify(airConditionerState));
  } catch (err) {
    console.error("❌ Failed to save AC state:", err);
  }
}

// Validation helpers
function isValidAction(action) {
  return action === 'turn_on' || action === 'turn_off';
}
function isValidTemperature(temp) {
  return Number.isInteger(temp) && temp >= 16 && temp <= 30;
}
function isValidMode(mode) {
  return ['cool', 'heat'].includes(mode);
}
function isValidFanSpeed(speed) {
  return ['low', 'medium', 'high'].includes(speed);
}

// POST /ac/control → update AC state
app.post('/ac/control', async (req, res) => {
  const { action, temperature, mode, fanSpeed } = req.body;

  if (!req.body.hasOwnProperty('action') ||
      !req.body.hasOwnProperty('temperature') ||
      !req.body.hasOwnProperty('mode') ||
      !req.body.hasOwnProperty('fanSpeed')) {
    return res.status(400).json({ error: "Missing required fields." });
  }

  if (action !== null && !isValidAction(action)) {
    return res.status(400).json({ error: "Invalid 'action'. Must be 'turn_on' or 'turn_off'." });
  }
  if (temperature !== null && !isValidTemperature(temperature)) {
    return res.status(400).json({ error: "Invalid 'temperature'. Must be 16-30." });
  }
  if (mode !== null && !isValidMode(mode)) {
    return res.status(400).json({ error: "Invalid 'mode'. Must be 'cool' or 'heat'." });
  }
  if (fanSpeed !== null && !isValidFanSpeed(fanSpeed)) {
    return res.status(400).json({ error: "Invalid 'fanSpeed'. Must be 'low', 'medium', or 'high'." });
  }

  // Apply changes
  if (action !== null) airConditionerState.status = action === 'turn_on' ? 'on' : 'off';
  if (temperature !== null) airConditionerState.temperature = temperature;
  if (mode !== null) airConditionerState.mode = mode;
  if (fanSpeed !== null) airConditionerState.fanSpeed = fanSpeed;

  await saveState();

  res.json({
    message: 'Air Conditioner control success :)',
    airConditioner: airConditionerState
  });
});

// GET /ac/status → return current state
app.get('/ac/status', async (req, res) => {
  await loadState();
  res.json(airConditionerState);
});

// Start server after connecting to Redis
async function startServer() {
  try {
    console.log("⏳ Connecting to Redis...");
    await redisClient.connect();
    console.log("✅ Connected to Redis");

    await loadState();

    const port = process.env.PORT || 3000;
    app.listen(port, () => {
      console.log(`✅ Air Conditioner microservice is running on port ${port}`);
    });
  } catch (err) {
    console.error("❌ Redis connection error:", err);
  }
}

startServer();