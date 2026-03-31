FROM python:3.9-slim

# 安装系统依赖
RUN apt-get update && \
    apt-get install -y portaudio19-dev && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# 设置工作目录
WORKDIR /app

# 复制代码
COPY . /app

# 安装 Python 依赖
RUN pip install --no-cache-dir -r requirements.txt

# 开放端口
EXPOSE 5001

# 启动服务
CMD ["python", "recorder_service.py"]