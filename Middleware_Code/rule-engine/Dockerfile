FROM node:18

# 创建工作目录
WORKDIR /app

# 拷贝 package.json 和 package-lock.json（如果有）
COPY package*.json ./

# 安装依赖（这里会安装 mongoose！）
RUN npm install

# 拷贝剩下的所有代码
COPY . .

# 启动服务
CMD ["node", "rule-engine.js"]