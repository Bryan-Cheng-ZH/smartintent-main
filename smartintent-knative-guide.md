# SmartIntent 在 Docker Desktop + Knative 上复现指南

## 先说结论

这个项目的 README 里把“本地开发”和“Docker/Knative”写在了一起，但两条路并不完全相同：

- **README 的 quickstart** 更偏向“本地逐个启动服务”
- **项目里的 Knative YAML** 才是“作者的微服务部署思路”
- **如果你想用 Docker Desktop 自带 Kubernetes**，不要走 `kn quickstart` 插件那条路，而是直接在 Docker Desktop 的 Kubernetes 集群里安装 Knative Serving + Kourier，然后部署项目服务

## 这个项目里你必须提前知道的 4 个坑

### 1) `kn quickstart` 不适合 Docker Desktop 内置集群
`kn quickstart` 会自己创建 **kind/minikube** 集群，而不是接管 Docker Desktop 已有的 Kubernetes。

### 2) 这个项目依赖两个基础中间件
代码里大量服务直接写死了：
- Redis 主机名：`redis`
- MongoDB 主机名：`rule-mongo`

所以在 Kubernetes 里，你需要创建 **Service 名字正好叫这两个名字**。

### 3) Voice/Intent 不是纯离线
`Middleware_Code/IntentService/intent_server.py` 里有：
- `api_key="<REPLACE WITH YOUR KEY>"`
- `base_url="https://api.siliconflow.cn/v1"`

所以如果你不填真实 key，**自然语言命令/语音意图识别不会工作**。

### 4) 录音服务前端地址不是 Knative 地址
前端 `final_version.html` 里录音接口仍然是：
- `http://127.0.0.1:5001/startRecording`
- `http://127.0.0.1:5001/stopRecording`

这意味着：
- 要么你先用 `kubectl port-forward` 把 `recorder-service` 转到本机 5001
- 要么你自己把前端里的这两个地址改成 recorder-service 的 Knative URL

---

## 推荐复现顺序

### 第一阶段：先验证 Knative 环境本身没问题
1. 开 Docker Desktop
2. 打开 Kubernetes
3. 确认 `kubectl config current-context` 是 `docker-desktop`
4. 安装 Knative Serving + Kourier
5. 配置默认域名（sslip.io）

### 第二阶段：先部署基础依赖
先部署：
- Redis
- MongoDB

### 第三阶段：先部署最核心的链路
按这个顺序：
1. 后端设备微服务
2. aggregator
3. dispatcher
4. proxy-server
5. 打开前端，看 `/all-status` 是否通

### 第四阶段：再接入高级功能
最后再接：
- intent-server
- recorder-service
- rule-engine
- mode-manager

---

## 你在终端里应执行的命令

### A. 启用 Docker Desktop Kubernetes
在 Docker Desktop 里：
- Settings / Kubernetes
- 选择 **kubeadm** 更稳妥（本地镜像复现更省事）
- Create cluster

然后执行：

```bash
kubectl config use-context docker-desktop
kubectl get nodes
```

---

### B. 安装 Knative Serving + Kourier

```bash
kubectl apply -f https://github.com/knative/serving/releases/download/knative-v1.21.1/serving-crds.yaml
kubectl apply -f https://github.com/knative/serving/releases/download/knative-v1.21.1/serving-core.yaml
kubectl apply -f https://github.com/knative-extensions/net-kourier/releases/download/knative-v1.21.0/kourier.yaml
kubectl patch configmap/config-network \
  -n knative-serving \
  --type merge \
  --patch '{"data":{"ingress-class":"kourier.ingress.networking.knative.dev"}}'
```

检查：

```bash
kubectl get pods -n knative-serving
kubectl get pods -n kourier-system
```

---

### C. 配置默认域名（让 `*.127.0.0.1.sslip.io` 这种 URL 生效）

```bash
kubectl apply -f https://github.com/knative/serving/releases/download/knative-v1.21.1/serving-default-domain.yaml
kubectl get ksvc
kubectl get svc -n kourier-system kourier
```

---

### D. 部署 Redis 和 MongoDB

```bash
kubectl apply -f smartintent-infra.yaml
kubectl get pods
kubectl get svc
```

你应该能看到：
- `redis`
- `rule-mongo`

---

### E. 部署项目服务（先直接用项目自带 YAML）
在项目根目录执行：

```bash
kubectl apply -f Backend_Code/airmaster/airmaster-knative.yaml
kubectl apply -f Backend_Code/tvmaster/tv-knative.yaml
kubectl apply -f Backend_Code/lightmaster/light-knative.yaml
kubectl apply -f Backend_Code/humidifiermaster/humidifier-knative.yaml
kubectl apply -f Backend_Code/coffeemaster/coffee-machine-knative.yaml
kubectl apply -f Backend_Code/curtainsmaster/smart-curtains-knative.yaml
kubectl apply -f Backend_Code/vacuummaster/robot-vacuum-knative.yaml
kubectl apply -f Backend_Code/airpurifiermaster/airpurifier-knative.yaml
kubectl apply -f Backend_Code/tempmaster/temperature-sensor-knative.yaml
kubectl apply -f Backend_Code/humiditymaster/humidity-sensor-knative.yaml
kubectl apply -f Backend_Code/pollutionmaster/pollution-sensor-knative.yaml

kubectl apply -f Middleware_Code/aggregator-service/aggregator-knative.yaml
kubectl apply -f Middleware_Code/dispatcher/dispatcher-knative.yaml
kubectl apply -f Middleware_Code/ProxyService/proxy-server.yaml
```

检查：

```bash
kubectl get ksvc
```

---

### F. 先验证核心链路
先看 proxy 的 URL：

```bash
kubectl get ksvc proxy-server
kubectl get ksvc aggregator
```

然后测试：

```bash
curl http://proxy-server.default.127.0.0.1.sslip.io/all-status
```

如果返回所有设备状态 JSON，说明最关键链路已经通了：

前端 → proxy-server → aggregator → 各 device service

---

### G. 打开前端
进入 `Frontend_Code`，直接用静态服务器即可：

```bash
cd Frontend_Code
python3 -m http.server 8080
```

浏览器打开：

```text
http://127.0.0.1:8080/final_version.html
```

只要 Knative 默认域名已经配好，前端中写死的：

```text
http://proxy-server.default.127.0.0.1.sslip.io/...
```

就应该能访问。

---

## 语音/意图链路怎么补上

### 1. 部署 intent-server
先把 `Middleware_Code/IntentService/intent_server.py` 里的 API key 改掉。

然后：

```bash
kubectl apply -f Middleware_Code/IntentService/intent-server.yaml
```

### 2. 部署 rule-engine 和 mode-manager

```bash
kubectl apply -f Middleware_Code/rule-engine/rule-engine.yaml
kubectl apply -f Middleware_Code/mode-manager/mode-manager.yaml
```

### 3. 部署 recorder-service

```bash
kubectl apply -f Backend_Code/VoiceInterface/recorder-service.yaml
```

### 4. 让前端能访问录音接口
有两种方式：

#### 方式 A：最省事

```bash
kubectl port-forward ksvc/recorder-service 5001:5001
```

这样前端里写死的 `127.0.0.1:5001` 不用改。

#### 方式 B：更“Knative 正统”
把前端里的：
- `http://127.0.0.1:5001/startRecording`
- `http://127.0.0.1:5001/stopRecording`

改成 recorder-service 的 Knative URL。

---

## 如果项目自带 YAML 拉不到镜像怎么办
项目 YAML 里写的是作者的镜像名，例如：
- `docker.io/shidina/aggregator:v1`
- `docker.io/shidina/proxy-server:v1`

如果这些镜像不可用，改走下面流程：

### 1. 逐个本地 build
示例：

```bash
cd Backend_Code/airmaster
docker build -t smartintent/airmaster:v1 .
```

其余服务同理。

### 2. 修改对应 YAML 的 `image:`
例如把：

```yaml
image: docker.io/shidina/airconditioner-microservice:v1
```

改成：

```yaml
image: smartintent/airmaster:v1
```

### 3. 再重新 apply

```bash
kubectl apply -f Backend_Code/airmaster/airmaster-knative.yaml
```

---

## 你最应该优先检查的故障点

### 情况 1：`curl proxy-server.../all-status` 失败
先看：

```bash
kubectl get ksvc
kubectl get pods
kubectl logs -l serving.knative.dev/service=proxy-server --tail=100
kubectl logs -l serving.knative.dev/service=aggregator --tail=100
```

### 情况 2：aggregator 里部分设备是 error
说明对应设备服务没起来，继续查：

```bash
kubectl logs -l serving.knative.dev/service=airconditioner-microservice --tail=100
kubectl logs -l serving.knative.dev/service=tv-microservice --tail=100
```

### 情况 3：很多服务报 Redis 连接失败
说明：
- `redis` 这个 Service 没创建成功
- 或 Redis Pod 没 Ready

检查：

```bash
kubectl get pods
kubectl get svc redis
```

### 情况 4：rule-engine / mode-manager 报 Mongo 连接失败
检查：

```bash
kubectl get svc rule-mongo
kubectl logs -l serving.knative.dev/service=rule-engine --tail=100
kubectl logs -l serving.knative.dev/service=mode-manager --tail=100
```

### 情况 5：语义命令按钮点了没反应
大概率是：
- IntentService 里的 API key 没填
- `intent-server` 没启动
- `rule-engine` / `dispatcher` 没通

---

## 最推荐你的实际执行路线

按这个顺序做，成功率最高：

1. Docker Desktop Kubernetes 启动
2. Knative Serving + Kourier 安装完成
3. `smartintent-infra.yaml` 部署 redis 与 mongo
4. 部署 11 个设备服务
5. 部署 aggregator / dispatcher / proxy-server
6. 先测 `curl http://proxy-server.default.127.0.0.1.sslip.io/all-status`
7. 前端打开 `final_version.html`
8. 再补 intent-server / rule-engine / recorder-service

只要你走到第 6 步成功，这个项目就已经算“主干跑通”了。
