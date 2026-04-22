const express = require('express');
const axios = require('axios');
const { createClient } = require('redis');

const app = express();
app.use(express.json());

const REDIS_URL = 'redis://redis:6379';
const REDIS_KEY = 'noise-sensor:currentNoise';

const DEFAULT_INDOOR_NOISE = 35;
const DEFAULT_WINDOW_NOISE = 70;

let redisClient;

const smartWindowUrl = 'http://smart-window-microservice.default/window/status';

async function getCurrentNoise() {
  const value = await redisClient.get(REDIS_KEY);
  return value !== null ? parseFloat(value) : DEFAULT_INDOOR_NOISE;
}

async function setCurrentNoise(value) {
  await redisClient.set(REDIS_KEY, value.toFixed(1));
}

async function updateNoise() {
  try {
    let windowState = { status: 'off', openPercentage: 0 };

    try {
      const res = await axios.get(smartWindowUrl);
      windowState = res.data;
    } catch (error) {
      console.log('[Window Noise Sensor] Cannot fetch smart window status:', error.message);
    }

    let currentNoise = await getCurrentNoise();

    if (windowState.status === 'on') {
      const openRatio = (windowState.openPercentage || 0) / 100;
      const targetNoise = DEFAULT_INDOOR_NOISE + (DEFAULT_WINDOW_NOISE - DEFAULT_INDOOR_NOISE) * openRatio;

      if (currentNoise < targetNoise) {
        currentNoise = Math.min(targetNoise, currentNoise + 3.0);
      } else if (currentNoise > targetNoise) {
        currentNoise = Math.max(targetNoise, currentNoise - 3.0);
      }
    } else {
      if (currentNoise > DEFAULT_INDOOR_NOISE) {
        currentNoise -= 2.0;
      } else if (currentNoise < DEFAULT_INDOOR_NOISE) {
        currentNoise += 2.0;
      }
    }

    currentNoise = Math.min(Math.max(currentNoise, 20), 100);
    currentNoise = parseFloat(currentNoise.toFixed(1));

    await setCurrentNoise(currentNoise);
    console.log(`[Window Noise Sensor] Noise updated: ${currentNoise} dB`);
  } catch (err) {
    console.error('[Window Noise Sensor] Update error:', err.message);
  }
}

app.get('/noise', async (req, res) => {
  const noise = await getCurrentNoise();

  res.json({
    currentNoise: noise,
    unit: 'dB',
    location: 'window'
  });
});

async function startServer() {
  try {
    redisClient = createClient({ url: REDIS_URL });
    await redisClient.connect();

    setInterval(updateNoise, 5000);

    const port = process.env.PORT || 3000;
    app.listen(port, () => {
      console.log(`Window noise sensor microservice is running on port ${port}`);
    });
  } catch (err) {
    console.error("Failed to start window noise sensor service:", err);
  }
}

startServer();
