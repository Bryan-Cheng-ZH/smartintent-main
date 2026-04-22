const express = require('express');
const { createClient } = require('redis');

const app = express();
app.use(express.json());

const REDIS_URL = 'redis://redis:6379';
const REDIS_KEY = 'outdoor-pollution-sensor:currentPollution';

const DEFAULT_OUTDOOR_POLLUTION = 90;
const MIN_POLLUTION = 20;
const MAX_POLLUTION = 220;

let redisClient;

async function getCurrentPollution() {
  const value = await redisClient.get(REDIS_KEY);
  return value !== null ? parseFloat(value) : DEFAULT_OUTDOOR_POLLUTION;
}

async function setCurrentPollution(value) {
  await redisClient.set(REDIS_KEY, value.toFixed(1));
}

async function updateOutdoorPollution() {
  try {
    let currentPollution = await getCurrentPollution();

    const randomChange = (Math.random() - 0.5) * 10;
    const baselinePull = (DEFAULT_OUTDOOR_POLLUTION - currentPollution) * 0.05;

    currentPollution = currentPollution + randomChange + baselinePull;
    currentPollution = Math.min(Math.max(currentPollution, MIN_POLLUTION), MAX_POLLUTION);
    currentPollution = parseFloat(currentPollution.toFixed(1));

    await setCurrentPollution(currentPollution);

    console.log(`[Outdoor Pollution Sensor] Updated: ${currentPollution} AQI`);
  } catch (err) {
    console.error('[Outdoor Pollution Sensor] Update error:', err.message);
  }
}

app.get('/outdoor-pollution', async (req, res) => {
  const pollution = await getCurrentPollution();

  res.json({
    currentPollution: pollution,
    unit: 'AQI',
    location: 'outdoor'
  });
});

async function startServer() {
  try {
    redisClient = createClient({ url: REDIS_URL });
    await redisClient.connect();

    setInterval(updateOutdoorPollution, 5000);

    const port = process.env.PORT || 3000;
    app.listen(port, () => {
      console.log(`Outdoor pollution sensor microservice is running on port ${port}`);
    });
  } catch (err) {
    console.error('Failed to start outdoor pollution sensor service:', err);
  }
}

startServer();
