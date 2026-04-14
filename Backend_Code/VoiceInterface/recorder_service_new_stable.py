from __future__ import annotations

import io
import os
import threading
import time
from typing import List, Optional
# 新加的
import tempfile
import subprocess

import numpy as np
import sounddevice as sd
from faster_whisper import WhisperModel
from flask import Flask, jsonify, request
from flask_cors import CORS
from opencc import OpenCC

cc = OpenCC("t2s")
app = Flask(__name__)
CORS(app)
#显示中文
app.config["JSON_AS_ASCII"] = False
app.json.ensure_ascii = False

# ===== Config =====
SAMPLE_RATE = int(os.getenv("STT_SAMPLE_RATE", "16000"))
CHANNELS = int(os.getenv("STT_CHANNELS", "1"))
MODEL_NAME = os.getenv("STT_MODEL", "small")
# LANGUAGE = os.getenv("STT_LANGUAGE", "zh")
#调整自动识别语言
LANGUAGE = os.getenv("STT_LANGUAGE", "auto").strip().lower()
COMPUTE_TYPE = os.getenv("STT_COMPUTE_TYPE", "float32")
DEVICE = os.getenv("STT_DEVICE", "cpu")

# ===== State =====
state_lock = threading.Lock()
audio_chunks: List[np.ndarray] = []
recording_stream: Optional[sd.InputStream] = None
is_recording = False
recognized_text = ""
last_stdout = ""
last_stderr = ""
recording_started_at: Optional[float] = None
model_ready = False
model_loading_error = ""
last_audio_seconds = 0.0

# ===== Model preload =====
model: Optional[WhisperModel] = None


def append_log(target: str, message: str) -> None:
    global last_stdout, last_stderr
    timestamp = time.strftime("%H:%M:%S")
    line = f"[{timestamp}] {message}"
    with state_lock:
        if target == "stdout":
            last_stdout = (last_stdout + "\n" + line).strip()
        else:
            last_stderr = (last_stderr + "\n" + line).strip()


def preload_model() -> None:
    global model, model_ready, model_loading_error
    try:
        append_log("stdout", f"Loading faster-whisper model: {MODEL_NAME}")
        model = WhisperModel(
            MODEL_NAME,
            device=DEVICE,
            compute_type=COMPUTE_TYPE,
        )
        # Warm-up with silence to reduce first-use latency.
        silence = np.zeros(SAMPLE_RATE, dtype=np.float32)
        warmup_language = resolve_language()
        append_log("stdout", f"Warm-up language mode: {warmup_language or 'auto'}")
        segments, _info = model.transcribe(
            silence,
            language=warmup_language,
            vad_filter=False,
            beam_size=1,
        )
        list(segments)
        model_ready = True
        model_loading_error = ""
        append_log("stdout", "Model ready.")
    except Exception as e:  # pragma: no cover
        model_ready = False
        model_loading_error = repr(e)
        append_log("stderr", f"Model preload failed: {repr(e)}")


def audio_callback(indata, frames, time_info, status) -> None:
    del frames, time_info
    if status:
        append_log("stderr", f"Audio callback status: {status}")
    with state_lock:
        if is_recording:
            audio_chunks.append(indata.copy())


def extract_text(segments) -> str:
    parts = []
    for seg in segments:
        text = (seg.text or "").strip()
        if text:
            parts.append(text)
    merged = "".join(parts).strip()
    return merged

def to_simplified(text: str) -> str:
    if not text:
        return text
    return cc.convert(text)

def resolve_language():
    """
    返回给 faster-whisper 的 language 参数：
    - 当 LANGUAGE 是 auto / 空字符串 / none 时，返回 None，表示自动检测
    - 否则返回具体语言代码，比如 zh / en
    """
    if LANGUAGE in ("", "auto", "none", "null"):
        return None
    return LANGUAGE


@app.route("/startRecording", methods=["POST"])
def start_recording():
    global recording_stream, is_recording, audio_chunks, recognized_text, recording_started_at
    global last_stdout, last_stderr, last_audio_seconds

    with state_lock:
        if is_recording:
            return jsonify({"error": "Already recording."}), 400

        recognized_text = ""
        last_stdout = ""
        last_stderr = ""
        last_audio_seconds = 0.0

    if not model_ready:
        if model_loading_error:
            return jsonify(
                {
                    "error": "Model is not ready.",
                    "details": model_loading_error,
                    "model": MODEL_NAME,
                    "language": LANGUAGE,
                }
            ), 500
        return jsonify(
            {
                "error": "Model is still warming up.",
                "model": MODEL_NAME,
                "language": LANGUAGE,
            }
        ), 503

    try:
        stream = sd.InputStream(
            samplerate=SAMPLE_RATE,
            channels=CHANNELS,
            dtype="float32",
            callback=audio_callback,
        )
        # stream.start()
    except Exception as e:
        append_log("stderr", f"Failed to start microphone: {repr(e)}")
        return jsonify({"error": "Failed to start microphone.", "details": repr(e)}), 500

    with state_lock:
        recording_stream = stream
        audio_chunks = []
        is_recording = True
        recording_started_at = time.time()

        stream.start()

    append_log("stdout", "Recording started.")
    return jsonify(
        {
            "status": "ok",
            "message": "Start Recording...",
            "backend": "faster-whisper-direct",
            "model": MODEL_NAME,
            "language": LANGUAGE,
        }
    )


@app.route("/stopRecording", methods=["POST"])
def stop_recording():
    global recording_stream, is_recording, recognized_text, last_audio_seconds

    with state_lock:
        if not is_recording:
            return jsonify({"error": "Not recording."}), 400
        stream = recording_stream
        recording_stream = None
        is_recording = False
        started_at = recording_started_at

    try:
        if stream is not None:
            stream.stop()
            stream.close()
    except Exception as e:
        append_log("stderr", f"Failed to stop microphone cleanly: {repr(e)}")

    with state_lock:
        local_chunks = list(audio_chunks)
        audio_chunks.clear()

    if not local_chunks:
        append_log("stderr", "No audio frames captured.")
        return jsonify(
            {
                "recognizedText": "",
                "error": "No audio captured.",
                "stdout": last_stdout,
                "stderr": last_stderr,
            }
        ), 200

    audio = np.concatenate(local_chunks, axis=0).reshape(-1).astype(np.float32)
    last_audio_seconds = len(audio) / SAMPLE_RATE
    append_log("stdout", f"Captured audio length: {last_audio_seconds:.2f}s")

    try:
        transcribe_language = resolve_language()
        append_log("stdout", f"Transcribe language mode: {transcribe_language or 'auto'}")
        segments, info = model.transcribe(
            audio,
            language=transcribe_language,
            vad_filter=True,
            beam_size=5,
            condition_on_previous_text=False,
            initial_prompt="智能家居语音指令，常见词包括：打开，关闭，客厅，卧室，空调，灯，窗帘，电视，加湿器。",
        )
        recognized_text = extract_text(segments)
        # recognized_text = to_simplified(recognized_text)
        detected_language = getattr(info, "language", None)
        detected_probability = getattr(info, "language_probability", None)

        if detected_language in ("zh", "zh-cn", "zh-tw"):
            recognized_text = to_simplified(recognized_text)

        append_log(
            "stdout",
            f"Transcription finished. text={recognized_text!r}, detected_language={detected_language}, probability={detected_probability}",
        )
    except Exception as e:
        recognized_text = ""
        append_log("stderr", f"Transcription failed: {repr(e)}")
        return jsonify(
            {
                "recognizedText": "",
                "error": "Transcription failed.",
                "stdout": last_stdout,
                "stderr": last_stderr,
            }
        ), 500

    return jsonify(
        {
            "recognizedText": recognized_text,
            "stdout": last_stdout,
            "stderr": last_stderr,
            "audioSeconds": round(last_audio_seconds, 2),
            "model": MODEL_NAME,
            "language": LANGUAGE,
            "recordingSeconds": None if started_at is None else round(time.time() - started_at, 2),
        }
    )

#new
@app.route("/transcribe", methods=["POST"])
def transcribe_audio():
    global recognized_text, last_audio_seconds, last_stdout, last_stderr

    with state_lock:
        recognized_text = ""
        last_stdout = ""
        last_stderr = ""
        last_audio_seconds = 0.0

    if not model_ready:
        if model_loading_error:
            return jsonify(
                {
                    "error": "Model is not ready.",
                    "details": model_loading_error,
                    "model": MODEL_NAME,
                    "language": LANGUAGE,
                }
            ), 500
        return jsonify(
            {
                "error": "Model is still warming up.",
                "model": MODEL_NAME,
                "language": LANGUAGE,
            }
        ), 503

    if "audio" not in request.files:
        return jsonify({"error": "Missing audio file field: audio"}), 400

    file = request.files["audio"]

    if not file or not file.filename:
        return jsonify({"error": "No audio file uploaded."}), 400

    temp_input_path = None
    temp_wav_path = None

    try:
        # with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as temp_input:
        #     file.save(temp_input)
        #     temp_input_path = temp_input.name
        original_ext = os.path.splitext(file.filename)[1] or ".webm"

        with tempfile.NamedTemporaryFile(delete=False, suffix=original_ext) as temp_input:
            file.save(temp_input)
            temp_input_path = temp_input.name

        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as temp_wav:
            temp_wav_path = temp_wav.name

        cmd = [
            "ffmpeg",
            "-y",
            "-i", temp_input_path,
            "-ar", str(SAMPLE_RATE),
            "-ac", str(CHANNELS),
            "-f", "wav",
            temp_wav_path
        ]

        subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=True
        )

        append_log("stdout", "Audio file converted by ffmpeg successfully.")

        import wave

        with wave.open(temp_wav_path, "rb") as wf:
            n_channels = wf.getnchannels()
            sampwidth = wf.getsampwidth()
            framerate = wf.getframerate()
            n_frames = wf.getnframes()
            raw_data = wf.readframes(n_frames)

        if sampwidth != 2:
            return jsonify({"error": f"Unsupported sample width: {sampwidth}"}), 400

        audio = np.frombuffer(raw_data, dtype=np.int16).astype(np.float32) / 32768.0

        if n_channels > 1:
            audio = audio.reshape(-1, n_channels).mean(axis=1)

        last_audio_seconds = len(audio) / float(framerate)
        append_log("stdout", f"Uploaded audio length: {last_audio_seconds:.2f}s")

        transcribe_language = resolve_language()
        append_log("stdout", f"Transcribe language mode: {transcribe_language or 'auto'}")

        segments, info = model.transcribe(
            audio,
            language=transcribe_language,
            vad_filter=True,
            beam_size=5,
            condition_on_previous_text=False,
            initial_prompt="智能家居语音指令，常见词包括：打开，关闭，客厅，卧室，空调，灯，窗帘，电视，加湿器。",
        )

        recognized_text = extract_text(segments)

        detected_language = getattr(info, "language", None)
        detected_probability = getattr(info, "language_probability", None)

        if detected_language in ("zh", "zh-cn", "zh-tw"):
            recognized_text = to_simplified(recognized_text)

        append_log(
            "stdout",
            f"Transcription finished. text={recognized_text!r}, detected_language={detected_language}, probability={detected_probability}",
        )

        return jsonify(
            {
                "recognizedText": recognized_text,
                "stdout": last_stdout,
                "stderr": last_stderr,
                "audioSeconds": round(last_audio_seconds, 2),
                "model": MODEL_NAME,
                "language": LANGUAGE,
            }
        )

    except subprocess.CalledProcessError as e:
        append_log("stderr", f"ffmpeg convert failed: {e.stderr.decode(errors='ignore')}")
        return jsonify(
            {
                "error": "Audio conversion failed.",
                "stdout": last_stdout,
                "stderr": last_stderr,
            }
        ), 500

    except Exception as e:
        append_log("stderr", f"Transcription failed: {repr(e)}")
        return jsonify(
            {
                "error": "Transcription failed.",
                "details": repr(e),
                "stdout": last_stdout,
                "stderr": last_stderr,
            }
        ), 500

    finally:
        for path in [temp_input_path, temp_wav_path]:
            if path and os.path.exists(path):
                try:
                    os.remove(path)
                except Exception:
                    pass

@app.route("/voiceDebug", methods=["GET"])
def voice_debug():
    with state_lock:
        return jsonify(
            {
                "backend": "faster-whisper-direct",
                "model": MODEL_NAME,
                "language": LANGUAGE,
                "sampleRate": SAMPLE_RATE,
                "channels": CHANNELS,
                "isRunning": is_recording,
                "modelReady": model_ready,
                "modelLoadingError": model_loading_error,
                "recognizedText": recognized_text,
                "audioSeconds": round(last_audio_seconds, 2),
                "stdout": last_stdout,
                "stderr": last_stderr,
            }
        )


if __name__ == "__main__":
    preload_model()
    # app.run(host="127.0.0.1", port=5001, debug=True)
    # app.run(host="0.0.0.0", port=5001, debug=True)
    app.run(host="0.0.0.0", port=5001, debug=False, use_reloader=False)
