#!/usr/bin/env node

/**
 * 该脚本自动完成以下流程：
 * 1. 调用 GPT API 获取用户意图解析后的 JSON（或者从标准输入接收）
 * 2. 提取并转换 GPT 输出数据为空调微服务需要的格式
 * 3. 自动使用 curl 命令将转换后的 JSON POST 到空调控制接口
 *
 * 注意：
 * - 请确保你的环境中已安装 Node.js。
 * - 若 Node 版本 < 18，建议安装 node-fetch 模块（npm install node-fetch）。
 */

const { exec } = require('child_process');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

// ========== 配置 ==========
const GPT_API_URL = process.env.GPT_API_URL || "https://api.deepseek.com/v1"; // 替换为你的 GPT API URL
const GPT_API_KEY = process.env.GPT_API_KEY || "sk-db104d4acb0047349d4bc26079020a83"; // 替换为你的 GPT API Key

// Knative 空调服务 URL
const AIRMASTER_URL = "http://airmaster.default.127.0.0.1.nip.io/ac/control";

// ========== 主流程 ==========
(async function main() {
  try {
    // 调用 GPT API 获取解析结果
    const gptOutput = await callGPTAPI("请将空调设置为26度");
    console.log("[INFO] GPT API 返回：", JSON.stringify(gptOutput, null, 2));

    // 提取并转换 GPT 输出数据
    const transformed = transformGPTOutput(gptOutput);
    if (!transformed) {
      console.error("[ERROR] 转换结果为空，请检查 GPT 输出格式！");
      process.exit(1);
    }
    console.log("[INFO] 转换后的请求数据：", JSON.stringify(transformed, null, 2));

    // 自动发送 curl 请求到空调微服务
    sendCurlRequest(transformed);
  } catch (err) {
    console.error("[ERROR] 处理过程中出现异常：", err);
    process.exit(1);
  }
})();

// ========== 调用 GPT API ==========
async function callGPTAPI(userPrompt) {
  const response = await fetch(GPT_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GPT_API_KEY}`
    },
    body: JSON.stringify({ prompt: userPrompt })
  });
  if (!response.ok) {
    throw new Error(`GPT API 调用失败，状态码：${response.status}`);
  }
  return response.json();
}

// ========== 数据转换函数 ==========
function transformGPTOutput(gptJson) {
  // 假设 GPT 返回的数据格式如上例：
  // 只取第一个结果，且只转换空调部分（deviceId "air_conditioner"）
  const result = gptJson.results && gptJson.results[0];
  if (!result) return null;

  // 仅处理 deviceId 为 "air_conditioner" 的情况
  if (result.deviceId !== "air_conditioner") {
    console.error("[WARN] GPT 输出的 deviceId 不是空调，跳过转换。");
    return null;
  }

  // 映射字段：将 air_conditioner 转为 air-conditioner
  const deviceId = "air-conditioner";
  // 从 GPT 的 parameters 获取温度，如果不存在可设默认值
  const temperature = result.parameters.temperature || 22;
  // 此处我们固定 mode 为 "heat"、fanSpeed 为 "very high"，duration 固定为 1
  const mode = "heat";
  const fanSpeed = "very high";
  const duration = 1;

  return { deviceId, action: result.action || "turn_on", temperature, mode, fanSpeed, duration };
}

// ========== 发送 curl 请求 ==========
function sendCurlRequest(dataObj) {
  const jsonString = JSON.stringify(dataObj);
  // 构造 curl 命令，注意使用单引号包裹 JSON 字符串
  const cmd = `curl -X POST "${AIRMASTER_URL}" -H "Content-Type: application/json" -d '${jsonString}'`;
  console.log("[INFO] 正在执行命令：", cmd);

  exec(cmd, (error, stdout, stderr) => {
    if (error) {
      console.error("[ERROR] 执行 curl 命令出错：", error);
      return;
    }
    console.log("[INFO] curl 输出：", stdout);
    if (stderr) {
      console.error("[WARN] curl 错误信息：", stderr);
    }
  });
}