const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

const DEVICE_URLS = {
  "ac": "http://airconditioner-microservice.default/ac/control",
  "light": "http://light-microservice.default/light/control",
  "tv": "http://tv-microservice.default/tv/control",
  "humidifier": "http://humidifier-microservice.default/humidifier/control",
  "coffeeMachine": "http://coffee-machine-microservice.default/coffee/control",
  "smartCurtains": "http://smart-curtains-microservice.default/curtains/control",
  "robotVacuum": "http://robot-vacuum-microservice.default/robot/control",
  "airPurifier": "http://airpurifier-microservice.default/airpurifier/control"
};

// Define POST /dispatch
app.post('/dispatch', async (req, res) => {
  const { deviceId, action, parameters = {}} = req.body;
  if (!deviceId || !DEVICE_URLS[deviceId]) { 
    return res.status(400).json({ error: "Invalid deviceId" }); // LLM generates invalid Device ID
  }

  const targetUrl = DEVICE_URLS[deviceId];
  const payload = {
    deviceId,
    action,
    ...parameters
  };

  try {
    const response = await axios.post(targetUrl, payload, {
      timeout: 5000
    });
    res.json({
      success: true,
      request: payload, // will return original Request
      response: response.data // will return "Successful" message + device's current state
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
      request: payload
    });
  }
});

// 新增：执行模式的多个指令
app.post('/workflow', async (req, res) => {
  const { workflow } = req.body;
  if (!Array.isArray(workflow)) {
    return res.status(400).json({ error: "workflow must be an array of actions" });
  }

  const results = [];

  for (const step of workflow) {
    const { deviceId, action,  parameters = {} } = step;
    const url = DEVICE_URLS[deviceId];
    if (!url) {
      results.push({ deviceId, success: false, error: "Invalid deviceId" });
      continue;
    }

    try {
      const payload = { deviceId, action, ...parameters };
      const response = await axios.post(url, payload);
      results.push({ deviceId, success: true, response: response.data });
    } catch (err) {
      results.push({ deviceId, success: false, error: err.message });
    }
  }

  res.json({ message: "Mode Executed Successfully!", results });
});

// Start Service
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Dispatcher service running on port ${port}`);
});