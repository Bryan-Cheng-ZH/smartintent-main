const express = require('express');
const redis = require('redis');
const app = express();

app.use(express.json());

const DEFAULT_WATER_HEATER_STATE = {
  status: 'off',
  mode: 'keep_warm',
  temperature: 45
};

const REDIS_KEY = 'waterHeaterState';
let redisClient;

function isValidAction(action) {
  return action === 'turn_on' || action === 'turn_off';
}

function isValidMode(mode) {
  return mode === 'heating' || mode === 'keep_warm';
}

function isValidTemperature(temperature) {
  return Number.isInteger(temperature) && temperature >= 35 && temperature <= 75;
}

async function getWaterHeaterState() {
  const data = await redisClient.get(REDIS_KEY);
  return data ? JSON.parse(data) : { ...DEFAULT_WATER_HEATER_STATE };
}

async function setWaterHeaterState(state) {
  await redisClient.set(REDIS_KEY, JSON.stringify(state));
}

app.post('/water-heater/control', async (req, res) => {
  const { action, mode, temperature } = req.body;

  if (!req.body.hasOwnProperty('action')) {
    return res.status(400).json({ error: "'action' is required." });
  }
  if (!req.body.hasOwnProperty('mode')) {
    return res.status(400).json({ error: "'mode' is required." });
  }
  if (!req.body.hasOwnProperty('temperature')) {
    return res.status(400).json({ error: "'temperature' is required." });
  }

  if (action !== null && !isValidAction(action)) {
    return res.status(400).json({ error: "Invalid 'action'. Must be 'turn_on' or 'turn_off'." });
  }
  if (mode !== null && !isValidMode(mode)) {
    return res.status(400).json({ error: "Invalid 'mode'. Must be 'heating' or 'keep_warm'." });
  }
  if (temperature !== null && !isValidTemperature(temperature)) {
    return res.status(400).json({ error: "Invalid 'temperature'. Must be an integer between 35 and 75." });
  }

  const state = await getWaterHeaterState();

  if (action !== null) {
    state.status = action === 'turn_on' ? 'on' : 'off';
  }

  if (mode !== null) {
    state.mode = mode;
  }

  if (temperature !== null) {
    state.temperature = temperature;
  }

  await setWaterHeaterState(state);

  res.json({
    message: "Water Heater control successful!",
    waterHeater: state
  });
});

app.get('/water-heater/status', async (req, res) => {
  const state = await getWaterHeaterState();
  res.json(state);
});

async function startServer() {
  try {
    redisClient = redis.createClient({ url: 'redis://redis:6379' });
    await redisClient.connect();

    const port = process.env.PORT || 3000;
    app.listen(port, () => {
      console.log(`Water Heater microservice is running on port ${port}`);
    });
  } catch (err) {
    console.error("Failed to start water heater service:", err);
  }
}

startServer();
