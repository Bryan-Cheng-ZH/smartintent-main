# smart-intent 复现教程（Docker + Knative｜按真实配置过程整理）

> 本教程按我实际把 smart-intent 跑通的过程整理，重点不是“理论上怎么部署”，而是“实际怎么一步步排查并跑通”。  
> **请严格按顺序执行**。  
> 尤其注意：**middleware 相关服务在 `curl aggregator/proxy-server` 之前，要先完成 Dockerfile build / 镜像准备 / Knative 部署。**

---

## 一、推荐复现顺序

### 第一阶段：先验证 Knative 环境本身没问题

1. 打开 Docker Desktop
2. 打开 Kubernetes
3. 确认 `kubectl config current-context` 是 `docker-desktop`
4. 安装 Knative Serving + Kourier
5. 配置默认域名 `sslip.io`
6. 检查 `nodes`

---

### 第二阶段：先部署基础依赖

这里我实际使用的是：

- `smartintent-infra-clean.yaml`

它会部署：

- Redis
- rule-mongo

---

### 第三阶段：先部署最核心的链路

按这个顺序：

1. 部署基础依赖
2. 部署后端设备微服务
3. **准备 middleware 相关镜像（包括 Dockerfile build）**
4. 部署 aggregator
5. 部署 dispatcher
6. 部署 proxy-server
7. 测试 `/all-status`
8. 再接前端

---

### 第四阶段：最后再接高级功能

最后再接：

- intent-server
- recorder-service
- rule-engine
- mode-manager

---

## 二、先准备环境

### 1. 打开 Docker Desktop

确认 Docker Desktop 已经正常启动。

### 2. 打开 Kubernetes

在 Docker Desktop 设置里确认 Kubernetes 已启用。

### 3. 检查 kubectl context

```bash
kubectl config current-context
```

必须看到：

```bash
docker-desktop
```

如果不是：

```bash
kubectl config use-context docker-desktop
```

### 4. 检查 nodes

这一步之前的版本漏掉了，但你实际复现里这一步很重要：

```bash
kubectl get nodes
```

正常应看到类似：

```bash
NAME             STATUS   ROLES           AGE   VERSION
docker-desktop   Ready    control-plane   ...
```

如果这里不是 `Ready`，后面不要继续。

---

## 三、安装 Knative Serving + Kourier

### 1. 安装 Knative Serving CRD

```bash
kubectl apply -f https://github.com/knative/serving/releases/download/knative-v1.21.1/serving-crds.yaml
```

### 2. 安装 Knative Serving Core

```bash
kubectl apply -f https://github.com/knative/serving/releases/download/knative-v1.21.1/serving-core.yaml
```

### 3. 安装 Kourier

```bash
kubectl apply -f https://github.com/knative/net-kourier/releases/download/knative-v1.21.1/kourier.yaml
```

### 4. 设置 Kourier 为默认 ingress

```bash
kubectl patch configmap/config-network \
  -n knative-serving \
  --type merge \
  -p '{"data":{"ingress-class":"kourier.ingress.networking.knative.dev"}}'
```

### 5. 配置默认域名 sslip.io

```bash
kubectl apply -f https://github.com/knative/serving/releases/download/knative-v1.21.1/serving-default-domain.yaml
```

### 6. 检查 Knative 组件

```bash
kubectl get pods -n knative-serving
kubectl get pods -n kourier-system
```

确保核心组件都 Running。

---

## 四、部署基础依赖（你实际用的是 smartintent-infra-clean.yaml）

你实际补充的信息里说明，这一步不是手动分别部署 redis/mongo，而是使用：

```bash
kubectl apply -f smartintent-infra-clean.yaml
```

这个文件中定义了：

- `redis` Deployment + Service，端口 6379
- `rule-mongo` Deployment + Service，端口 27017

可见该文件内容确实是这两个依赖的干净重建版本。fileciteturn0file0

---

### 1. 如果之前部署过旧资源，建议先清理

```bash
kubectl delete deployment redis --ignore-not-found
kubectl delete service redis --ignore-not-found

kubectl delete deployment rule-mongo --ignore-not-found
kubectl delete service rule-mongo --ignore-not-found
```

这样做的原因是你当时实际遇到过：

- 旧 Redis / Mongo 残留
- Service 指错 Pod
- endpoints 为空
- 上层服务连接拒绝

---

### 2. 正式部署 infra

```bash
kubectl apply -f smartintent-infra-clean.yaml
```

---

### 3. 检查 Pod

```bash
kubectl get pods
```

重点看：

- redis
- rule-mongo

都应该是 `Running`

---

### 4. 检查 Service

```bash
kubectl get svc
```

---

### 5. 检查 Endpoints（非常关键）

```bash
kubectl get endpoints
```

必须确认：

- `redis` 不是 `<none>`
- `rule-mongo` 不是 `<none>`

例如应该类似：

```bash
redis        10.x.x.x:6379
rule-mongo   10.x.x.x:27017
```

如果 endpoints 是空的，就说明依赖还没真正可用，不要继续。

---

## 五、部署后端设备微服务

这部分是 smart home 的设备层，通常包括：

- airconditioner-microservice
- airpurifier-microservice
- coffee-machine-microservice
- humidity-sensor-microservice
- light-microservice
- pollution-sensor-microservice
- smart-curtains-microservice
- tv-microservice
- temperature-sensor-microservice
- humidifier-microservice
- robot-vacuum-microservice

具体以你项目里的 `Backend_Code/` 为准。

### 1. 部署 Backend_Code

```bash
kubectl apply -f Backend_Code/ -R
```

### 2. 检查 Knative Service

```bash
kubectl get ksvc
```

重点确保这些设备服务尽量都是：

```bash
READY   True
```

如果某个服务不是 True：

```bash
kubectl describe ksvc <服务名>
kubectl get pods
kubectl describe pod <pod名>
kubectl logs <pod名>
```

---

## 六、Middleware 相关步骤（这一步之前版本漏得比较多）

这一部分是你这次特别指出的重点：  
**在测试 `aggregator` 和 `proxy-server` 前，需要先把 middleware 相关 Dockerfile build 好，再部署对应服务。**

也就是说，不能只写“apply yaml → curl 测试”，中间必须补上：

- 进入 middleware 对应目录
- 根据 Dockerfile build 镜像
- 让 Knative 能拉到这些镜像
- 再 apply 对应 yaml / service

---

## 七、先准备 middleware 镜像（按你的实际思路）

### 1. aggregator：先 build，再 deploy

假设你在 aggregator 对应目录中有 Dockerfile：

```bash
cd Middleware_Code/aggregator
docker build -t aggregator:latest .
```

如果你项目中使用的是 Docker Desktop 本地镜像环境，通常本地 build 后，Knative 在 `docker-desktop` 集群里可以直接使用本地镜像。

然后回到项目根目录，部署 aggregator：

```bash
kubectl apply -f aggregator.yaml
```

或者如果 yaml 在 middleware 目录里，就按你的目录实际路径执行。

---

### 2. dispatcher：先 build，再 deploy

```bash
cd Middleware_Code/dispatcher
docker build -t dispatcher:latest .
```

部署：

```bash
kubectl apply -f dispatcher.yaml
```

---

### 3. proxy-server：先 build，再 deploy

```bash
cd Middleware_Code/proxy-server
docker build -t proxy-server:latest .
```

部署：

```bash
kubectl apply -f proxy-server.yaml
```

---

### 4. 其他 middleware（如果项目中还有）

如果项目中还有其他 middleware 服务，也按同样思路处理：

```bash
cd <middleware-service-dir>
docker build -t <image-name>:latest .
kubectl apply -f <service-yaml>
```

---

## 八、为什么 middleware 的 build 必须放在 curl 测试之前

你这次指出得很对。  
因为：

- `curl http://aggregator.default.127.0.0.1.sslip.io/all-status`
- `curl http://proxy-server.default.127.0.0.1.sslip.io/all-status`

这两个测试成立的前提是：

1. 对应服务已经部署
2. 对应服务的镜像已经存在
3. Knative 已经成功启动 revision / pod
4. 上游依赖（设备微服务、Redis/Mongo）也已就绪

如果 Dockerfile 根本没 build，或者镜像名不对，那么：

- ksvc 可能存在
- 但 pod 起不来
- 最终 curl 必然失败

所以正确顺序应当是：

1. build middleware image
2. apply middleware yaml
3. `kubectl get ksvc`
4. 确认 READY=True
5. 再 curl

---

## 九、部署并验证 aggregator

### 1. 先检查 aggregator 是否 READY

```bash
kubectl get ksvc aggregator
kubectl describe ksvc aggregator
```

### 2. 测试 aggregator

```bash
curl http://aggregator.default.127.0.0.1.sslip.io/all-status
```

成功时会返回完整 JSON，包含各设备状态。

这一步的意义是：

- 设备微服务正常
- aggregator 已正确聚合状态
- 基础后端主链路开始打通

---

## 十、部署并验证 dispatcher

### 1. 检查 dispatcher

```bash
kubectl get ksvc dispatcher
kubectl describe ksvc dispatcher
```

### 2. 如果 dispatcher 对应镜像是自己 build 的，先确保 build 已做完

这一点和 aggregator 同理。

---

## 十一、部署并验证 proxy-server

### 1. 先检查 proxy-server 是否 READY

```bash
kubectl get ksvc proxy-server
kubectl describe ksvc proxy-server
```

### 2. 测试 proxy-server

```bash
curl http://proxy-server.default.127.0.0.1.sslip.io/all-status
```

如果这一步通了，说明：

- proxy-server 能访问后端聚合接口
- 前端联调的核心入口已经准备好

---

## 十二、前端联调（按你真实使用过的方法）

你实际跑通前端时，不是单纯依赖前端直接访问 Knative 域名，而是经历过：

- 前端请求 `proxy-server.default.127.0.0.1.sslip.io` 不稳定
- 502 / fail to fetch
- 后来改成对 `proxy-server` 的 pod 做 `port-forward`
- 前端改用 `127.0.0.1:8080`

这部分是实际复现里非常关键的一步。

---

### 1. 找到 proxy-server pod

```bash
kubectl get pods | grep proxy-server
```

### 2. 对 pod 做 port-forward

```bash
kubectl port-forward pod/<proxy-server-pod-name> 8080:8080
```

注意：  
这里必须是 **pod**，不是普通 `svc/proxy-server`。

因为你当时实际遇到过 Knative service 报错：

```bash
Service is defined without a selector
```

这就是为什么不能直接：

```bash
kubectl port-forward svc/proxy-server 8080:80
```

---

### 3. 修改前端 HTML

把前端里的：

```text
http://proxy-server.default.127.0.0.1.sslip.io
```

改成：

```text
http://127.0.0.1:8080
```

例如：

- `/all-status`
- `/ac/control`
- 其他原本走 proxy-server 的请求

都改成走本地转发地址。

---

### 4. 启动前端静态服务

```bash
cd Frontend_Code
python3 -m http.server 5500
```

浏览器打开：

```text
http://127.0.0.1:5500/final_version_modify.html
```

---

### 5. 先用 curl 验证本地代理链路

```bash
curl http://127.0.0.1:8080/all-status
```

如果这一步返回完整 JSON，再打开前端页面测试。

---

## 十三、最后再接高级功能

当以下链路已经成功后：

- Redis / rule-mongo 正常
- 设备微服务正常
- aggregator 正常
- dispatcher 正常
- proxy-server 正常
- 前端 `/all-status` 正常

再继续接：

- intent-server
- recorder-service
- rule-engine
- mode-manager

---

## 十四、你真实复现中踩过的核心坑总结

### 坑 1：基础依赖不是“有 service 就行”，还要看 endpoints

即使 `kubectl get svc` 看起来有：

- redis
- rule-mongo

也不代表它真的可用。  
必须看：

```bash
kubectl get endpoints
```

---

### 坑 2：旧 Redis / Mongo 残留会导致“像是部署成功了，其实连错对象”

所以你才会后来用 `smartintent-infra-clean.yaml` 去“清洗 + 正确重建”。

---

### 坑 3：middleware 服务不能跳过 Dockerfile build

这是本次你特别指出、前一个版本缺失的重点。  
必须注意：

- aggregator 先 build
- dispatcher 先 build
- proxy-server 先 build
- 其他 middleware 也一样

否则后面的 `curl` 没有意义。

---

### 坑 4：Knative service 不能按普通 service 思路 port-forward

报错典型是：

```bash
Service is defined without a selector
```

正确做法是：

```bash
kubectl port-forward pod/<pod-name> 8080:8080
```

---

### 坑 5：curl 能通不等于前端能通

所以你后来才采用了：

- port-forward
- 前端改 `127.0.0.1:8080`

这个“本地联调方案”

---

## 十五、最小成功标准

### 基础跑通标准

- `kubectl get nodes` 正常
- Knative / Kourier 正常
- `smartintent-infra-clean.yaml` 部署成功
- redis / rule-mongo endpoints 非空
- 设备微服务 READY=True
- aggregator READY=True
- dispatcher READY=True
- proxy-server READY=True
- `curl http://aggregator.default.127.0.0.1.sslip.io/all-status` 正常
- `curl http://proxy-server.default.127.0.0.1.sslip.io/all-status` 正常
- `curl http://127.0.0.1:8080/all-status` 正常
- 前端页面能显示状态

### 完整跑通标准

在上面的基础上，再满足：

- 前端按钮可控制设备
- intent-server 正常
- recorder-service 正常
- rule-engine 正常
- mode-manager 正常

---

## 十六、建议组员实际复现时的操作习惯

1. 每完成一层就立刻测试
2. 先 `kubectl get ksvc / pods / endpoints`
3. 再 `curl`
4. 最后才开前端
5. 前端不通时，不要先怀疑业务逻辑，先怀疑网络链路 / 地址 / port-forward
6. middleware 服务一定先 build 再 deploy

---

## 十七、一套最常用检查命令

```bash
kubectl config current-context
kubectl get nodes

kubectl get pods
kubectl get svc
kubectl get ksvc
kubectl get deploy
kubectl get endpoints

kubectl describe ksvc aggregator
kubectl describe ksvc proxy-server
kubectl describe ksvc dispatcher

kubectl get pods | grep proxy-server
kubectl port-forward pod/<proxy-server-pod-name> 8080:8080

curl http://aggregator.default.127.0.0.1.sslip.io/all-status
curl http://proxy-server.default.127.0.0.1.sslip.io/all-status
curl http://127.0.0.1:8080/all-status
```

---

## 十八、给组员的最简提醒

> 请严格按这个顺序复现：  
> **Knative 环境 → infra-clean.yaml → 设备微服务 → middleware Dockerfile build → aggregator → dispatcher → proxy-server → `/all-status` → 前端 → 高级功能**  
> 不要跳步骤。  
> **一定先打通 `/all-status`，再谈 intent / 语音 / 规则。**
