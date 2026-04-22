# GPU IntentService Deployment

This deployment runs `intent_server_qwen.py` as a Docker-backed systemd service on the GPU host.

## 1. Build and push the image

Run these commands on the GPU host after syncing the latest `IntentService` directory:

```bash
cd /root/smartintent-main_fixed/Middleware_Code/IntentService

docker build -t intent-server:qwen-v1 .
docker tag intent-server:qwen-v1 crpi-cn1s409pxj9e0zxn.cn-hangzhou.personal.cr.aliyuncs.com/smartintent/intent-server:qwen-v1
docker push crpi-cn1s409pxj9e0zxn.cn-hangzhou.personal.cr.aliyuncs.com/smartintent/intent-server:qwen-v1
```

## 2. Install the environment file

```bash
sudo mkdir -p /etc/smartintent
sudo cp deploy/intent-service.env.example /etc/smartintent/intent-service.env
sudo nano /etc/smartintent/intent-service.env
```

Keep `OLLAMA_URL=http://127.0.0.1:11434/api/generate` when the service uses `--network host` and Ollama runs on the GPU host.

## 3. Install and start the systemd service

```bash
sudo cp deploy/smartintent-intent.service /etc/systemd/system/smartintent-intent.service
sudo systemctl daemon-reload
sudo systemctl enable --now smartintent-intent
```

## 4. Verify

```bash
systemctl status smartintent-intent --no-pager
curl http://127.0.0.1:5050/healthz
curl -X POST http://127.0.0.1:5050/get-intent \
  -H "Content-Type: application/json" \
  -d '{"userInstruction":"turn on the light"}'
```

From the CPU host, verify through `proxy-server`:

```bash
curl -X POST http://proxy-server.default.121.40.148.46.sslip.io/command \
  -H "Content-Type: application/json" \
  -d '{"userInstruction":"turn on the light"}'
```
