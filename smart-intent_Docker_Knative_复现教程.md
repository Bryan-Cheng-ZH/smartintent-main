# smart-intent 项目复现教程（Docker Desktop + Knative）

> 适用对象：希望在本地快速跑通 `smart-intent` 系统的组员  
> 目标：按照我实际跑通项目的顺序，用 **Docker Desktop + Kubernetes + Knative** 把系统逐步部署起来，并能在前端完成联调。  
> 建议：**严格按顺序复现**，不要一开始就把所有服务一次性全开，否则很容易定位不到问题。

---

## 一、项目整体思路

这个项目本质上可以拆成 4 层：

1. **运行环境层**
   - Docker Desktop
   - Kubernetes
   - Knative Serving
   - Kourier
   - sslip.io 默认域名

2. **基础依赖层**
   - Redis
   - MongoDB

3. **核心链路层**
   - 各个后端设备微服务
   - aggregator
   - dispatcher
   - proxy-server
   - frontend

4. **高级功能层**
   - intent-server
   - recorder-service
   - rule-engine
   - mode-manager

---

## 二、推荐复现顺序

### 第一阶段：先验证 Knative 环境本身没问题

1. 打开 Docker Desktop
2. 开启 Kubernetes
3. 确认当前 kubectl 上下文是 `docker-desktop`
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
5. 打开前端，检查 `/all-status` 是否打通

### 第四阶段：再接入高级功能

最后再接：

- intent-server
- recorder-service
- rule-engine
- mode-manager

---

## 三、前置准备

### 1. 本机环境

建议提前准备好：

- Docker Desktop
- kubectl
- Python 3
- 浏览器（Chrome / Edge）
- Git

### 2. 项目代码

先把项目代码拉到本地，例如：

```bash
git clone https://github.com/ucd-soc2/smartintent.git
cd smartintent
```

如果你已经拿到了组内整理好的项目压缩包，也可以直接解压后进入项目目录。

---

## 四、第一阶段：配置 Docker Desktop + Kubernetes + Knative

---

### 4.1 启动 Docker Desktop

先打开 Docker Desktop，等它完全启动。

然后在设置里确认：

- Kubernetes 已启用
- Docker Desktop 自带集群正常运行

---

### 4.2 检查 kubectl 上下文

执行：

```bash
kubectl config current-context
```

正常应该看到：

```bash
docker-desktop
```

如果不是，就切换：

```bash
kubectl config use-context docker-desktop
```

---

### 4.3 安装 Knative Serving

> 版本不一定必须和我完全一样，但建议优先使用稳定版本。

安装 CRDs：

```bash
kubectl apply -f https://github.com/knative/serving/releases/download/knative-v1.21.1/serving-crds.yaml
```

安装 Knative Serving 核心组件：

```bash
kubectl apply -f https://github.com/knative/serving/releases/download/knative-v1.21.1/serving-core.yaml
```

---

### 4.4 安装 Kourier

安装 Kourier：

```bash
kubectl apply -f https://github.com/knative/net-kourier/releases/download/knative-v1.21.1/kourier.yaml
```

将 Kourier 设为默认 ingress：

```bash
kubectl patch configmap/config-network \
  -n knative-serving \
  --type merge \
  -p '{"data":{"ingress-class":"kourier.ingress.networking.knative.dev"}}'
```

---

### 4.5 配置默认域名为 sslip.io

执行：

```bash
kubectl apply -f https://github.com/knative/serving/releases/download/knative-v1.21.1/serving-default-domain.yaml
```

等待一会儿后检查：

```bash
kubectl get pods -n knative-serving
kubectl get pods -n kourier-system
```

如果都正常 Running，再继续。

---

### 4.6 验证 Knative 是否正常

查看服务：

```bash
kubectl get ksvc
```

此时即使还没有项目服务，也要确保 Knative 本身没有报错。

---

## 五、第二阶段：部署基础依赖（Redis + MongoDB）

这一阶段非常重要。  
我实际复现时遇到过的问题之一，就是 **Redis / MongoDB 存在旧环境残留，导致新服务虽然部署了，但实际连错对象或者根本没有 endpoints**。

所以建议：**先清理，再部署**。

---

### 5.1 如果之前部署过，先检查现有资源

```bash
kubectl get all
kubectl get svc
kubectl get deploy
kubectl get pods
```

重点查看是否已有：

- redis
- mongo / mongodb

---

### 5.2 如有旧资源，先删除

根据你本地实际资源名称删除，例如：

```bash
kubectl delete deployment redis --ignore-not-found
kubectl delete service redis --ignore-not-found

kubectl delete deployment mongo --ignore-not-found
kubectl delete service mongo --ignore-not-found
```

如果项目里本来就有对应 yaml，也可以重新 `apply` 覆盖，但我更建议先删干净。

---

### 5.3 部署 Redis 和 MongoDB

根据项目内的 yaml 部署。  
如果项目把这些配置单独放在某个目录中，就进入该目录执行。

示例：

```bash
kubectl apply -f redis.yaml
kubectl apply -f mongo.yaml
```

如果项目有目录形式：

```bash
kubectl apply -f Backend_Code/ -R
```

> 但更推荐前期分开部署，这样更容易定位问题。

---

### 5.4 验证 Redis / MongoDB 是否正常

查看：

```bash
kubectl get pods
kubectl get svc
kubectl get endpoints
```

重点确认：

1. Pod 是否是 `Running`
2. Service 是否存在
3. **Endpoints 不是空的**

例如检查 redis：

```bash
kubectl get svc redis
kubectl get endpoints redis
```

如果 `endpoints` 是空的，说明 service selector 没选中 pod，这种情况下上层服务会报连接失败。

---

## 六、第三阶段：部署核心链路

这一阶段是整个系统能不能跑通的关键。

推荐顺序：

1. 设备微服务
2. aggregator
3. dispatcher
4. proxy-server
5. frontend 联调

---

## 七、先部署设备微服务

设备微服务通常包括这类服务：

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

> 具体名字以你们项目目录中的 yaml 为准。

### 7.1 进入后端配置目录

例如：

```bash
cd Backend_Code
```

### 7.2 先部署设备服务

可以逐个 apply，也可以批量：

```bash
kubectl apply -f . -R
```

如果你想更稳一点，建议先只部署设备服务相关 yaml。

---

### 7.3 检查 Knative Service 状态

```bash
kubectl get ksvc
```

你希望看到设备服务都为：

```bash
READY   True
```

如果某个服务不是 True，继续看：

```bash
kubectl describe ksvc <服务名>
kubectl get pods
kubectl describe pod <pod名>
```

---

## 八、部署 aggregator

设备服务都正常后，再部署 aggregator。

### 8.1 部署 aggregator

```bash
kubectl apply -f aggregator.yaml
```

或者如果已经在总目录中统一 apply 了，就直接检查状态。

### 8.2 检查 aggregator 状态

```bash
kubectl get ksvc aggregator
kubectl describe ksvc aggregator
```

### 8.3 测试 aggregator 是否通

执行：

```bash
curl http://aggregator.default.127.0.0.1.sslip.io/all-status
```

正常情况下会返回一整份设备状态 JSON，例如包含：

- temperatureSensor
- airConditioner
- humidifier
- humiditySensor
- light
- tv
- coffeeMachine
- smartCurtains
- robotVacuum
- airPurifier
- pollutionSensor

如果这一步通了，说明：

- 设备微服务是通的
- aggregator 能正确汇总状态

这一步非常关键。

---

## 九、部署 dispatcher

aggregator 正常后，再部署 dispatcher。

### 9.1 部署 dispatcher

```bash
kubectl apply -f dispatcher.yaml
```

### 9.2 验证 dispatcher

```bash
kubectl get ksvc dispatcher
kubectl describe ksvc dispatcher
```

可以进一步用项目里已有接口测试执行动作。

---

## 十、部署 proxy-server

`proxy-server` 是前端真正主要访问的中间入口之一。  
很多前端页面里的接口其实都走它。

### 10.1 部署 proxy-server

```bash
kubectl apply -f proxy-server.yaml
```

### 10.2 检查状态

```bash
kubectl get ksvc proxy-server
kubectl describe ksvc proxy-server
```

### 10.3 测试接口

```bash
curl http://proxy-server.default.127.0.0.1.sslip.io/all-status
```

如果返回成功，说明：

- proxy-server 能访问 aggregator / dispatcher
- 前端后续联调有基础了

---

## 十一、前端联调：先测 `/all-status`

这一阶段不要急着先测语音、规则、模式切换这些高级功能。  
先确认最基础的前端页面能成功拿到后端状态。

---

### 11.1 启动前端静态服务器

进入前端目录，例如：

```bash
cd Frontend_Code
python3 -m http.server 5500
```

然后浏览器访问：

```text
http://127.0.0.1:5500/final_version.html
```

---

### 11.2 如果前端直接访问 Knative 域名有问题

这是我实际复现里遇到过的重点问题之一：

虽然下面这种地址从命令行 `curl` 可能能通：

```text
http://proxy-server.default.127.0.0.1.sslip.io
```

但前端页面里直接请求它时，可能仍然会出现：

- 502
- fail to fetch
- 页面无法显示 all-status
- 某些按钮无响应

这时我采用过一个**本地联调绕过方案**：

---

### 11.3 本地联调绕过方案：port-forward + 修改前端地址

#### 方法 A：将前端请求改到本地 127.0.0.1:8080

先找到 proxy-server 对应 pod：

```bash
kubectl get pods | grep proxy-server
```

然后执行端口转发：

```bash
kubectl port-forward pod/<proxy-server-pod-name> 8080:8080
```

> 注意：这里转发的是 **pod**，不是 `ksvc`。  
> 因为 Knative 的 service 往往**没有 selector**，所以你会遇到这种报错：

```bash
Service is defined without a selector
```

这也是为什么很多时候不能直接：

```bash
kubectl port-forward svc/proxy-server ...
```

---

#### 然后修改前端 HTML

把前端文件里原本类似：

```javascript
http://proxy-server.default.127.0.0.1.sslip.io
```

改成：

```javascript
http://127.0.0.1:8080
```

比如：

```javascript
http://127.0.0.1:8080/all-status
```

---

#### 再启动前端页面

一个终端运行：

```bash
kubectl port-forward pod/<proxy-server-pod-name> 8080:8080
```

另一个终端运行：

```bash
cd Frontend_Code
python3 -m http.server 5500
```

浏览器打开：

```text
http://127.0.0.1:5500/final_version_modify.html
```

---

### 11.4 如何判断这一步成功

你可以先命令行测试：

```bash
curl http://127.0.0.1:8080/all-status
```

如果这一步返回完整 JSON，说明本地代理链路是通的。

然后刷新前端页面，正常应能看到设备状态显示正常，说明前端和 proxy-server 打通了。

---

## 十二、第四阶段：再接入高级功能

当前端基础链路打通以后，再去接下面这些服务：

- intent-server
- recorder-service
- rule-engine
- mode-manager

**一定不要一开始就把这些复杂服务一起调。**

因为这些服务通常会引入：

- 额外镜像拉取问题
- LLM / intent 识别链路问题
- 语音录音/上传问题
- 规则执行问题
- 模式切换问题

如果基础链路都还没通，就会非常难排查。

---

## 十三、intent-server 接入建议

### 13.1 先检查镜像能否正常拉取

如果项目里用的是远程镜像，例如：

```text
docker.io/shidina/intent-server:v1
```

先观察：

```bash
kubectl get pods
kubectl describe pod <intent-server-pod>
```

如果卡在：

- ImagePullBackOff
- ErrImagePull

就说明是镜像拉取问题，而不是业务代码问题。

---

### 13.2 查看 ksvc 状态

```bash
kubectl get ksvc intent-server
kubectl describe ksvc intent-server
```

---

## 十四、recorder-service 接入建议

`recorder-service` 通常和前端语音输入相关。

如果你前端测试时发现：

- 第一次录音可以
- 点取消后再次录音失败
- 报 `fail to fetch`

说明要重点检查：

1. 前端录音状态是否正确重置
2. recorder-service 接口是否仍然可访问
3. 浏览器控制台有没有 CORS / fetch / 端口问题
4. 前端是否仍然调用了旧地址

---

## 十五、rule-engine 与 mode-manager 接入建议

这些属于“功能能不能自动执行”的部分。

例如你测试：

- “如果温度高于 25 度则拉开窗帘”
- 点击确认后页面不能进入下一步
- 或者能确认，但规则没有真正执行

就要分开检查两类问题：

### 15.1 前端交互问题

表现：

- 点击“确认”没有跳转
- 按钮无反应
- 页面状态不更新

通常要检查：

- 前端事件绑定
- 返回数据格式是否匹配
- 浏览器 console 日志

### 15.2 后端规则未真正生效

表现：

- 页面显示成功
- 但设备没有自动变化

这时要检查：

- rule-engine 是否真正收到规则
- mode-manager / dispatcher 是否真正执行了动作
- aggregator 返回的状态是否发生变化

例如可以反复测试：

```bash
curl http://aggregator.default.127.0.0.1.sslip.io/all-status
```

观察温度变化后设备状态是否联动变化。

---

## 十六、最推荐的检查命令清单

以下命令我在整个复现过程中非常常用。

### 16.1 看服务

```bash
kubectl get ksvc
kubectl get svc
kubectl get pods
kubectl get deploy
kubectl get endpoints
```

### 16.2 看详细信息

```bash
kubectl describe ksvc <服务名>
kubectl describe pod <pod名>
kubectl logs <pod名>
```

如果 pod 有多个 container，可以加：

```bash
kubectl logs <pod名> -c user-container
```

---

### 16.3 核心接口测试

```bash
curl http://aggregator.default.127.0.0.1.sslip.io/all-status
curl http://proxy-server.default.127.0.0.1.sslip.io/all-status
curl http://127.0.0.1:8080/all-status
```

---

### 16.4 查看 proxy-server pod

```bash
kubectl get pods | grep proxy-server
```

---

### 16.5 端口转发

```bash
kubectl port-forward pod/<proxy-server-pod-name> 8080:8080
```

---

## 十七、我实际踩过的坑总结

---

### 坑 1：Knative service 不能直接像普通 service 一样 port-forward

会报：

```bash
Service is defined without a selector
```

原因：Knative 的 service 机制和普通 Kubernetes Service 不一样。  
解决：**对 pod 做 port-forward，而不是对 ksvc / service 做。**

---

### 坑 2：Redis / MongoDB 有旧资源残留

表现：

- 服务看起来启动了
- 但实际连接失败
- 或者 selector 对不上

解决：

- 删除旧 deployment / service
- 重新部署
- 检查 endpoints 是否为空

---

### 坑 3：命令行 curl 能访问，但前端页面仍然 502 / fail to fetch

这类问题很常见。  
因为“命令行能通”不代表“浏览器页面环境下就一定能通”。

解决思路：

1. 先确认 `curl` 通
2. 再用本地 port-forward
3. 把前端请求地址改成 `127.0.0.1:8080`
4. 重新测试页面

---

### 坑 4：不要一开始就接 intent / recorder / rule-engine

这样会把问题混在一起。

正确做法：

1. 先通设备服务
2. 再通 aggregator
3. 再通 dispatcher
4. 再通 proxy-server
5. 再通前端 all-status
6. 最后再接高级功能

---

## 十八、最小跑通标准

如果你想判断自己是否已经“基本跑通”项目，可以看这几个标准：

### 基础跑通标准

- Docker Desktop 正常
- Kubernetes 正常
- Knative 正常
- `kubectl get ksvc` 大部分核心服务 READY=True
- `curl http://aggregator.default.127.0.0.1.sslip.io/all-status` 能返回完整 JSON
- `curl http://proxy-server.default.127.0.0.1.sslip.io/all-status` 能返回完整 JSON
- 前端页面能显示设备状态

### 完整跑通标准

在基础跑通之上，再满足：

- 前端可以发送控制命令
- intent-server 可识别文本/意图
- recorder-service 可完成语音输入
- rule-engine 可保存并执行规则
- mode-manager 可执行模式切换

---

## 十九、推荐的实际复现流程（最简版）

如果组员时间紧，可以直接按这个最短流程做：

### Step 1：环境

```bash
kubectl config current-context
kubectl get pods -A
```

确认是 `docker-desktop`。

### Step 2：Knative

安装：

- Knative Serving
- Kourier
- sslip.io 默认域名

### Step 3：基础依赖

部署：

- Redis
- MongoDB

并检查：

```bash
kubectl get endpoints
```

### Step 4：设备服务

部署所有设备微服务，直到：

```bash
kubectl get ksvc
```

大多数是 `READY=True`

### Step 5：aggregator

测试：

```bash
curl http://aggregator.default.127.0.0.1.sslip.io/all-status
```

### Step 6：dispatcher

部署并检查状态。

### Step 7：proxy-server

测试：

```bash
curl http://proxy-server.default.127.0.0.1.sslip.io/all-status
```

### Step 8：前端

启动静态页面：

```bash
python3 -m http.server 5500
```

如果直接访问 Knative 域名有问题：

```bash
kubectl port-forward pod/<proxy-server-pod-name> 8080:8080
```

并把前端请求地址改成：

```text
http://127.0.0.1:8080
```

### Step 9：高级功能

最后再接：

- intent-server
- recorder-service
- rule-engine
- mode-manager

---

## 二十、建议组员复现时的工作习惯

1. **每完成一层就立刻测试，不要堆着一起测**
2. **优先用 curl 验证接口，再看前端**
3. **只要出现异常，先看 `kubectl get ksvc / pods / endpoints`**
4. **前端有问题时，同时打开浏览器 console**
5. **如果 Knative 域名联调不稳定，优先用 pod port-forward 本地绕过**

---

## 二十一、结语

这个项目真正难的地方，不是单个服务本身，而是：

- Knative 链路
- 中间依赖（Redis/MongoDB）
- 前后端联调
- 多服务之间的调用顺序

所以最重要的是：

> **分阶段、按顺序、一层一层验证。**

不要跳步骤。  
只要你先把：

- 设备服务
- aggregator
- dispatcher
- proxy-server
- 前端 `/all-status`

这条链路打通，后面的 intent、语音、规则，其实就只是继续往上叠功能。

---

## 二十二、附：我最常用的一组命令

```bash
kubectl config current-context

kubectl get pods
kubectl get svc
kubectl get deploy
kubectl get ksvc
kubectl get endpoints

kubectl describe ksvc aggregator
kubectl describe ksvc proxy-server

kubectl get pods | grep proxy-server
kubectl port-forward pod/<proxy-server-pod-name> 8080:8080

curl http://aggregator.default.127.0.0.1.sslip.io/all-status
curl http://proxy-server.default.127.0.0.1.sslip.io/all-status
curl http://127.0.0.1:8080/all-status

cd Frontend_Code
python3 -m http.server 5500
```

---

## 二十三、适合转发给组员的话

可以直接把下面这段发给组员：

> 请严格按教程顺序复现：先 Knative 环境、再 Redis/MongoDB、再设备服务、再 aggregator、再 dispatcher、再 proxy-server、最后才是 intent / recorder / rule-engine / mode-manager。  
> 不要一开始就全开。  
> 先用 curl 测通 `/all-status`，再测前端。  
> 如果前端请求 Knative 域名不稳定，就对 proxy-server 的 pod 做 port-forward，并把前端请求临时改到 `127.0.0.1:8080`。

---
