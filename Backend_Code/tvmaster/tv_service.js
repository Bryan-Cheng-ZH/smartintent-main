const express = require('express');
const redis = require('redis');
const app = express();

app.use(express.json());

// Default TV state
const DEFAULT_TV_STATE = {
  status: 'off',
  channel: 1,
  volume: 10
};

const REDIS_KEY = 'tvState';
let redisClient;

// Validation
function isValidAction(action) {
  return action === 'turn_on' || action === 'turn_off';
}

function isValidChannel(channel) {
  return Number.isInteger(channel) && channel >= 1 && channel <= 20;
}

function isValidVolume(volume) {
  return Number.isInteger(volume) && volume >= 0 && volume <= 100;
}

// Load TV state from Redis
async function getTvState() {
  const data = await redisClient.get(REDIS_KEY);
  return data ? JSON.parse(data) : { ...DEFAULT_TV_STATE };
}

// Save TV state to Redis
async function setTvState(state) {
  await redisClient.set(REDIS_KEY, JSON.stringify(state));
}

// POST /tv/control
app.post('/tv/control', async (req, res) => {
  const { action, channel, volume } = req.body;

  if (!req.body.hasOwnProperty("action")) {
    return res.status(400).json({ error: "'action' is required." });
  }
  if (!req.body.hasOwnProperty("channel")) {
    return res.status(400).json({ error: "'channel' is required." });
  }
  if (!req.body.hasOwnProperty("volume")) {
    return res.status(400).json({ error: "'volume' is required." });
  }

  if (action !== null && !isValidAction(action)) {
    return res.status(400).json({ error: "Invalid 'action'. Must be 'turn_on' or 'turn_off'." });
  }
  if (channel !== null && !isValidChannel(channel)) {
    return res.status(400).json({ error: "Invalid 'channel'. Must be an integer between 1 and 20." });
  }
  if (volume !== null && !isValidVolume(volume)) {
    return res.status(400).json({ error: "Invalid 'volume'. Must be an integer between 0 and 100." });
  }

  let currentState = await getTvState();

  if (action !== null) currentState.status = action === 'turn_on' ? 'on' : 'off';
  if (channel !== null) currentState.channel = channel;
  if (volume !== null) currentState.volume = volume;

  await setTvState(currentState);

  res.json({
    message: "TV Control Successful :)",
    tv: currentState
  });
});

// GET /tv/status
app.get('/tv/status', async (req, res) => {
  const state = await getTvState();
  res.json(state);
});

// ✅ Start server only after Redis is connected
async function startServer() {
  try {
    redisClient = redis.createClient({ url: 'redis://redis:6379' });

    console.log("⏳ Connecting to Redis...");
    await redisClient.connect();
    console.log("✅ Connected to Redis");

    const port = process.env.PORT || 3000;
    app.listen(port, () => {
      console.log(`📺 TV microservice is running on port ${port}`);
    });

  } catch (err) {
    console.error("❌ Failed to start service due to Redis error:", err);
  }
}

startServer();