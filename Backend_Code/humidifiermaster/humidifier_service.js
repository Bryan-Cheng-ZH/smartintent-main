const express = require('express');
const { createClient } = require('redis');
const app = express();

app.use(express.json());

const redisClient = createClient({ url: "redis://redis:6379" });
const REDIS_KEY = "humidifierState";

// Default state
let humidifierState = {
  status: 'off',
  level: 1
};

// Validate input
function isValidAction(action) {
  return action === 'turn_on' || action === 'turn_off';
}
function isValidLevel(level) {
  return Number.isInteger(level) && level >= 1 && level <= 5;
}
function toggleStatus(action) {
  humidifierState.status = (action === 'turn_on') ? 'on' : 'off';
}
function setLevel(level) {
  humidifierState.level = level;
}

// Load state from Redis
async function loadState() {
  try {
    const data = await redisClient.get(REDIS_KEY);
    if (data) {
      humidifierState = JSON.parse(data);
      console.log("✅ Loaded humidifier state from Redis:", humidifierState);
    }
  } catch (err) {
    console.error("❌ Error loading humidifier state:", err);
  }
}

// Save state to Redis
async function saveState() {
  try {
    await redisClient.set(REDIS_KEY, JSON.stringify(humidifierState));
  } catch (err) {
    console.error("❌ Error saving humidifier state:", err);
  }
}

// POST /humidifier/control
app.post('/humidifier/control', async (req, res) => {
  const { action, level } = req.body;

  if (!req.body.hasOwnProperty("action") || !req.body.hasOwnProperty("level")) {
    return res.status(400).json({ error: "Both 'action' and 'level' are required." });
  }
  if (action !== null && !isValidAction(action)) {
    return res.status(400).json({ error: "Invalid 'action'. Must be 'turn_on' or 'turn_off'." });
  }
  if (level !== null && !isValidLevel(level)) {
    return res.status(400).json({ error: "Invalid 'level'. Must be between 1 and 5." });
  }

  if (action !== null) toggleStatus(action);
  if (level !== null) setLevel(level);

  await saveState();

  res.json({
    message: "Humidifier control successful :)",
    humidifier: humidifierState
  });
});

// GET /humidifier/status
app.get('/humidifier/status', async (req, res) => {
  await loadState();
  res.json(humidifierState);
});

// 👇 Start only after Redis is connected!
async function startServer() {
  try {
    console.log("⏳ Connecting to Redis...");
    await redisClient.connect();
    console.log("✅ Connected to Redis");

    await loadState();

    const port = process.env.PORT || 3000;
    app.listen(port, () => {
      console.log(`💧 Humidifier microservice is running on port ${port}`);
    });
  } catch (err) {
    console.error("❌ Redis connection error:", err);
  }
}

startServer();