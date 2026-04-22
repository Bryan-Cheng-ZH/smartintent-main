#!/bin/bash

set -e

ACR_SERVER="crpi-cn1s409pxj9e0zxn.cn-hangzhou.personal.cr.aliyuncs.com"
NAMESPACE="smartintent"
TAG="v1"

declare -A SERVICES=(
  ["light-microservice"]="light-microservice"
  ["airconditioner-microservice"]="airconditioner-microservice"
  ["airpurifier-microservice"]="airpurifier-microservice"
  ["coffee-machine-microservice"]="coffee-machine-microservice"
  ["humidifier-microservice"]="humidifier-microservice"
  ["humidity-sensor"]="humidity-sensor"
  ["pollution-sensor"]="pollution-sensor"
  ["robot-vacuum-microservice"]="robot-vacuum-microservice"
  ["smart-curtains-microservice"]="smart-curtains-microservice"
  ["temperature-sensor"]="temperature-sensor"
  ["tv-microservice"]="tv-microservice"
)

for SERVICE in "${!SERVICES[@]}"; do
  IMAGE_NAME="${SERVICES[$SERVICE]}"
  IMAGE="${ACR_SERVER}/${NAMESPACE}/${IMAGE_NAME}:${TAG}"

  echo "Deploying ${SERVICE}"
  echo "Image: ${IMAGE}"

  cat <<EOF | kubectl apply -f -
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: ${SERVICE}
  namespace: default
spec:
  template:
    spec:
      containerConcurrency: 0
      imagePullSecrets:
        - name: acr-secret
      containers:
        - image: ${IMAGE}
          ports:
            - containerPort: 3000
EOF

done

kubectl get ksvc
