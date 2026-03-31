const express = require('express');
const redis = require('redis');
const app = express();

app.use(express.json());

// Default purifier state
const DEFAULT_PURIFIER_STATE = {
  status: 'off',             // "on" or "off"
  mode: 'manual',            // "manual" or "auto"
  fanSpeed: 'low',           // "low", "medium", "high"（manual 模式时有效）
};

const REDIS_KEY = 'airPurifierState';
let redisClient;

// Validation
function isValidAction(action) {
  return action === 'turn_on' || action === 'turn_off';
}

function isValidMode(mode) {
  return mode === 'manual' || mode === 'auto';
}

function isValidFanSpeed(fanSpeed) {
  return ['low', 'medium', 'high'].includes(fanSpeed);
}


// Load purifier state from Redis
async function getPurifierState() {
  const data = await redisClient.get(REDIS_KEY);
  return data ? JSON.parse(data) : { ...DEFAULT_PURIFIER_STATE };
}

// Save purifier state to Redis
async function setPurifierState(state) {
  await redisClient.set(REDIS_KEY, JSON.stringify(state));
}

const POLLUTION_SENSOR_KEY = 'pollution-sensor:currentPollution';

// Get Current Air Quality From Redis
async function getCurrentAirQuality() {
  const value = await redisClient.get(POLLUTION_SENSOR_KEY);
  return value !== null ? parseFloat(value) : 100; // 默认值 100
}

// POST /airpurifier/control
app.post('/airpurifier/control', async (req, res) => {
  const { action, mode, fanSpeed} = req.body;

  // Check parameters
  if (!req.body.hasOwnProperty("action")) {
    return res.status(400).json({ error: "'action' is required." });
  }
  if (!req.body.hasOwnProperty("mode")) {
    return res.status(400).json({ error: "'mode' is required." });
  }
  if (!req.body.hasOwnProperty("fanSpeed")) {
    return res.status(400).json({ error: "'fanSpeed' is required." });
  }

  //Validation (can be null)
  if (action !== null && !isValidAction(action)) {
    return res.status(400).json({ error: "Invalid 'action'. Must be 'turn_on' or 'turn_off'." });
  }
  if (mode !== null && !isValidMode(mode)) {
    return res.status(400).json({ error: "Invalid 'mode'. Must be 'manual' or 'auto'." });
  }
  if (fanSpeed !== null && !isValidFanSpeed(fanSpeed)) {
    return res.status(400).json({ error: "Invalid 'fanSpeed'. Must be 'low', 'medium', or 'high'." });
  }

  let currentState = await getPurifierState();
  const airQuality = await getCurrentAirQuality(); // ✅ get current Air Quality

  // update state
  currentState.status = (action === 'turn_on') ? 'on' : 'off';
  if (mode != null){// if mode is null, just not change
    currentState.mode = mode;
  }
  currentState.airQuality = airQuality;

  if (mode === 'manual') {
    if (fanSpeed != null){// if fanSpeed is null, just not change
      currentState.fanSpeed = fanSpeed;
    }
  } else if (mode === 'auto') {
    if (fanSpeed !== null) {
      // user enter specified fan speed
      currentState.fanSpeed = fanSpeed;
    } else {
      // user do not enter specified fan speed
      if (airQuality >= 150) {
        currentState.fanSpeed = 'high';
      } else if (airQuality >= 100) {
        currentState.fanSpeed = 'medium';
      } else {
        currentState.fanSpeed = 'low';
      }
    }
  }
  
  // set purifier state 
  await setPurifierState(currentState);

  res.json({
    message: "Air Purifier control successful!",
    airPurifier: currentState
  });
});

// GET /airpurifier/status
app.get('/airpurifier/status', async (req, res) => {
  const state = await getPurifierState();
  res.json({
    status: state.status,
    mode: state.mode,
    fanSpeed: state.fanSpeed
  });
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
      console.log(`🍃 Air Purifier microservice is running on port ${port}`);
    });

  } catch (err) {
    console.error("❌ Failed to start service due to Redis error:", err);
  }
}

startServer();