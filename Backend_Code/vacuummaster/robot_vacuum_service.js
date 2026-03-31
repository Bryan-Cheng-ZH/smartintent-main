const express = require('express');
const redis = require('redis');
const app = express();

app.use(express.json());

// Default robotic state
const DEFAULT_ROBOT_STATE = {
  status: 'off',                    // "on" or "off"
  cleaningMode: 'standard',         // "standard", "quiet", "turbo"
};

const REDIS_KEY = 'robotVacuumState';
let redisClient;

// Validation
function isValidAction(action) {
  return action === 'turn_on' || action === 'turn_off';
}

function isValidCleaningMode(mode) {
  return ['standard', 'quiet', 'turbo'].includes(mode);
}

// Load Robot state from Redis
async function getRobotState() {
  const data = await redisClient.get(REDIS_KEY);
  return data ? JSON.parse(data) : { ...DEFAULT_ROBOT_STATE };
}

// Save Robot state to Redis
async function setRobotState(state) {
  await redisClient.set(REDIS_KEY, JSON.stringify(state));
}

// POST /robot/control
app.post('/robot/control', async (req, res) => {
  const { action, cleaningMode, batteryLevel } = req.body;

  // Validation
  if (!req.body.hasOwnProperty("action")) {
    return res.status(400).json({ error: "'action' is required." });
  }
  if (!req.body.hasOwnProperty("cleaningMode")) {
    return res.status(400).json({ error: "'cleaningMode' is required." });
  }
  if (action !== null && !isValidAction(action)) {
    return res.status(400).json({ error: "Invalid 'action'. Must be 'turn_on' or 'turn_off'." });
  }
  if (cleaningMode !== null && !isValidCleaningMode(cleaningMode)) {
    return res.status(400).json({ error: "Invalid 'cleaningMode'. Must be 'standard', 'quiet', or 'turbo'." });
  }

  let currentState = await getRobotState();

  // Execute logic
  if (action !== null) {
    currentState.status = (action === 'turn_on') ? 'on' : 'off';
  }

  if (cleaningMode !== null) {
    currentState.cleaningMode = cleaningMode;
  }

  await setRobotState(currentState);

  res.json({
    message: "Robot Vacuum control successful!",
    robotVacuum: currentState
  });
});

// GET /robot/status
app.get('/robot/status', async (req, res) => {
  const state = await getRobotState();
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
      console.log(`🤖 Robot Vacuum microservice is running on port ${port}`);
    });

  } catch (err) {
    console.error("❌ Failed to start service due to Redis error:", err);
  }
}

startServer();