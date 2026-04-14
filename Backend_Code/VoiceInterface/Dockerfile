FROM python:3.9-slim-bookworm

# ⭐ 修改 debian.sources 里的源
RUN sed -i 's|http://deb.debian.org|http://mirrors.aliyun.com|g' /etc/apt/sources.list.d/debian.sources

# 安装依赖
RUN apt-get update && \
    apt-get install -y portaudio19-dev ffmpeg && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . /app

RUN pip install --no-cache-dir -r requirements.txt

EXPOSE 5001

CMD ["python", "recorder_service_new_stable.py"]