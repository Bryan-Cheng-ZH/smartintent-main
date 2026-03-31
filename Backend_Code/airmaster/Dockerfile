FROM node:14

WORKDIR /app

COPY package*.json ./

RUN npm install --production

COPY . .

EXPOSE 3000

# 启动微服务
CMD [ "node", "airmaster_service.js" ]