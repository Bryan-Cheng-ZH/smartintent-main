const http = require('http');
const https = require('https');
const { URL } = require('url');

// 目标 Aggregator 服务地址
const TARGET_URL = 'http://aggregator.default';

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


  if (url === '/command') {
    hostname = 'intent-server.default';
    //port = 5050;
    path = '/get-intent';
  } else if (url === '/execute-intent') {
    hostname = 'intent-server.default';
    //port = 5050;
    path = '/execute-intent';
  } else if (url === '/confirm-rule') {
    hostname = 'intent-server.default';
    path = '/confirm-rule';
  } else if (url === '/rules') {
    hostname = 'rule-engine.default';
    path = '/rules';
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
  console.log(`🧠 指令 /command 转发到 http://localhost:5050/get-intent`);
});
