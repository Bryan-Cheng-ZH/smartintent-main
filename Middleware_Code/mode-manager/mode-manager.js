// mode-manager.js
const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');
const app = express();

app.use(express.json());

// ✅ Dispatcher workflow endpoint
const DISPATCHER_URL = 'http://dispatcher.default/workflow';

// ✅ MongoDB Schema for automation modes
const modeSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true }, // Mode name (e.g., "Home Mode")
  actions: [ // List of device control actions
    {
      deviceId: { type: String, required: true },
      action: { type: String, required: true },
      parameters: { type: Object, default: {} }
    }
  ],
  createdAt: { type: Date, default: Date.now }
});

const Mode = mongoose.model('Mode', modeSchema);

////////////////////////////////////////////////////////
// 👉 Add a new mode
app.post('/modes', async (req, res) => {
  const { name, actions } = req.body;

  if (!name || !Array.isArray(actions)) {
    return res.status(400).json({ error: "Mode name and action list are required." });
  }

  const exists = await Mode.findOne({ name });
  if (exists) {
    return res.status(400).json({ error: `Mode '${name}' already exists.` });
  }

  const mode = new Mode({ name, actions });
  await mode.save();
  res.status(201).json({ message: `Mode '${name}' has been created.`, mode });
});

////////////////////////////////////////////////////////
// 👉 Get all mode names
app.get('/modes', async (req, res) => {
  const modes = await Mode.find({}, 'name');
  res.json(modes);
});

////////////////////////////////////////////////////////
// 👉 Get mode details by name
app.get('/modes/:name', async (req, res) => {
  const name = req.params.name;
  const mode = await Mode.findOne({ name });
  if (!mode) return res.status(404).json({ error: `Mode '${name}' not found.` });
  res.json(mode);
});

////////////////////////////////////////////////////////
// 👉 Delete a mode by name
app.delete('/modes/:name', async (req, res) => {
  const name = req.params.name;
  const result = await Mode.findOneAndDelete({ name });
  if (!result) return res.status(404).json({ error: `Mode '${name}' does not exist.` });
  res.json({ message: `Mode '${name}' has been deleted.` });
});

////////////////////////////////////////////////////////
// 👉 Execute a mode (send workflow to dispatcher)
app.post('/modes/:name/execute', async (req, res) => {
  const name = req.params.name;
  const mode = await Mode.findOne({ name });
  if (!mode) return res.status(404).json({ error: `Mode '${name}' not found.` });

  const workflow = { workflow: mode.actions };

  try {
    const resp = await axios.post(DISPATCHER_URL, workflow);
    res.json({
      message: `Mode '${name}' executed successfully.`,
      dispatcherResponse: resp.data
    });
  } catch (err) {
    res.status(500).json({ error: `Failed to call dispatcher: ${err.message}` });
  }
});

////////////////////////////////////////////////////////
// ✅ Start the service and connect to MongoDB
async function startServer() {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://mongo:27017/modemanager';
    console.log("⏳ Connecting to MongoDB (modemanager)...");
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log("✅ Connected to MongoDB (modemanager)");

    const port = process.env.PORT || 3002;
    app.listen(port, () => {
      console.log(`📡 Mode Manager is running on port ${port}`);
    });
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err);
  }
}

startServer();