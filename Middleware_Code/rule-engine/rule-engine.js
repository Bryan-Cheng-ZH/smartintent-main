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

function getOperatorFamily(operator) {
  if (operator === '>' || operator === '>=') return 'gt';
  if (operator === '<' || operator === '<=') return 'lt';
  if (operator === '==') return 'eq';
  if (operator === '!=') return 'ne';
  return 'unknown';
}

function sameRuleType(a, b) {
  return (
    a.trigger?.sensor === b.trigger?.sensor &&
    a.action?.deviceId === b.action?.deviceId &&
    a.action?.action === b.action?.action &&
    getOperatorFamily(a.trigger?.operator) === getOperatorFamily(b.trigger?.operator)
  );
}

function getConditionRange(rule) {
  const op = rule.trigger?.operator;
  const v = Number(rule.trigger?.value);

  switch (op) {
    case '>':
      return { min: v, minInclusive: false, max: Infinity, maxInclusive: false };
    case '>=':
      return { min: v, minInclusive: true, max: Infinity, maxInclusive: false };
    case '<':
      return { min: -Infinity, minInclusive: false, max: v, maxInclusive: false };
    case '<=':
      return { min: -Infinity, minInclusive: false, max: v, maxInclusive: true };
    case '==':
      return { min: v, minInclusive: true, max: v, maxInclusive: true };
    case '!=':
      return { notEqual: v };
    default:
      return null;
  }
}

function rangesOverlap(a, b) {
  if (!a || !b) return false;

  if (Object.prototype.hasOwnProperty.call(a, 'notEqual') || Object.prototype.hasOwnProperty.call(b, 'notEqual')) {
    if (a.notEqual !== undefined && b.notEqual !== undefined) return true;

    const ne = a.notEqual !== undefined ? a.notEqual : b.notEqual;
    const other = a.notEqual !== undefined ? b : a;

    if (!other) return false;

    if (other.min !== undefined && other.max !== undefined) {
      const aboveMin = other.min === -Infinity || ne > other.min || (ne === other.min && other.minInclusive);
      const belowMax = other.max === Infinity || ne < other.max || (ne === other.max && other.maxInclusive);

      if (other.min === other.max && other.minInclusive && other.maxInclusive && aboveMin && belowMax) {
        return false;
      }
      return true;
    }

    return true;
  }

  const left = Math.max(a.min, b.min);
  const right = Math.min(a.max, b.max);

  if (left < right) return true;
  if (left > right) return false;

  const aIncludes = (left === a.min ? a.minInclusive : a.maxInclusive);
  const bIncludes = (left === b.min ? b.minInclusive : b.maxInclusive);

  return aIncludes && bIncludes;
}

function isConflictingRule(existingRule, incomingRule) {
  const sameTarget = (
    existingRule.trigger?.sensor === incomingRule.trigger?.sensor &&
    existingRule.action?.deviceId === incomingRule.action?.deviceId
  );

  if (!sameTarget) return false;

  if (existingRule.action?.action === incomingRule.action?.action) {
    return false;
  }

  return rangesOverlap(getConditionRange(existingRule), getConditionRange(incomingRule));
}

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
  try {
    const newRule = req.body;
    console.log("===== POST /rules =====");
    console.log("Received newRule:", JSON.stringify(newRule, null, 2));

    if (!newRule.id || !newRule.trigger || !newRule.action) {
      return res.status(400).json({ error: "Lose necessary field（id, trigger, action）" });
    }

    const validOperators = ['>', '>=', '<', '<=', '==', '!='];
    if (!validOperators.includes(newRule.trigger.operator)) {
      return res.status(400).json({ error: `Do not support：${newRule.trigger.operator}` });
    }

    const sameId = await Rule.findOne({ id: newRule.id });
    if (sameId) {
      return res.status(400).json({ error: `Rule ID '${newRule.id}' is exist.` });
    }

    const allRules = await Rule.find({});

    // 1) 同类型规则：直接更新，不新增
    const sameTypeRule = allRules.find(rule => sameRuleType(rule, newRule));
    if (sameTypeRule) {
      sameTypeRule.trigger = newRule.trigger;
      sameTypeRule.action = newRule.action;
      sameTypeRule.active = newRule.active ?? true;
      await sameTypeRule.save();

      console.log("♻️ Existing rule updated:", sameTypeRule);

      return res.status(201).json({
        message: "Rule updated successfully",
        operation: "updated",
        rule: sameTypeRule
      });
    }

    // 2) 冲突规则：删掉旧的，再创建新的
    const conflictRules = allRules.filter(rule => isConflictingRule(rule, newRule));
    if (conflictRules.length > 0) {
      const deletedIds = conflictRules.map(rule => rule.id);
      await Rule.deleteMany({ id: { $in: deletedIds } });

      const createdRule = new Rule({
        ...newRule,
        active: newRule.active ?? true
      });
      await createdRule.save();

      console.log("⚠️ Conflicting old rules deleted:", deletedIds);
      console.log("✅ New replacement rule saved:", createdRule);

      return res.status(201).json({
        message: "Conflicting old rules deleted, new rule created",
        operation: "replaced_conflicts",
        deletedRuleIds: deletedIds,
        rule: createdRule
      });
    }

    // 3) 既不是同类型更新，也没有冲突：正常创建
    const createdRule = new Rule({
      ...newRule,
      active: newRule.active ?? true
    });
    await createdRule.save();

    console.log("✅ Rule saved to MongoDB:", createdRule);

    return res.status(201).json({
      message: "Rule has been added!",
      operation: "created",
      rule: createdRule
    });

  } catch (err) {
    console.error("❌ Error while saving rule:", err);
    return res.status(500).json({ error: err.message });
  }
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
