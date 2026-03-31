# recorder_service.py (假设你在这儿写后端接口)
from flask import Flask, request, jsonify
import subprocess
import time
import signal
import threading
from flask_cors import CORS

app = Flask(__name__)
CORS(app)  # 让所有路由默认允许跨域

# 全局存一下进程对象和识别结果
recording_process = None
recognized_text = ""


@app.route("/startRecording", methods=["POST"])
def start_recording():
    global recording_process, recognized_text
    recognized_text = ""  # 清空
    # 假设你改写了 whisper-online.py，让它把识别完的文本写到某个文件 /tmp/final_result.txt
    # 或者直接用 stdout
    # 启动它:
    recording_process = subprocess.Popen(
        ["python", "whisper_online.py", "--mic", "--backend", "openai-api"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE
    )
    return jsonify({"status": "ok", "message": "Start Recording..."})


@app.route("/stopRecording", methods=["POST"])
def stop_recording():
    global recording_process, recognized_text
    if recording_process is None:
        return jsonify({"error": "Do Not Recording."}), 400

    # 给它发送 Ctrl+C 信号
    recording_process.send_signal(signal.SIGINT)

    # 等待进程退出
    # def wait_for_process():
    #     global recognized_text
    #     stdout_data, stderr_data = recording_process.communicate()
    #     # 这里你要在 stdout_data 里解析出最终识别文本
    #     # 取决于你如何在 whisper-online.py 里打印/保存最后结果
    #     # 假设它最后会输出一行: "Final Recognized: XXX"
    #     # 这里就简单地查找一下
    #     for line in stdout_data.decode("utf-8").split("\n"):
    #         if line.startswith("Final Recognized:"):
    #             recognized_text = line.replace("Final Recognized:", "").strip()

    #     recording_process.wait()

    def wait_for_process():
        global recognized_text, recording_process
        stdout_data, stderr_data = recording_process.communicate()

        print("=== STDOUT ===")
        print(stdout_data.decode("utf-8", errors="ignore"))
        print("=== STDERR ===")
        print(stderr_data.decode("utf-8", errors="ignore"))

        for line in stdout_data.decode("utf-8", errors="ignore").split("\n"):
            if line.startswith("Final Recognized:"):
                recognized_text = line.replace("Final Recognized:", "").strip()

        recording_process.wait()


    t = threading.Thread(target=wait_for_process)
    t.start()
    t.join(timeout=10)
    # 最后把 recognized_text 返回
    return jsonify({"recognizedText": recognized_text})


if __name__ == '__main__':
    app.run(port=5001, debug=True)