const express = require('express');
const axios = require('axios');
const app = express();

// Define URLs of all microservices' status APIs
const services = {
  temperatureSensor: "http://temperature-sensor.default/temperature",
  airConditioner:    "http://airconditioner-microservice.default/ac/status",
  humidifier:        "http://humidifier-microservice.default/humidifier/status",
  humiditySensor:    "http://humidity-sensor.default/humidity",
  light:             "http://light-microservice.default/light/status",
  tv:                "http://tv-microservice.default/tv/status",

  coffeeMachine:     "http://coffee-machine-microservice.default/coffee/status",
  smartCurtains:     "http://smart-curtains-microservice.default/curtains/status",
  robotVacuum:       "http://robot-vacuum-microservice.default/robot/status",
  airPurifier:       "http://airpurifier-microservice.default/airpurifier/status",
  pollutionSensor:   "http://pollution-sensor.default/pollution"
};

// Define GET /all-status endpoint to aggregate all service states
app.get('/all-status', async (req, res) => {
  try {
    // Request all services in parallel
    const results = await Promise.all(
      Object.entries(services).map(async ([key, url]) => {
        try {
          const response = await axios.get(url);
          return { [key]: response.data };
        } catch (error) {
          return { [key]: { error: error.message } };
        }
      })
    );

    // Merge all results into one object
    const aggregated = Object.assign({}, ...results);
    res.json(aggregated);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to aggregate status',
      details: error.message
    });
  }
});

// Start aggregator server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Aggregator microservice is running on port ${port}`);
});