#!/bin/bash
set -e

ACR_SERVER="crpi-cn1s409pxj9e0zxn.cn-hangzhou.personal.cr.aliyuncs.com"
NAMESPACE="smartintent"
TAG="v1"

deploy_service () {
  LOCAL_DIR="$1"
  LOCAL_IMAGE="$2"
  REMOTE_NAME="$3"
  SERVICE_NAME="$4"

  echo "========================================"
  echo "Processing $SERVICE_NAME"
  echo "========================================"

  cd ~/smartintent-main/Backend_Code/"$LOCAL_DIR"

  docker build -t "$LOCAL_IMAGE" .
  docker tag "$LOCAL_IMAGE" "$ACR_SERVER/$NAMESPACE/$REMOTE_NAME:$TAG"
  docker push "$ACR_SERVER/$NAMESPACE/$REMOTE_NAME:$TAG"

  kubectl apply -f - <<EOF
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: $SERVICE_NAME
  namespace: default
spec:
  template:
    metadata:
      annotations:
        redeploy-timestamp: "$(date +%s)-$SERVICE_NAME"
    spec:
      containerConcurrency: 0
      imagePullSecrets:
        - name: acr-secret
      containers:
        - image: $ACR_SERVER/$NAMESPACE/$REMOTE_NAME:$TAG
          ports:
            - containerPort: 3000
EOF

  echo "$SERVICE_NAME done"
  echo
}

deploy_service "airpurifiermaster" "airpurifiermaster" "airpurifier-microservice" "airpurifier-microservice"
deploy_service "coffeemaster" "coffeemaster" "coffee-machine-microservice" "coffee-machine-microservice"
deploy_service "humidifiermaster" "humidifiermaster" "humidifier-microservice" "humidifier-microservice"
deploy_service "humiditymaster" "humiditymaster" "humidity-sensor" "humidity-sensor"
deploy_service "pollutionmaster" "pollutionmaster" "pollution-sensor" "pollution-sensor"
deploy_service "vacuummaster" "vacuummaster" "robot-vacuum-microservice" "robot-vacuum-microservice"
deploy_service "curtainsmaster" "curtainsmaster" "smart-curtains-microservice" "smart-curtains-microservice"
deploy_service "tempmaster" "tempmaster" "temperature-sensor" "temperature-sensor"
deploy_service "tvmaster" "tvmaster" "tv-microservice" "tv-microservice"

echo "========================================"
echo "All done. Current KService status:"
echo "========================================"
kubectl get ksvc
