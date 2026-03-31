// rule-engine.js - MongoDB 版
const express = require('express');
const axios = require('axios');
const mongoose = require('mongoose');
const app = express();

app.use(express.json());

const POLL_INTERVAL = 10000;
const AGGREGATOR_URL = 'http://aggregator.default/all-status';
const DISPATCHER_URL = 'http://dispatcher.default/dispatch';

// MongoDB Rule Schema
const ruleSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  trigger: {
    sensor: String,
    operator: String,
    value: Number
  },
  action: {
    deviceId: String,
    action: String,
    parameters: Object
  },
  active: Boolean
});

const Rule = mongoose.model('Rule', ruleSchema);

// 判断是否触发
function isTriggered(trigger, currentState) {
    let sensorValue = null;
    const sensor = trigger.sensor;
  
    if (currentState[sensor] && typeof currentState[sensor] === 'object') {
      // 自动尝试从嵌套结构中提取单一数值
      const values = Object.values(currentState[sensor]);
      const firstNumeric = values.find(v => typeof v === 'number');
      sensorValue = firstNumeric;
    } else {
      sensorValue = currentState[sensor];
    }
  
    if (sensorValue == null || typeof sensorValue !== 'number') return false;
  
    switch (trigger.operator) {
      case '>': return sensorValue > trigger.value;
      case '>=': return sensorValue >= trigger.value;
      case '<': return sensorValue < trigger.value;
      case '<=': return sensorValue <= trigger.value;
      case '==': return sensorValue === trigger.value;
      case '!=': return sensorValue !== trigger.value;
      default: return false;
    }
}

// 🧠 定时检查规则
async function checkRulesAndExecute() {
  try {
    console.log("🔄 Calling aggregator status...");
    const aggResp = await axios.get(AGGREGATOR_URL);
    const currentState = aggResp.data;

    const rules = await Rule.find({ active: true });
    for (const rule of rules) {
      if (isTriggered(rule.trigger, currentState)) {
        console.log(`✅ Rule Triggered：${rule.id}`);
        const dispatchResp = await axios.post(DISPATCHER_URL, rule.action);
        console.log(`🚀 Executed Scucessfully:`, dispatchResp.data);
      } else {
        console.log(`⏸️ Rule is not met：${rule.id}`);
      }
    }
  } catch (err) {
    console.error("❌ Rule failed to execute:", err.message);
  }
}

// API: 获取所有规则
app.get('/rules', async (req, res) => {
  const rules = await Rule.find();
  res.json(rules);
});

// API: 添加新规则
app.post('/rules', async (req, res) => {
  const newRule = req.body;

  if (!newRule.id || !newRule.trigger || !newRule.action) {
    return res.status(400).json({ error: "Lose necessary field（id, trigger, action）" });
  }

  const exists = await Rule.findOne({ id: newRule.id });
  if (exists) {
    return res.status(400).json({ error: `Rule ID '${newRule.id}' is exist.` });
  }

  const validOperators = ['>', '>=', '<', '<=', '==', '!='];
  if (!validOperators.includes(newRule.trigger.operator)) {
    return res.status(400).json({ error: `Do not support：${newRule.trigger.operator}` });
  }

  const rule = new Rule(newRule);
  await rule.save();
  res.status(201).json({ message: "Rule has been added!", rule });
});

// API: 删除规则
app.delete('/rules/:id', async (req, res) => {
  const ruleId = req.params.id;
  const result = await Rule.findOneAndDelete({ id: ruleId });
  if (!result) {
    return res.status(404).json({ error: `Rule '${ruleId}' Not Exist` });
  }
  res.json({ message: `Rule '${ruleId}' Deleted Successfully` });
});

// ✅ 启动服务
async function startServer() {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://mongo:27017/ruleengine';
    console.log("⏳ Connecting MongoDB...");
    await mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log("✅ MongoDB is connected");

    setInterval(checkRulesAndExecute, POLL_INTERVAL);
    console.log("🧠 Automated Rule Starting...");

    const port = process.env.PORT || 3000;
    app.listen(port, () => {
      console.log(`📡 Rule Engine serving is listening to ${port}`);
    });
  } catch (err) {
    console.error("❌ MongoDB can't be connected:", err);
  }
}

startServer();
