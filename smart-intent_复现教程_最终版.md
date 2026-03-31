# smart-intent 复现教程（Docker + Knative｜真实踩坑版）

> 本教程完全基于实际复现过程整理（包含 infra-clean.yaml + nodes + port-forward 方案）

---

## 一、复现顺序（必须严格执行）

1. Knative 环境验证
2. 基础依赖（infra-clean.yaml）
3. 核心链路（设备 → aggregator → dispatcher → proxy）
4. 前端 /all-status 打通
5. 高级功能（intent / rule / recorder）

---

## 二、环境准备

```bash
kubectl config current-context
kubectl get nodes
```

必须看到：

```bash
docker-desktop   Ready
```

---

## 三、Knative 安装

```bash
kubectl apply -f https://github.com/knative/serving/releases/download/knative-v1.21.1/serving-crds.yaml
kubectl apply -f https://github.com/knative/serving/releases/download/knative-v1.21.1/serving-core.yaml
kubectl apply -f https://github.com/knative/net-kourier/releases/download/knative-v1.21.1/kourier.yaml
```

```bash
kubectl patch configmap/config-network -n knative-serving \
--type merge \
-p '{"data":{"ingress-class":"kourier.ingress.networking.knative.dev"}}'
```

```bash
kubectl apply -f https://github.com/knative/serving/releases/download/knative-v1.21.1/serving-default-domain.yaml
```

---

## 四、基础依赖（关键）

### 1. 清理旧环境

```bash
kubectl delete deployment redis --ignore-not-found
kubectl delete service redis --ignore-not-found
kubectl delete deployment rule-mongo --ignore-not-found
kubectl delete service rule-mongo --ignore-not-found
```

---

### 2. 部署（你实际使用的）

```bash
kubectl apply -f smartintent-infra-clean.yaml
```

---

### 3. 验证

```bash
kubectl get pods
kubectl get svc
kubectl get endpoints
```

必须 endpoints 非空：

```bash
redis        10.x.x.x:6379
rule-mongo   10.x.x.x:27017
```

---

## 五、核心链路

```bash
kubectl apply -f Backend_Code/ -R
```

---

### 测试 aggregator

```bash
curl http://aggregator.default.127.0.0.1.sslip.io/all-status
```

---

### proxy-server

```bash
curl http://proxy-server.default.127.0.0.1.sslip.io/all-status
```

---

## 六、前端（关键坑）

### port-forward

```bash
kubectl get pods | grep proxy-server
kubectl port-forward pod/<proxy-pod> 8080:8080
```

---

### 修改前端

```text
http://127.0.0.1:8080
```

---

### 启动

```bash
cd Frontend_Code
python3 -m http.server 5500
```

---

### 测试

```bash
curl http://127.0.0.1:8080/all-status
```

---

## 七、最后再接高级功能

- intent-server
- recorder-service
- rule-engine
- mode-manager

---

## 八、核心经验

- 先 `/all-status`
- 再前端
- 再智能功能

---

