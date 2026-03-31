const express = require('express');
const redis = require('redis');
const app = express();

app.use(express.json());

// Default curtain state
const DEFAULT_CURTAINS_STATE = {
  status: 'off',           // "on" or "off"
  openPercentage: 0        
};

const REDIS_KEY = 'curtainsState';
let redisClient;

// Validation
function isValidAction(action) {
  return action === 'turn_on' || action === 'turn_off';
}

function isValidOpenPercentage(value) {
  return Number.isInteger(value) && value >= 0 && value <= 100;
}

// Load Curtain state from Redis
async function getCurtainsState() {
  const data = await redisClient.get(REDIS_KEY);
  return data ? JSON.parse(data) : { ...DEFAULT_CURTAINS_STATE };
}

// Save Curtain state to Redis
async function setCurtainsState(state) {
  await redisClient.set(REDIS_KEY, JSON.stringify(state));
}

// POST /curtains/control
app.post('/curtains/control', async (req, res) => {
  const { action, openPercentage } = req.body;

  if (!req.body.hasOwnProperty("action")) {
    return res.status(400).json({ error: "'action' is required." });
  }
  if (!req.body.hasOwnProperty("openPercentage")) {
    return res.status(400).json({ error: "'openPercentage' is required." });
  }

  // Validation
  if (action !== null && !isValidAction(action)) {
    return res.status(400).json({ error: "Invalid 'action'. Must be 'turn_on' or 'turn_off'." });
  }
  if (openPercentage !== null && openPercentage !== undefined && !isValidOpenPercentage(openPercentage)) {
    return res.status(400).json({ error: "Invalid 'openPercentage'. Must be an integer between 1 and 100." });
  }

  let currentState = await getCurtainsState();

  // Execute Logic
  if (action !== null) {
    currentState.status = (action === 'turn_on') ? 'on' : 'off';
  }

  if (currentState.status === 'on') {
    if (openPercentage !== null && openPercentage !== null) {
      currentState.openPercentage = openPercentage;
    }
  } else if (currentState.status === 'off') {
    currentState.openPercentage = 0; // Change open percentage to 0.
  }

  // update state
  await setCurtainsState(currentState);

  res.json({
    message: "Smart Curtains control successful!",
    curtains: currentState
  });
});

// GET /curtains/status
app.get('/curtains/status', async (req, res) => {
  const state = await getCurtainsState();
  res.json(state);
});

// Start server only after Redis is connected
async function startServer() {
  try {
    redisClient = redis.createClient({ url: 'redis://redis:6379' });

    console.log("⏳ Connecting to Redis...");
    await redisClient.connect();
    console.log("✅ Connected to Redis");

    const port = process.env.PORT || 3000;
    app.listen(port, () => {
      console.log(`🪟 Smart Curtains microservice is running on port ${port}`);
    });

  } catch (err) {
    console.error("❌ Failed to start service due to Redis error:", err);
  }
}

startServer();