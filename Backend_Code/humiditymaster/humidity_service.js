const express = require('express');
const axios = require('axios');
const { createClient } = require('redis');

const app = express();
app.use(express.json());

const REDIS_URL = 'redis://redis:6379';
const REDIS_KEY = 'humidity-sensor:currentHumidity';
const DEFAULT_OUTDOOR_HUMIDITY = 40;
const HUMIDITY_INCREASE_RATE = {
  1: 0.5,
  2: 1.0,
  3: 3.0,
  4: 4.0,
  5: 5.0
};

let redisClient;
let updateInterval;

const humidifierUrl = 'http://humidifier-microservice.default/humidifier/status';

// Read from Redis or use default
async function getCurrentHumidity() {
  const value = await redisClient.get(REDIS_KEY);
  return value !== null ? parseFloat(value) : 30;
}

// Save to Redis
async function setCurrentHumidity(value) {
  await redisClient.set(REDIS_KEY, value.toFixed(1));
}

// Update logic
async function updateHumidity() {
  try {
    let humidifierState = { status: 'off', level: 1 };

    try {
      const res = await axios.get(humidifierUrl);
      humidifierState = res.data;
    } catch (error) {
      console.log('[Humidity Sensor] Cannot fetch humidifier status:', error.message);
    }

    let currentHumidity = await getCurrentHumidity();

    if (humidifierState.status === 'on') {
      const increase = HUMIDITY_INCREASE_RATE[humidifierState.level] || 0;
      currentHumidity = Math.min(100, currentHumidity + increase);
    } else {
      if (currentHumidity < DEFAULT_OUTDOOR_HUMIDITY) {
        currentHumidity += 2.0;
      } else if (currentHumidity > DEFAULT_OUTDOOR_HUMIDITY) {
        currentHumidity -= 2.0;
      }
    }

    currentHumidity = parseFloat(currentHumidity.toFixed(1));
    await setCurrentHumidity(currentHumidity);

    console.log(`💧 Updated humidity: ${currentHumidity}%`);
  } catch (err) {
    console.error('[Humidity Sensor] Update error:', err.message);
  }
}

// HTTP GET
app.get('/humidity', async (req, res) => {
  const humidity = await getCurrentHumidity();
  res.json({ currentHumidity: humidity });
});

// Start server after Redis is ready
async function startServer() {
  try {
    redisClient = createClient({ url: REDIS_URL });

    console.log("⏳ Connecting to Redis...");
    await redisClient.connect();
    console.log("✅ Connected to Redis");

    // Start periodic update
    updateInterval = setInterval(updateHumidity, 5000);

    // Start HTTP server
    const port = process.env.PORT || 3000;
    app.listen(port, () => {
      console.log(`💧 Humidity sensor microservice is running on port ${port}`);
    });

  } catch (err) {
    console.error("❌ Failed to connect to Redis:", err);
  }
}

startServer();