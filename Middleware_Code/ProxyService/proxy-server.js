const http = require('http');
const https = require('https');
const { URL } = require('url');

// 目标 Aggregator 服务地址
const TARGET_URL = 'http://aggregator.default';
const INTENT_SERVER_URL = process.env.INTENT_SERVER_URL || 'https://intent.smartintent.org';

const proxyServer = http.createServer((req, res) => {
  // CORS 设置
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // 获取请求路径
  const url = req.url;
  console.log(`收到请求：${req.method} ${url}`);

  // 默认目标地址是 Aggregator
  let targetUrl = new URL(TARGET_URL + url);
  let hostname = targetUrl.hostname;
  let port = targetUrl.port || 80;
  let path = targetUrl.pathname + targetUrl.search;
  const intentServerUrl = new URL(INTENT_SERVER_URL);


// ================== HEALTH CHECK ==================
if (url === '/health' && req.method === 'GET') {
  const health = {
    proxy: "ok",
    intent: "not_checked",
    ollama: "unknown",
    model_loaded: false,
    checked_at: new Date().toISOString()
  };

  const ollamaReq = http.get('http://172.21.79.100:11434/api/ps', (ollamaRes) => {
    let data = '';

    ollamaRes.on('data', chunk => data += chunk);

    ollamaRes.on('end', () => {
      try {
        const json = JSON.parse(data);
        const models = json.models || [];
        const names = models.map(m => m.name || m.model);

        health.ollama = "ok";
        health.model_loaded = names.includes("qwen2.5:3b");
        health.overall = health.ollama === "ok" && health.model_loaded ? "ok" : "warning";
      } catch (e) {
        health.ollama = "error";
        health.overall = "warning";
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(health));
    });
  });

  ollamaReq.on('error', () => {
    health.ollama = "error";
    health.overall = "warning";
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(health));
  });

  ollamaReq.setTimeout(5000, () => {
    health.ollama = "timeout";
    health.overall = "warning";
    ollamaReq.destroy();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(health));
  });

  return;
}
// ================== HEALTH CHECK END ==================

  if (url === '/command') {
    hostname = intentServerUrl.hostname;
    port = intentServerUrl.port || 80;
    path = '/get-intent';
  } else if (url === '/execute-intent') {
    hostname = intentServerUrl.hostname;
    port = intentServerUrl.port || 80;
    path = '/execute-intent';
  } else if (url === '/confirm-rule') {
    hostname = intentServerUrl.hostname;
    port = intentServerUrl.port || 80;
    path = '/confirm-rule';
  } else if (url === '/dispatch') {
    hostname = 'dispatcher.default';
    path = '/dispatch';
  } else if (url === '/workflow') {
    hostname = 'dispatcher.default';
    path = '/workflow';
  } else if (url === '/rules') {
    hostname = 'rule-engine.default';
    path = '/rules';
  } else if (url.startsWith('/modes')) {
    hostname = 'mode-manager.default';
    port = 80;
    path = url;
  } else if (url === '/startRecording') {//新加的
    //hostname = 'intent-server.default';
    hostname = 'recorder-service.default';
    path = '/startRecording';
  } else if (url === '/stopRecording') {
    //hostname = 'intent-server.default';
    hostname = 'recorder-service.default';
    path = '/stopRecording';
  }

  else if (url.startsWith('/tv')) {
    hostname = 'tv-microservice.default';
    path = url;
  } else if (url.startsWith('/light')) {
    hostname = 'light-microservice.default';
    path = url;
  } else if (url.startsWith('/ac')) {
    hostname = 'airconditioner-microservice.default';
    path = url;
  } else if (url.startsWith('/humidifier')) {
    hostname = 'humidifier-microservice.default';
    path = url;
  } else if (url.startsWith('/coffee')) { // ✅ 新设备：coffeeMachine
    hostname = 'coffee-machine-microservice.default';
    path = url;
  } else if (url.startsWith('/curtains')) { // ✅ 新设备：smartCurtains
    hostname = 'smart-curtains-microservice.default';
    path = url;
  } else if (url.startsWith('/robot')) { // ✅ 新设备：robotVacuum
    hostname = 'robot-vacuum-microservice.default';
    path = url;
  } else if (url.startsWith('/airpurifier')) { // ✅ 新设备：airPurifier
    hostname = 'airpurifier-microservice.default';
    path = url;
  } else if (url.startsWith('/window')) {
    hostname = 'smart-window-microservice.default';
    path = url;
  } else if (url.startsWith('/water-heater')) {
    hostname = 'water-heater-microservice.default';
    path = url;
  }


  // 构造请求选项
  const options = {
    hostname,
    port,
    path,
    method: req.method,
    headers: { ...req.headers }
  };

  delete options.headers.host;
  delete options.headers['if-modified-since'];
  delete options.headers['if-none-match'];

  // 发起代理请求
  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);

    let body = '';
    proxyRes.on('data', chunk => body += chunk);
    proxyRes.on('end', () => {
      console.log('🔁 API返回状态码:', proxyRes.statusCode);
      console.log('🧾 API返回数据:', body);
    });

    proxyRes.pipe(res);
  });

  proxyReq.on('error', (e) => {
    console.error(`代理请求错误: ${e.message}`);
    res.statusCode = 500;
    res.end(`代理请求错误: ${e.message}`);
  });

  if (req.method === 'POST' || req.method === 'PUT') {
    let bodyData = '';
    req.on('data', chunk => {
      bodyData += chunk;
    });
    req.on('end', () => {
      console.log('[转发前请求体]:', bodyData);
      proxyReq.write(bodyData);
      proxyReq.end();
    });
  } else {
    proxyReq.end();
  }
});

// 启动代理服务器
const PORT = 8080;
proxyServer.listen(PORT, () => {
  console.log(`✅ 代理服务器运行在 http://localhost:${PORT}`);
  console.log(`🔁 默认转发 Aggregator 请求到 ${TARGET_URL}`);
  console.log(`🧠 Intent 请求转发到 ${INTENT_SERVER_URL}`);
});
