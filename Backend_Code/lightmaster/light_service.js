const express = require('express');
const redis = require('redis');
const app = express();

app.use(express.json());

// Default light state
const DEFAULT_LIGHT_STATE = {
  status: 'off',
  brightness: 1
};

const REDIS_KEY = 'light_state';
let redisClient;

// Validation
function isValidAction(action) {
  return action === 'turn_on' || action === 'turn_off';
}

function isValidBrightness(brightness) {
  return Number.isInteger(brightness) && brightness >= 1 && brightness <= 5;
}

// Load state from Redis or return default
async function getLightState() {
  const data = await redisClient.get(REDIS_KEY);
  return data ? JSON.parse(data) : { ...DEFAULT_LIGHT_STATE };
}

// Save current state to Redis
async function setLightState(state) {
  await redisClient.set(REDIS_KEY, JSON.stringify(state));
}

// POST /light/control
app.post('/light/control', async (req, res) => {
  const { action, brightness } = req.body;

  if (!req.body.hasOwnProperty("action")) {
    return res.status(400).json({ error: "'action' is required." });
  }
  if (!req.body.hasOwnProperty("brightness")) {
    return res.status(400).json({ error: "'brightness' is required." });
  }

  if (action !== null && !isValidAction(action)) {
    return res.status(400).json({ error: "Invalid 'action'. Must be 'turn_on' or 'turn_off'." });
  }

  if (brightness !== null && !isValidBrightness(brightness)) {
    return res.status(400).json({ error: "Invalid 'brightness'. Must be an integer between 1 and 5." });
  }

  let state = await getLightState();

  if (action !== null) state.status = action === 'turn_on' ? 'on' : 'off';
  if (brightness !== null) state.brightness = brightness;

  await setLightState(state);

  res.json({
    message: "Light control successful :)",
    light: state
  });
});

// GET /light/status
app.get('/light/status', async (req, res) => {
  const state = await getLightState();
  res.json(state);
});

// ✅ Start server after Redis is connected
async function startServer() {
  try {
    redisClient = redis.createClient({ url: 'redis://redis:6379' });

    console.log("⏳ Connecting to Redis...");
    await redisClient.connect();
    console.log("✅ Connected to Redis");

    const port = process.env.PORT || 3000;
    app.listen(port, () => {
      console.log(`💡 Light microservice is running on port ${port}`);
    });

  } catch (err) {
    console.error("❌ Failed to start service due to Redis error:", err);
  }
}

startServer();