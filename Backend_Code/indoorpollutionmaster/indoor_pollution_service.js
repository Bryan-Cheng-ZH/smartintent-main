const express = require('express');
const axios = require('axios');
const { createClient } = require('redis');

const app = express();
app.use(express.json());

const REDIS_URL = 'redis://redis:6379';
const REDIS_KEY = 'indoor-pollution-sensor:currentPollution';

const DEFAULT_INDOOR_POLLUTION = 120;
const NATURAL_BASELINE = 80;

const PURIFIER_DECREASE_RATE = {
  low: 2.0,
  medium: 4.0,
  high: 6.0
};

let redisClient;

const purifierUrl = 'http://airpurifier-microservice.default/airpurifier/status';
const windowUrl = 'http://smart-window-microservice.default/window/status';
const outdoorPollutionUrl = 'http://outdoor-pollution-sensor.default/outdoor-pollution';

async function getCurrentPollution() {
  const value = await redisClient.get(REDIS_KEY);
  return value !== null ? parseFloat(value) : DEFAULT_INDOOR_POLLUTION;
}

async function setCurrentPollution(value) {
  await redisClient.set(REDIS_KEY, value.toFixed(1));
}

async function updateIndoorPollution() {
  try {
    let purifierState = { status: 'off', fanSpeed: 'low' };
    let windowState = { status: 'off', openPercentage: 0 };
    let outdoorPollution = NATURAL_BASELINE;

    try {
      const res = await axios.get(purifierUrl);
      purifierState = res.data;
    } catch (error) {
      console.log('[Indoor Pollution Sensor] Cannot fetch purifier status:', error.message);
    }

    try {
      const res = await axios.get(windowUrl);
      windowState = res.data;
    } catch (error) {
      console.log('[Indoor Pollution Sensor] Cannot fetch smart window status:', error.message);
    }

    try {
      const res = await axios.get(outdoorPollutionUrl);
      outdoorPollution = res.data.currentPollution;
    } catch (error) {
      console.log('[Indoor Pollution Sensor] Cannot fetch outdoor pollution:', error.message);
    }

    let currentPollution = await getCurrentPollution();

    if (purifierState.status === 'on') {
      const decrease = PURIFIER_DECREASE_RATE[purifierState.fanSpeed] || 0;
      currentPollution = Math.max(0, currentPollution - decrease);
    } else {
      if (currentPollution < NATURAL_BASELINE) {
        currentPollution += 1.0;
      } else if (currentPollution > NATURAL_BASELINE) {
        currentPollution -= 1.0;
      }
    }

    if (windowState.status === 'on') {
      const openRatio = (windowState.openPercentage || 0) / 100;
      const exchangeRate = 0.08 * openRatio;
      currentPollution = currentPollution + (outdoorPollution - currentPollution) * exchangeRate;
    }

    currentPollution = Math.min(Math.max(currentPollution, 0), 500);
    currentPollution = parseFloat(currentPollution.toFixed(1));

    await setCurrentPollution(currentPollution);

    console.log(`[Indoor Pollution Sensor] Updated: ${currentPollution} AQI`);
  } catch (err) {
    console.error('[Indoor Pollution Sensor] Update error:', err.message);
  }
}

app.get('/indoor-pollution', async (req, res) => {
  const pollution = await getCurrentPollution();

  res.json({
    currentPollution: pollution,
    unit: 'AQI',
    location: 'indoor'
  });
});

async function startServer() {
  try {
    redisClient = createClient({ url: REDIS_URL });
    await redisClient.connect();

    setInterval(updateIndoorPollution, 5000);

    const port = process.env.PORT || 3000;
    app.listen(port, () => {
      console.log(`Indoor pollution sensor microservice is running on port ${port}`);
    });
  } catch (err) {
    console.error('Failed to start indoor pollution sensor service:', err);
  }
}

startServer();
