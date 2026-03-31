const express = require('express');
const redis = require('redis');
const app = express();

app.use(express.json());

// Default Coffee State
const DEFAULT_COFFEE_STATE = {
  status: 'off',          // "on" or "off"
  brewMode: 'Espresso'    // "Espresso", "Latte", "Americano"
};

const REDIS_KEY = 'coffeeMachineState';
let redisClient;
let autoOffTimer = null;

// Validation
function isValidAction(action) {
  return action === 'turn_on' || action === 'turn_off';
}

function isValidBrewMode(mode) {
  return ['Espresso', 'Latte', 'Americano'].includes(mode);
}

// Load Coffee Machine state from Redis
async function getCoffeeMachineState() {
  const data = await redisClient.get(REDIS_KEY);
  return data ? JSON.parse(data) : { ...DEFAULT_COFFEE_STATE };
}

// Save Coffee Machine state to Redis
async function setCoffeeMachineState(state) {
  await redisClient.set(REDIS_KEY, JSON.stringify(state));
}


// POST /coffee/control
app.post('/coffee/control', async (req, res) => {
  const { action, brewMode } = req.body;

  // Check parameters
  if (!req.body.hasOwnProperty("action")) {
    return res.status(400).json({ error: "'action' is required." });
  }
  if (!req.body.hasOwnProperty("brewMode")) {
    return res.status(400).json({ error: "'brewMode' is required." });
  }

  // Check validation (parameters is required and can be null.)
  if (action !== null && !isValidAction(action)) {
    return res.status(400).json({ error: "Invalid 'action'. Must be 'turn_on' or 'turn_off'." });
  }
  if (brewMode !== null && !isValidBrewMode(brewMode)) {
    return res.status(400).json({ error: "Invalid 'brewMode'. Must be 'Espresso', 'Latte', or 'Americano'." });
  }

  let currentState = await getCoffeeMachineState();

  if (action === 'turn_on') {
    currentState.status = 'on';
    if (brewMode != null){ // if brewMode is null, just stay not changed. 
      currentState.brewMode = brewMode;
    }
    console.log(`☕️ Coffee Machine turned on with brewMode: ${currentState.brewMode}`);
  } else if (action === 'turn_off') {
    currentState.status = 'off';
    // do not mind the brewMode
    console.log("☕️ Coffee Machine turned off manually");
  }

  

  await setCoffeeMachineState(currentState);

  res.json({
    message: "Coffee Machine control successful!",
    coffeeMachine: currentState
  });
});

// GET /coffee/status
app.get('/coffee/status', async (req, res) => {
  const state = await getCoffeeMachineState();
  res.json(state);
});

// Start server only after Redis is connected
async function startServer() {
  try {
    redisClient = redis.createClient({ url: 'redis://redis:6379' });

    console.log("⏳ Connecting to Redis...");
    await redisClient.connect();
    console.log("✅ Connected to Redis");

    const port = process.env.PORT || 3000;
    app.listen(port, () => {
      console.log(`☕️ Coffee Machine microservice is running on port ${port}`);
    });

  } catch (err) {
    console.error("❌ Failed to start service due to Redis error:", err);
  }
}

startServer();