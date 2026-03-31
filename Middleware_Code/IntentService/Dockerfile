# 使用轻量级 Python 镜像
FROM python:3.9-slim

# 设置工作目录
WORKDIR /app

# 复制当前目录所有文件到容器内
COPY . /app

# 安装依赖
RUN pip install --no-cache-dir flask requests openai

# 开放 5050 端口（给 Knative 用）
EXPOSE 5050

# 设置启动命令
CMD ["python", "intent_server.py"]