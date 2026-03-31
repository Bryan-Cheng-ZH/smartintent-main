const express = require('express');
const axios = require('axios');
const redis = require('redis');
const app = express();

app.use(express.json());

// Constants
const REDIS_URL = "redis://redis:6379";
const REDIS_KEY = "temperature_sensor:currentTemperature";

const DEFAULT_TEMPERATURE = 25;
const DEFAULT_OUTDOOR_TEMP = 30;
const COOLING_RATE = 0.5;
const HEATING_RATE = 0.5;

let redisClient;
let currentTemperature = DEFAULT_TEMPERATURE;

// GET latest temperature from Redis
async function getTemperature() {
  const value = await redisClient.get(REDIS_KEY);
  return value ? parseFloat(value) : DEFAULT_TEMPERATURE;
}

// SET updated temperature to Redis
async function setTemperature(value) {
  await redisClient.set(REDIS_KEY, value);
}

// Periodically simulate environment
async function startTemperatureSimulation() {
  setInterval(async () => {
    try {
      const acUrl = 'http://airconditioner-microservice.default/ac/status';
      let acState = { status: 'off', temperature: 24 };

      try {
        const res = await axios.get(acUrl);
        acState = res.data;
      } catch (err) {
        console.log("⚠️ Cannot fetch AC status:", err.message);
      }

      // Adjust temperature
      if (acState.status === 'on') {
        if (acState.temperature < currentTemperature) {
          currentTemperature = Math.max(acState.temperature, currentTemperature - COOLING_RATE);
        } else if (acState.temperature > currentTemperature) {
          currentTemperature = Math.min(acState.temperature, currentTemperature + HEATING_RATE);
        }
      } else {
        // Drift toward outdoor temperature
        if (currentTemperature < DEFAULT_OUTDOOR_TEMP) {
          currentTemperature += 0.2;
        } else if (currentTemperature > DEFAULT_OUTDOOR_TEMP) {
          currentTemperature -= 0.2;
        }
      }

      currentTemperature = parseFloat(currentTemperature.toFixed(1));
      await setTemperature(currentTemperature);
      console.log(`🌡️ Updated temperature: ${currentTemperature}°C`);
    } catch (err) {
      console.error("❌ Error in simulation loop:", err.message);
    }
  }, 10000);
}

// GET /temperature
app.get('/temperature', async (req, res) => {
  try {
    const temp = await getTemperature();
    res.json({ currentTemperature: temp });
  } catch (err) {
    res.status(500).json({ error: "Failed to retrieve temperature" });
  }
});

// Start server only after Redis is ready
async function startServer() {
  try {
    redisClient = redis.createClient({ url: REDIS_URL });

    console.log("⏳ Connecting to Redis...");
    await redisClient.connect();
    console.log("✅ Connected to Redis");

    const cached = await redisClient.get(REDIS_KEY);
    if (cached) {
      currentTemperature = parseFloat(cached);
      console.log(`🔄 Restored temperature: ${currentTemperature}°C`);
    } else {
      console.log(`ℹ️ No Redis value found, using default: ${currentTemperature}°C`);
    }

    await startTemperatureSimulation();

    const port = process.env.PORT || 3000;
    app.listen(port, () => {
      console.log(`🌡️ Temperature sensor microservice running on port ${port}`);
    });
  } catch (err) {
    console.error("❌ Failed to start service due to Redis error:", err);
  }
}

startServer();