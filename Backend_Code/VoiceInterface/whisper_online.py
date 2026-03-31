#!/usr/bin/env python3
import sys
import numpy as np
import time
import io
import soundfile as sf
import math
import sounddevice as sd
from functools import lru_cache
from queue import Queue
import requests

print(sd.query_devices())

# ========== 以下是你原先定义的 ASR/转录相关类和函数 ==========

import sys
sys.stdout.reconfigure(encoding='utf-8')


@lru_cache
def load_audio(fname):
    # 与麦克风模式无关，保留以兼容之前的代码
    import librosa
    a, _ = librosa.load(fname, sr=16000, dtype=np.float32)
    return a

def load_audio_chunk(fname, beg, end):
    # 在麦克风模式中不再使用，可保留或删除
    audio = load_audio(fname)
    beg_s = int(beg*16000)
    end_s = int(end*16000)
    return audio[beg_s:end_s]


class ASRBase:
    sep = " "  # …

    def __init__(self, lan, modelsize=None, cache_dir=None, model_dir=None, logfile=sys.stderr):
        self.logfile = logfile
        self.transcribe_kargs = {}
        if lan == "auto":
            self.original_language = None
        else:
            self.original_language = lan
        self.model = self.load_model(modelsize, cache_dir, model_dir)

    def load_model(self, modelsize, cache_dir, model_dir=None):
        raise NotImplementedError("must be implemented in the child class")

    def transcribe(self, audio, init_prompt=""):
        raise NotImplementedError("must be implemented in the child class")

    def use_vad(self):
        raise NotImplementedError("must be implemented in the child class")


class WhisperTimestampedASR(ASRBase):
    sep = " "

    def load_model(self, modelsize=None, cache_dir=None, model_dir=None):
        import whisper
        import whisper_timestamped
        from whisper_timestamped import transcribe_timestamped
        self.transcribe_timestamped = transcribe_timestamped
        if model_dir is not None:
            print(f"ignoring model_dir, not implemented", file=self.logfile)
        return whisper.load_model(modelsize, download_root=cache_dir)

    def transcribe(self, audio, init_prompt=""):
        result = self.transcribe_timestamped(
            self.model,
            audio, 
            language=self.original_language,
            initial_prompt=init_prompt,
            verbose=None,
            condition_on_previous_text=True,
            **self.transcribe_kargs
        )
        return result

    def ts_words(self, r):
        o = []
        for s in r["segments"]:
            for w in s["words"]:
                t = (w["start"], w["end"], w["text"])
                o.append(t)
        return o

    def segments_end_ts(self, res):
        return [s["end"] for s in res["segments"]]

    def use_vad(self):
        self.transcribe_kargs["vad"] = True

    def set_translate_task(self):
        self.transcribe_kargs["task"] = "translate"


class FasterWhisperASR(ASRBase):
    sep = ""

    def load_model(self, modelsize=None, cache_dir=None, model_dir=None):
        from faster_whisper import WhisperModel
        if model_dir is not None:
            print(f"Loading whisper model from model_dir {model_dir}. modelsize and cache_dir parameters are not used.",
                  file=self.logfile)
            model_size_or_path = model_dir
        elif modelsize is not None:
            model_size_or_path = modelsize
        else:
            raise ValueError("必须设置 modelsize 或 model_dir 参数")

        model = WhisperModel(model_size_or_path, device="cpu", compute_type="float32", download_root=cache_dir)
        return model

    def transcribe(self, audio, init_prompt=""):
        segments, info = self.model.transcribe(
            audio,
            language=self.original_language,
            initial_prompt=init_prompt,
            beam_size=5,
            word_timestamps=True,
            condition_on_previous_text=True,
            **self.transcribe_kargs
        )
        return list(segments)

    def ts_words(self, segments):
        o = []
        for segment in segments:
            for word in segment.words:
                w = word.word
                t = (word.start, word.end, w)
                o.append(t)
        return o

    def segments_end_ts(self, res):
        return [s.end for s in res]

    def use_vad(self):
        self.transcribe_kargs["vad_filter"] = True

    def set_translate_task(self):
        self.transcribe_kargs["task"] = "translate"


class OpenaiApiASR(ASRBase):
    def __init__(self, lan=None, temperature=0, logfile=sys.stderr):
        self.logfile = logfile
        self.modelname = "FunAudioLLM/SenseVoiceSmall"
        self.original_language = None if lan == "auto" else lan
        self.response_format = "verbose_json"
        self.temperature = temperature
        self.load_model()
        self.use_vad_opt = False
        self.task = "transcribe"
        self.transcribed_seconds = 0

    def load_model(self, *args, **kwargs):
        from openai import OpenAI
        # 如果你有自己的API-KEY和base_url，在此配置
        self.client = OpenAI(
            # base_url="https://api.deepseek.com",
            # api_key="sk-1d027182b56a489981c329fc45daa25c"
            base_url="https://api.siliconflow.cn/v1",
            api_key="sk-jzuyadjgvancjpuumxhyvlhqhrnvwnvnzqtkollonnnozjkt"
        )

    def ts_words(self, segments):
        if segments is None:
            return []
        if hasattr(segments, "text") and segments.text:
            return [(0.0, 0.0, segments.text)]
        if isinstance(segments, dict):
            if "text" in segments:
                return [(0.0, 0.0, segments["text"])]
            elif "segments" in segments:
                segments = segments

        if hasattr(segments, "words"):
            if segments.words is None:
                return []
            o = []
            for word in segments.words:
                o.append((word.start, word.end, word.word))
            return o

        if isinstance(segments, dict) and "segments" in segments:
            o = []
            for s in segments["segments"]:
                if s.get("words") is None:
                    continue
                for w in s["words"]:
                    o.append((w["start"], w["end"], w["text"]))
            return o

        return []

    def segments_end_ts(self, res):
        if hasattr(res, "segments") and res.segments is not None:
            return [s["end"] for s in res.segments if "end" in s]
        if hasattr(res, "text"):
            return []
        return []

    def transcribe(self, audio_data, prompt=None, *args, **kwargs):
        buffer = io.BytesIO()
        buffer.name = "temp.wav"
        sf.write(buffer, audio_data, samplerate=16000, format='WAV', subtype='PCM_16')
        buffer.seek(0)

        self.transcribed_seconds += math.ceil(len(audio_data)/16000)

        params = {
            "model": self.modelname,
            "file": buffer,
            "response_format": self.response_format,
            "temperature": self.temperature,
            "timestamp_granularities": ["word", "segment"]
        }
        if self.task != "translate" and self.original_language:
            params["language"] = self.original_language
        if prompt:
            params["prompt"] = prompt

        if self.task == "translate":
            proc = self.client.audio.translations
        else:
            proc = self.client.audio.transcriptions

        transcript = proc.create(**params)
        return transcript

    def use_vad(self):
        self.use_vad_opt = True

    def set_translate_task(self):
        self.task = "translate"


class HypothesisBuffer:
    def __init__(self, logfile=sys.stderr):
        self.commited_in_buffer = []
        self.buffer = []
        self.new = []
        self.last_commited_time = 0
        self.last_commited_word = None
        self.logfile = logfile

    def insert(self, new, offset):
        new = [(a+offset, b+offset, t) for a,b,t in new]
        self.new = [(a,b,t) for a,b,t in new if a > self.last_commited_time-0.1]

        if len(self.new) >= 1:
            a,b,t = self.new[0]
            if abs(a - self.last_commited_time) < 1:
                if self.commited_in_buffer:
                    cn = len(self.commited_in_buffer)
                    nn = len(self.new)
                    for i in range(1, min(min(cn, nn),5)+1):
                        c = " ".join([self.commited_in_buffer[-j][2] for j in range(1,i+1)][::-1])
                        tail = " ".join(self.new[j-1][2] for j in range(1,i+1))
                        if c == tail:
                            print("removing last", i, "words:", file=self.logfile)
                            for j in range(i):
                                print("\t", self.new.pop(0), file=self.logfile)
                            break

    def flush(self):
        commit = []
        while self.new:
            na, nb, nt = self.new[0]
            if len(self.buffer) == 0:
                break
            if nt == self.buffer[0][2]:
                commit.append((na, nb, nt))
                self.last_commited_word = nt
                self.last_commited_time = nb
                self.buffer.pop(0)
                self.new.pop(0)
            else:
                break
        self.buffer = self.new
        self.new = []
        self.commited_in_buffer.extend(commit)
        return commit

    def pop_commited(self, time):
        while self.commited_in_buffer and self.commited_in_buffer[0][1] <= time:
            self.commited_in_buffer.pop(0)

    def complete(self):
        return self.buffer


class OnlineASRProcessor:
    SAMPLING_RATE = 16000

    def __init__(self, asr, tokenizer=None, buffer_trimming=("segment", 15), logfile=sys.stderr):
        """
        asr: ASRBase 的子类实例
        tokenizer: 可选的句子分割器。对于 buffer_trimming='sentence' 时使用
        """
        self.asr = asr
        self.tokenizer = tokenizer
        self.logfile = logfile
        self.buffer_trimming_way, self.buffer_trimming_sec = buffer_trimming
        self.init()

    def init(self):
        """初始化/重置在线处理的状态。"""
        self.audio_buffer = np.array([], dtype=np.float32)
        self.buffer_time_offset = 0
        self.transcript_buffer = HypothesisBuffer(logfile=self.logfile)
        self.commited = []

    def insert_audio_chunk(self, audio):
        """向当前处理缓冲区添加新音频块。"""
        self.audio_buffer = np.append(self.audio_buffer, audio)

    def prompt(self):
        """返回(p, c)，其中p是拼接在 initial_prompt 上的文本，c 是纯上下文文本"""
        k = max(0, len(self.commited)-1)
        while k > 0 and self.commited[k-1][1] > self.buffer_time_offset:
            k -= 1

        p = self.commited[:k]
        p = [t for _,_,t in p]
        prompt = []
        l = 0
        while p and l < 200:
            x = p.pop(-1)
            l += len(x) + 1
            prompt.append(x)
        non_prompt = self.commited[k:]
        return self.asr.sep.join(prompt[::-1]), self.asr.sep.join(t for _,_,t in non_prompt)

    def process_iter(self):
        """
        对当前缓冲区进行一次增量ASR处理，并返回已提交文本段:
        返回值: (beg, end, "文本内容") 或 (None, None, "") 如果没有新提交。
        """
        prompt, _ = self.prompt()

        res = self.asr.transcribe(self.audio_buffer, init_prompt=prompt)
        tsw = self.asr.ts_words(res)
        self.transcript_buffer.insert(tsw, self.buffer_time_offset)
        o = self.transcript_buffer.flush()
        self.commited.extend(o)

        # 根据设置进行缓冲区修剪
        if o and self.buffer_trimming_way == "sentence":
            if len(self.audio_buffer)/self.SAMPLING_RATE > self.buffer_trimming_sec:
                self.chunk_completed_sentence()

        if self.buffer_trimming_way == "segment":
            s = self.buffer_trimming_sec
        else:
            s = 30

        if len(self.audio_buffer)/self.SAMPLING_RATE > s:
            self.chunk_completed_segment(res)

        return self.to_flush(o)

    def chunk_completed_sentence(self):
        if self.commited == []:
            return
        sents = self.words_to_sentences(self.commited)
        if len(sents) < 2:
            return
        while len(sents) > 2:
            sents.pop(0)
        chunk_at = sents[-2][1]
        self.chunk_at(chunk_at)

    def chunk_completed_segment(self, res):
        if self.commited == []:
            return
        ends = self.asr.segments_end_ts(res)
        t = self.commited[-1][1]
        if len(ends) > 1:
            e = ends[-2] + self.buffer_time_offset
            while len(ends) > 2 and e > t:
                ends.pop(-1)
                e = ends[-2] + self.buffer_time_offset
            if e <= t:
                self.chunk_at(e)

    def chunk_at(self, time):
        """将音频和假设从开头剪切到 time 处"""
        self.transcript_buffer.pop_commited(time)
        cut_seconds = time - self.buffer_time_offset
        self.audio_buffer = self.audio_buffer[int(cut_seconds * self.SAMPLING_RATE):]
        self.buffer_time_offset = time

    def words_to_sentences(self, words):
        """
        使用 tokenizer 将整个文本分割成句子。
        返回: [(beg, end, "句子文本"), ...]
        """
        if not self.tokenizer:
            return []
        cwords = [w for w in words]
        t = " ".join(o[2] for o in cwords)
        s = self.tokenizer.split(t)
        out = []
        while s:
            beg = None
            end = None
            sent = s.pop(0).strip()
            fsent = sent
            while cwords:
                b,e,w = cwords.pop(0)
                w = w.strip()
                if beg is None and sent.startswith(w):
                    beg = b
                elif end is None and sent == w:
                    end = e
                    out.append((beg, end, fsent))
                    break
                sent = sent[len(w):].strip()
        return out

    def finish(self):
        """处理结束后，取出最后残留的未提交文本"""
        o = self.transcript_buffer.complete()
        return self.to_flush(o)

    def to_flush(self, sents, sep=None, offset=0):
        if sep is None:
            sep = self.asr.sep
        t = sep.join(s[2] for s in sents)
        if len(sents) == 0:
            return (None, None, "")
        b = offset + sents[0][0]
        e = offset + sents[-1][1]
        return (b, e, t)


# ========== 新增：麦克风捕获的演示部分 ==========

def capture_from_mic(online_asr, min_chunk_size=1.0, logfile=sys.stderr):
    """
    从系统麦克风实时采集音频，并持续将分块送入在线 ASR Processor。
    online_asr: OnlineASRProcessor 实例
    min_chunk_size: 每次处理的最小音频长度(秒)
    """

    # 录音参数
    samplerate = 16000
    blocksize = int(samplerate * min_chunk_size)
    # 如果需要减少延迟，可以适度缩小 blocksize，但要保证算法不会过于频繁调用

    audio_queue = Queue()

    def audio_callback(indata, frames, time_info, status):
        if status:
            print(status, file=logfile)
        # 加上这行可以实时查看是否有音频幅度
        #print("Received frames:", frames, "mean amplitude:", indata.mean(), file=logfile)
        # indata: shape (frames, channels)
        # 转为 float32 并放到队列
        audio_queue.put(indata.copy())

    # 打开输入流
    with sd.InputStream(device=0,
                        samplerate=samplerate,
                        channels=1,
                        dtype='float32',
                        blocksize=0,  # 让 sounddevice 自行分块，然后在回调收数据
                        callback=audio_callback):
        print("正在使用麦克风录音，按 Ctrl+C 停止...", file=logfile)
        buffer = np.array([], dtype=np.float32)
        start_time = time.time()

        while True:
            try:
                # 从队列中取出最新的一段音频
                data = audio_queue.get(block=True)
                # 拼接到 buffer
                buffer = np.append(buffer, data.flatten())

                # 如果当前缓冲区长度 >= 我们的处理块大小，就送去识别
                while len(buffer) >= blocksize:
                    chunk = buffer[:blocksize]
                    buffer = buffer[blocksize:]

                    # 插入 chunk 并调用在线识别
                    online_asr.insert_audio_chunk(chunk)
                    result = online_asr.process_iter()

                    if result[0] is not None:
                        # 有新提交文本
                        now = time.time() - start_time
                        # 输出格式：时间戳（毫秒）、开始结束（毫秒）、文本
                        print("Final Recognized: %s" % (
                            result[2]
                        ), flush=True)

            except KeyboardInterrupt:
                print("停止录音", file=logfile)
                break
        # 结束后 flush 一次
        final = online_asr.finish()
        if final[0] is not None:
            now = time.time() - start_time
            print("Final Recognized: %s" % (
                final[2]
            ), flush=True)


# ========== 主函数入口：示例调用麦克风捕获 ==========

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument('--model', type=str, default='medium', help="Whisper 模型名称 (tiny, base, medium, large, etc.)")
    parser.add_argument("--mic", action="store_true",help="启用麦克风输入，而非音频文件")
    parser.add_argument('--lan', type=str, default='auto', help="源语言代码, 如 en, de, zh, 或 auto")
    parser.add_argument('--task', type=str, default='transcribe', choices=["transcribe","translate"],
                        help="转录或翻译。")
    parser.add_argument('--backend', type=str, default="faster-whisper",
                        choices=["faster-whisper", "whisper_timestamped", "openai-api"],
                        help="后端 ASR 实现")
    parser.add_argument('--vad', action='store_true', default=False, help="是否启用 VAD")
    parser.add_argument('--buffer_trimming', type=str, default='segment', choices=['segment','sentence'],
                        help='缓冲区修剪模式')
    parser.add_argument('--buffer_trimming_sec', type=float, default=1,
                        help='触发修剪的缓冲区时长阈值(秒)')
    parser.add_argument('--min_chunk_size', type=float, default=1.0,
                        help='麦克风一次处理的最小音频块时长(秒)')
    args = parser.parse_args()

    logfile = sys.stderr

    # 简化的 asr_factory：
    def asr_factory(backend, modelsize, lan, logfile=sys.stderr):
        if backend == "openai-api":
            print("使用 OpenAI API。", file=logfile)
            asr_inst = OpenaiApiASR(lan=lan)
        else:
            if backend == "faster-whisper":
                asr_cls = FasterWhisperASR
            else:
                asr_cls = WhisperTimestampedASR
            print(f"加载 {backend} 模型: {modelsize}", file=logfile)
            asr_inst = asr_cls(modelsize=modelsize, lan=lan, logfile=logfile)
        return asr_inst


    asr_instance = asr_factory(args.backend, args.model, args.lan, logfile=logfile)
    if args.vad:
        print("启用 VAD", file=logfile)
        asr_instance.use_vad()
    if args.task == "translate":
        asr_instance.set_translate_task()

    # 如果 buffer_trimming='sentence'，则需要一个 tokenizer，否则设为 None
    def create_tokenizer(lan):
        # 这里为演示，若真正使用可参考你的原代码: create_tokenizer(lan)
        return None

    if args.buffer_trimming == "sentence":
        tokenizer = create_tokenizer(args.lan)
    else:
        tokenizer = None

    online_asr = OnlineASRProcessor(
        asr=asr_instance,
        tokenizer=tokenizer,
        buffer_trimming=(args.buffer_trimming, args.buffer_trimming_sec),
        logfile=logfile
    )

    if args.mic:
        # 预热
        asr_instance.transcribe(np.zeros(16000, dtype=np.float32))
        capture_from_mic(online_asr, min_chunk_size=args.min_chunk_size, logfile=sys.stderr)
    else:
        # 从文件读音频
        audio_data, sr = load_audio_file(args.audio_path)
        # 进行推理或实时切分
        # 这里仅演示简单的“完整文件一次性转录”
        result = asr_instance.asr.transcribe(audio_data)
        # 打印结果
        print(result)


