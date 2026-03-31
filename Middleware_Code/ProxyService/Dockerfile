# 使用官方 Node.js 镜像
FROM node:18-slim

# 创建应用目录
WORKDIR /app

# 复制 package.json 和 package-lock.json（如果有）
COPY package*.json ./

# 安装依赖
RUN npm install

# 复制应用代码
COPY . .

# 暴露端口（Knative 会自动检测到）
EXPOSE 8080

# 启动应用
CMD ["node", "proxy-server.js"]