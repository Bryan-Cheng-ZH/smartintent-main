const express = require('express');
const redis = require('redis');
const app = express();

app.use(express.json());

const DEFAULT_WINDOW_STATE = {
  status: 'off',
  openPercentage: 0,
  lockStatus: 'unlocked'
};

const REDIS_KEY = 'smartWindowState';
let redisClient;

function isValidAction(action) {
  return action === 'turn_on' || action === 'turn_off';
}

function isValidOpenPercentage(value) {
  return Number.isInteger(value) && value >= 0 && value <= 100;
}

function isValidLockStatus(value) {
  return value === 'locked' || value === 'unlocked';
}

async function getWindowState() {
  const data = await redisClient.get(REDIS_KEY);
  return data ? JSON.parse(data) : { ...DEFAULT_WINDOW_STATE };
}

async function setWindowState(state) {
  await redisClient.set(REDIS_KEY, JSON.stringify(state));
}

app.post('/window/control', async (req, res) => {
  const { action, openPercentage, lockStatus } = req.body;

  if (!req.body.hasOwnProperty('action')) {
    return res.status(400).json({ error: "'action' is required." });
  }
  if (!req.body.hasOwnProperty('openPercentage')) {
    return res.status(400).json({ error: "'openPercentage' is required." });
  }
  if (!req.body.hasOwnProperty('lockStatus')) {
    return res.status(400).json({ error: "'lockStatus' is required." });
  }

  if (action !== null && !isValidAction(action)) {
    return res.status(400).json({ error: "Invalid 'action'. Must be 'turn_on' or 'turn_off'." });
  }
  if (openPercentage !== null && !isValidOpenPercentage(openPercentage)) {
    return res.status(400).json({ error: "Invalid 'openPercentage'. Must be an integer between 0 and 100." });
  }
  if (lockStatus !== null && !isValidLockStatus(lockStatus)) {
    return res.status(400).json({ error: "Invalid 'lockStatus'. Must be 'locked' or 'unlocked'." });
  }

  const state = await getWindowState();

  if (lockStatus !== null) {
    state.lockStatus = lockStatus;
  }

  if (state.lockStatus === 'locked' && action === 'turn_on') {
    return res.status(400).json({ error: "Window is locked. Unlock it before opening." });
  }

  if (action !== null) {
    state.status = action === 'turn_on' ? 'on' : 'off';
  }

  if (state.status === 'on') {
    if (openPercentage !== null) {
      state.openPercentage = openPercentage;
    } else if (state.openPercentage === 0) {
      state.openPercentage = 100;
    }
  } else {
    state.openPercentage = 0;
  }

  await setWindowState(state);

  res.json({
    message: "Smart Window control successful!",
    smartWindow: state
  });
});

app.get('/window/status', async (req, res) => {
  const state = await getWindowState();
  res.json(state);
});

async function startServer() {
  try {
    redisClient = redis.createClient({ url: 'redis://redis:6379' });
    await redisClient.connect();

    const port = process.env.PORT || 3000;
    app.listen(port, () => {
      console.log(`Smart Window microservice is running on port ${port}`);
    });
  } catch (err) {
    console.error("Failed to start smart window service:", err);
  }
}

startServer();

