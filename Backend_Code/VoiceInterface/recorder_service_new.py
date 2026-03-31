from flask import Flask, jsonify
import os
import re
import signal
import subprocess
import threading
from pathlib import Path
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

recording_process = None
recognized_text = ""
last_stdout = ""
last_stderr = ""

BASE_DIR = Path(__file__).resolve().parent
WHISPER_SCRIPT = BASE_DIR / "whisper_online.py"
PYTHON_BIN = os.environ.get("VOICE_PYTHON", "python")
WHISPER_MODEL = os.environ.get("WHISPER_MODEL", "base")
WHISPER_LANG = os.environ.get("WHISPER_LANG", "zh")
MIN_CHUNK_SIZE = os.environ.get("MIN_CHUNK_SIZE", "1.0")
EXTRA_ARGS = os.environ.get("WHISPER_EXTRA_ARGS", "").split()


def extract_recognized_text(stdout_text: str) -> str:
    matches = re.findall(r"Final Recognized:\s*(.*)", stdout_text)
    matches = [m.strip() for m in matches if m.strip()]
    return " ".join(matches).strip()


@app.route("/startRecording", methods=["POST"])
def start_recording():
    global recording_process, recognized_text, last_stdout, last_stderr

    if recording_process is not None and recording_process.poll() is None:
        return jsonify({"error": "Recording is already running."}), 400

    recognized_text = ""
    last_stdout = ""
    last_stderr = ""

    cmd = [
        PYTHON_BIN,
        str(WHISPER_SCRIPT),
        "--mic",
        "--backend",
        "faster-whisper",
        "--model",
        WHISPER_MODEL,
        "--lan",
        WHISPER_LANG,
        "--min_chunk_size",
        str(MIN_CHUNK_SIZE),
    ]
    cmd.extend(EXTRA_ARGS)

    try:
        recording_process = subprocess.Popen(
            cmd,
            cwd=str(BASE_DIR),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
        )
    except Exception as e:
        recording_process = None
        return jsonify({"error": f"Failed to start recorder: {e}"}), 500

    return jsonify({
        "status": "ok",
        "message": "Start Recording...",
        "backend": "faster-whisper",
        "model": WHISPER_MODEL,
        "language": WHISPER_LANG,
    })


@app.route("/stopRecording", methods=["POST"])
def stop_recording():
    global recording_process, recognized_text, last_stdout, last_stderr

    if recording_process is None:
        return jsonify({"error": "Do Not Recording."}), 400

    if recording_process.poll() is not None:
        stdout_data, stderr_data = recording_process.communicate()
        last_stdout = stdout_data or ""
        last_stderr = stderr_data or ""
        recognized_text = extract_recognized_text(last_stdout)
        recording_process = None
        return jsonify({
            "recognizedText": recognized_text,
            "stdout": last_stdout,
            "stderr": last_stderr,
        })

    try:
        recording_process.send_signal(signal.SIGINT)
    except Exception as e:
        return jsonify({"error": f"Failed to stop recording process: {e}"}), 500

    def wait_for_process():
        nonlocal_stdout = ""
        nonlocal_stderr = ""
        global recognized_text, last_stdout, last_stderr, recording_process
        try:
            stdout_data, stderr_data = recording_process.communicate(timeout=20)
            nonlocal_stdout = stdout_data or ""
            nonlocal_stderr = stderr_data or ""
        except subprocess.TimeoutExpired:
            recording_process.kill()
            stdout_data, stderr_data = recording_process.communicate()
            nonlocal_stdout = stdout_data or ""
            nonlocal_stderr = (stderr_data or "") + "\n[recorder_service_new] Process killed after timeout."
        finally:
            last_stdout = nonlocal_stdout
            last_stderr = nonlocal_stderr
            print("=== STDOUT ===")
            print(last_stdout)
            print("=== STDERR ===")
            print(last_stderr)
            recognized_text = extract_recognized_text(last_stdout)
            recording_process = None

    t = threading.Thread(target=wait_for_process)
    t.start()
    t.join(timeout=25)

    return jsonify({
        "recognizedText": recognized_text,
        "stdout": last_stdout,
        "stderr": last_stderr,
    })


@app.route("/voiceDebug", methods=["GET"])
def voice_debug():
    return jsonify({
        "recognizedText": recognized_text,
        "stdout": last_stdout,
        "stderr": last_stderr,
        "isRunning": recording_process is not None and recording_process.poll() is None,
        "backend": "faster-whisper",
        "model": WHISPER_MODEL,
        "language": WHISPER_LANG,
    })


if __name__ == "__main__":
    app.run(port=5001, debug=True)
