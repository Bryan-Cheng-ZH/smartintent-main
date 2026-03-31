const express = require('express');
const axios = require('axios');
const { createClient } = require('redis');

const app = express();
app.use(express.json());

const REDIS_URL = 'redis://redis:6379';
const REDIS_KEY = 'pollution-sensor:currentPollution';

// default outdoor pollution is 150
const DEFAULT_OUTDOOR_POLLUTION = 150;

// air pollution decrease rate
const POLLUTION_DECREASE_RATE = {
  low: 2.0,
  medium: 4.0,
  high: 6.0
};

let redisClient;
let updateInterval;

const purifierUrl = 'http://airpurifier-microservice.default/airpurifier/status';

// Read current pollution form Redis
async function getCurrentPollution() {
  const value = await redisClient.get(REDIS_KEY);
  return value !== null ? parseFloat(value) : DEFAULT_OUTDOOR_POLLUTION;
}

// Save pollution to Redis
async function setCurrentPollution(value) {
  await redisClient.set(REDIS_KEY, value.toFixed(1));
}

// update pollution every 5 seconds
async function updatePollution() {
  try {
    let purifierState = { status: 'off', fanSpeed: 'low' };

    try {
      const res = await axios.get(purifierUrl);
      purifierState = res.data;
    } catch (error) {
      console.log('[Pollution Sensor] Cannot fetch purifier status:', error.message);
    }

    let currentPollution = await getCurrentPollution();

    if (purifierState.status === 'on') {
      const decrease = POLLUTION_DECREASE_RATE[purifierState.fanSpeed] || 0;
      currentPollution = Math.max(0, currentPollution - decrease);
      console.log(`[Pollution Sensor] Purifier ON - FanSpeed: ${purifierState.fanSpeed}, Decreased by: ${decrease}`);
    } else {
      // airpurifier is off
      if (currentPollution < DEFAULT_OUTDOOR_POLLUTION) {
        currentPollution += 3.0; 
      } else if (currentPollution > DEFAULT_OUTDOOR_POLLUTION) {
        currentPollution -= 3.0; 
      }
    }

    // range in 0 ~ 500
    currentPollution = Math.min(Math.max(currentPollution, 0), 500);
    currentPollution = parseFloat(currentPollution.toFixed(1));

    await setCurrentPollution(currentPollution);

    console.log(`🌫️ Updated pollution level: ${currentPollution}`);
  } catch (err) {
    console.error('[Pollution Sensor] Update error:', err.message);
  }
}

// GET /pollution
app.get('/pollution', async (req, res) => {
  const pollution = await getCurrentPollution();
  res.json({ currentPollution: pollution });
});

// Start server after Redis is ready
async function startServer() {
  try {
    redisClient = createClient({ url: REDIS_URL });

    console.log("⏳ Connecting to Redis...");
    await redisClient.connect();
    console.log("✅ Connected to Redis");

    // Start periodic update
    updateInterval = setInterval(updatePollution, 5000);

    const port = process.env.PORT || 3000;
    app.listen(port, () => {
      console.log(`🌫️ Pollution sensor microservice is running on port ${port}`);
    });
  } catch (err) {
    console.error("❌ Failed to connect to Redis:", err);
  }
}

startServer();