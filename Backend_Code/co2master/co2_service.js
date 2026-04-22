const express = require('express');
const axios = require('axios');
const { createClient } = require('redis');

const app = express();
app.use(express.json());

const REDIS_URL = 'redis://redis:6379';
const REDIS_KEY = 'co2-sensor:currentCO2';

const DEFAULT_CO2 = 800;
const OUTDOOR_CO2 = 420;
const MAX_CO2 = 5000;

let redisClient;

const windowUrl = 'http://smart-window-microservice.default/window/status';

async function getCurrentCO2() {
  const value = await redisClient.get(REDIS_KEY);
  return value !== null ? parseFloat(value) : DEFAULT_CO2;
}

async function setCurrentCO2(value) {
  await redisClient.set(REDIS_KEY, value.toFixed(0));
}

async function updateCO2() {
  try {
    let windowState = { status: 'off', openPercentage: 0 };
    let currentCO2 = await getCurrentCO2();

    try {
      const res = await axios.get(windowUrl);
      windowState = res.data;
    } catch (error) {
      console.log('[CO2 Sensor] Cannot fetch smart window status:', error.message);
    }

    if (windowState.status === 'on') {
      const openRatio = (windowState.openPercentage || 0) / 100;
      const ventilationRate = 0.12 * openRatio;
      currentCO2 = currentCO2 + (OUTDOOR_CO2 - currentCO2) * ventilationRate;
    } else {
      currentCO2 += 35;
    }

    currentCO2 = Math.min(Math.max(currentCO2, OUTDOOR_CO2), MAX_CO2);
    currentCO2 = Math.round(currentCO2);

    await setCurrentCO2(currentCO2);

    console.log(`[CO2 Sensor] Updated: ${currentCO2} ppm`);
  } catch (err) {
    console.error('[CO2 Sensor] Update error:', err.message);
  }
}

app.get('/co2', async (req, res) => {
  const co2 = await getCurrentCO2();

  res.json({
    currentCO2: co2,
    unit: 'ppm',
    location: 'indoor'
  });
});

async function startServer() {
  try {
    redisClient = createClient({ url: REDIS_URL });
    await redisClient.connect();

    setInterval(updateCO2, 5000);

    const port = process.env.PORT || 3000;
    app.listen(port, () => {
      console.log(`CO2 sensor microservice is running on port ${port}`);
    });
  } catch (err) {
    console.error('Failed to start CO2 sensor service:', err);
  }
}

startServer();
