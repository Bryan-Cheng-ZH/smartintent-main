import argparse
import json
import os
import statistics
import time
import urllib.error
import urllib.request
from pathlib import Path

from experiment_utils import detect_language

ROOT = Path(__file__).resolve().parent
DEFAULT_DATASET = ROOT / "dataset" / "dataset_new_aligned.jsonl"
DEFAULT_OUTPUT_DIR = ROOT / "experiment_outputs" / "paper_style_eval"

SYSTEM_PROMPT = """You are an expert evaluator for smart-home intent parsing experiments.

You must evaluate one prediction against one gold reference using six binary metrics from a prior SmartIntent paper:

1. IU (Instruction Understanding)
- Score 1 if the prediction captures the intended device-action mapping of the gold reference at the task level.
- Score 0 otherwise.

2. DI (Device Identification)
- Score 1 if the predicted device set matches the gold device set.
- Score 0 otherwise.

3. CH (Clarification Handling)
- Score 1 if the predicted needsClarification decision matches the gold reference.
- Score 0 otherwise.

4. APC (Action and Parameter Correctness)
- Score 1 only if the predicted actions and action parameters are operationally equivalent to the gold reference.
- Use exact match for categorical parameters.
- For numeric parameters, treat small differences as acceptable only if they are functionally equivalent in context.
- If the prediction has missing or extra actions, score 0.

5. OFC (Output Format Compliance)
- Score 1 if the prediction is valid for the required schema:
  top-level keys: needsClarification, message, result
  needsClarification is boolean
  message is a non-empty string
  result is an array
  when needsClarification is true, result should be empty
  each result item must contain deviceId, action, parameters
- Score 0 otherwise.

6. LC (Language Consistency)
- Score 1 if the prediction message is written in the same language as the user instruction.
- Score 0 otherwise.

Return strict JSON only with this structure:
{
  "IU": {"score": 0 or 1, "reason": "..."},
  "DI": {"score": 0 or 1, "reason": "..."},
  "CH": {"score": 0 or 1, "reason": "..."},
  "APC": {"score": 0 or 1, "reason": "..."},
  "OFC": {"score": 0 or 1, "reason": "..."},
  "LC": {"score": 0 or 1, "reason": "..."}
}

Keep every reason brief and evidence-based.
"""

RETRY_PROMPT = """Re-evaluate the same case and return strict JSON only.

Additional constraints:
- Use the exact top-level keys IU, DI, CH, APC, OFC, LC
- Each metric must be an object with keys score and reason
- score must be 0 or 1
- Keep every reason under 18 words
- Do not include quotation marks inside reason text unless escaped
- Do not add any text before or after the JSON object
"""


def load_dataset_records(dataset_path):
    records = []
    with dataset_path.open("r", encoding="utf-8") as dataset_file:
        for line in dataset_file:
            if line.strip():
                records.append(json.loads(line))
    return records


def load_predictions(predictions_path):
    return json.loads(predictions_path.read_text(encoding="utf-8"))


def build_user_prompt(record, prediction_record):
    payload = {
        "instruction": record["input"]["userInstruction"],
        "instruction_language_hint": detect_language(record["input"]["userInstruction"]),
        "current_state": record["input"]["current_state"],
        "timestamp": record["input"]["timestamp"],
        "gold_reference": prediction_record["reference"],
        "model_prediction": prediction_record["prediction"],
    }
    return json.dumps(payload, ensure_ascii=False, indent=2)


def extract_json_payload(text):
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if cleaned.startswith("json"):
            cleaned = cleaned[4:].strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        decoder = json.JSONDecoder()
        for index, char in enumerate(cleaned):
            if char != "{":
                continue
            try:
                parsed, _ = decoder.raw_decode(cleaned[index:])
                return parsed
            except json.JSONDecodeError:
                continue
    raise ValueError("No valid JSON found in evaluator response")


def call_ollama(model, system_prompt, user_prompt, ollama_url, timeout):
    payload = json.dumps({
        "model": model,
        "prompt": f"{system_prompt}\n\nEvaluate this case:\n{user_prompt}",
        "stream": False,
        "keep_alive": -1,
    }).encode("utf-8")
    request = urllib.request.Request(
        ollama_url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    started = time.time()
    with urllib.request.urlopen(request, timeout=timeout) as response:
        body = json.loads(response.read().decode("utf-8"))
    return body.get("response", ""), time.time() - started


def call_openai_compatible(model, system_prompt, user_prompt, api_base, api_key, timeout):
    payload = json.dumps({
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0,
        "response_format": {"type": "json_object"},
    }).encode("utf-8")
    request = urllib.request.Request(
        api_base,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )
    started = time.time()
    with urllib.request.urlopen(request, timeout=timeout) as response:
        body = json.loads(response.read().decode("utf-8"))
    content = body["choices"][0]["message"]["content"]
    return content, time.time() - started


def call_evaluator(provider, model, system_prompt, user_prompt, timeout, ollama_url, api_base, api_key):
    if provider == "ollama":
        return call_ollama(model, system_prompt, user_prompt, ollama_url, timeout)
    return call_openai_compatible(model, system_prompt, user_prompt, api_base, api_key, timeout)


def validate_metric_payload(payload):
    required = ["IU", "DI", "CH", "APC", "OFC", "LC"]
    for key in required:
        item = payload.get(key)
        if not isinstance(item, dict):
            return False
        if item.get("score") not in {0, 1}:
            return False
        if not isinstance(item.get("reason"), str) or not item["reason"].strip():
            return False
    return True


def compute_summary(records):
    summary = {
        "samples": len(records),
        "errors": 0,
        "latency_seconds_mean": None,
        "latency_seconds_median": None,
        "paper_metrics": {key: {"count": 0, "rate": 0.0} for key in ["IU", "DI", "CH", "APC", "OFC", "LC"]},
    }
    latencies = []
    for record in records:
        if record.get("error"):
            summary["errors"] += 1
            continue
        latencies.append(record["latency_seconds"])
        for key in summary["paper_metrics"]:
            summary["paper_metrics"][key]["count"] += record["scores"][key]["score"]

    if latencies:
        summary["latency_seconds_mean"] = round(sum(latencies) / len(latencies), 3)
        summary["latency_seconds_median"] = round(statistics.median(latencies), 3)

    for key in summary["paper_metrics"]:
        count = summary["paper_metrics"][key]["count"]
        summary["paper_metrics"][key]["rate"] = round(count / summary["samples"], 4) if summary["samples"] else 0.0
    return summary


def eval_paths(output_dir, prompt_name):
    return {
        "jsonl": output_dir / f"{prompt_name}_paper_eval.jsonl",
        "json": output_dir / f"{prompt_name}_paper_eval.json",
        "summary": output_dir / f"{prompt_name}_paper_eval_summary.json",
    }


def load_existing_eval_records(jsonl_path):
    if not jsonl_path.exists():
        return []
    rows = []
    with jsonl_path.open("r", encoding="utf-8") as handle:
        for line in handle:
            if line.strip():
                rows.append(json.loads(line))
    rows.sort(key=lambda item: item["index"])
    return rows


def write_eval_outputs(output_dir, prompt_name, records):
    paths = eval_paths(output_dir, prompt_name)
    summary = compute_summary(records)
    paths["json"].write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")
    paths["summary"].write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    return summary


def append_eval_record(jsonl_path, record):
    with jsonl_path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record, ensure_ascii=False) + "\n")


def run_prompt_evaluation(
    prompt_name,
    dataset_records,
    predictions,
    output_dir,
    resume,
    provider,
    evaluator_model,
    timeout,
    ollama_url,
    api_base,
    api_key,
    limit,
):
    paths = eval_paths(output_dir, prompt_name)
    if resume:
        eval_records = load_existing_eval_records(paths["jsonl"])
    else:
        eval_records = []
        for path in paths.values():
            if path.exists():
                path.unlink()

    completed_indices = {item["index"] for item in eval_records}

    for prediction_record in predictions[:limit] if limit is not None else predictions:
        index = prediction_record["index"]
        if index in completed_indices:
            continue

        dataset_record = dataset_records[index - 1]
        user_prompt = build_user_prompt(dataset_record, prediction_record)
        raw_response = ""
        parsed = None
        latency = None
        error = None

        try:
            raw_response, latency = call_evaluator(
                provider=provider,
                model=evaluator_model,
                system_prompt=SYSTEM_PROMPT,
                user_prompt=user_prompt,
                timeout=timeout,
                ollama_url=ollama_url,
                api_base=api_base,
                api_key=api_key,
            )
            parsed = extract_json_payload(raw_response)
            if not validate_metric_payload(parsed):
                raise ValueError("Evaluator returned invalid metric payload")
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ValueError, json.JSONDecodeError) as exc:
            try:
                retry_response, retry_latency = call_evaluator(
                    provider=provider,
                    model=evaluator_model,
                    system_prompt=SYSTEM_PROMPT + "\n\n" + RETRY_PROMPT,
                    user_prompt=user_prompt,
                    timeout=timeout,
                    ollama_url=ollama_url,
                    api_base=api_base,
                    api_key=api_key,
                )
                raw_response = retry_response
                latency = (latency or 0) + retry_latency
                parsed = extract_json_payload(raw_response)
                if not validate_metric_payload(parsed):
                    raise ValueError("Evaluator returned invalid metric payload after retry")
                error = None
            except Exception as retry_exc:  # noqa: BLE001
                error = f"{exc}; retry_failed: {retry_exc}"
        except Exception as exc:  # noqa: BLE001
            error = str(exc)

        eval_record = {
            "index": index,
            "userInstruction": prediction_record["userInstruction"],
            "raw_response": raw_response,
            "scores": parsed if parsed else {key: {"score": 0, "reason": "evaluation failed"} for key in ["IU", "DI", "CH", "APC", "OFC", "LC"]},
            "latency_seconds": latency,
            "error": error,
        }
        eval_records.append(eval_record)
        append_eval_record(paths["jsonl"], eval_record)
        write_eval_outputs(output_dir, prompt_name, eval_records)

    return eval_records, write_eval_outputs(output_dir, prompt_name, eval_records)


def main():
    parser = argparse.ArgumentParser(description="Evaluate saved prompt experiment predictions with an LLM-as-a-judge rubric aligned to the SmartIntent paper.")
    parser.add_argument("--dataset", type=Path, default=DEFAULT_DATASET)
    parser.add_argument("--predictions-dir", type=Path, default=ROOT / "experiment_outputs")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--prompt", choices=["baseline", "improved", "both"], default="both")
    parser.add_argument("--provider", choices=["ollama", "openai"], default="ollama")
    parser.add_argument("--evaluator-model", default="qwen2.5:3b")
    parser.add_argument("--ollama-url", default="http://127.0.0.1:11434/api/generate")
    parser.add_argument("--api-base", default=os.environ.get("OPENAI_API_BASE", ""))
    parser.add_argument("--api-key", default=os.environ.get("OPENAI_API_KEY", ""))
    parser.add_argument("--timeout", type=int, default=120)
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--resume", action=argparse.BooleanOptionalAction, default=True)
    args = parser.parse_args()

    if args.provider == "openai" and (not args.api_base or not args.api_key):
        raise SystemExit("OpenAI-compatible evaluation requires --api-base and --api-key (or OPENAI_API_BASE / OPENAI_API_KEY).")

    args.output_dir.mkdir(parents=True, exist_ok=True)
    prompt_names = ["baseline", "improved"] if args.prompt == "both" else [args.prompt]
    dataset_records = load_dataset_records(args.dataset)

    comparison = {
        "dataset": str(args.dataset),
        "provider": args.provider,
        "evaluator_model": args.evaluator_model,
        "results": {},
    }

    for prompt_name in prompt_names:
        predictions = load_predictions(args.predictions_dir / f"{prompt_name}_predictions.json")
        _, summary = run_prompt_evaluation(
            prompt_name=prompt_name,
            dataset_records=dataset_records,
            predictions=predictions,
            output_dir=args.output_dir,
            resume=args.resume,
            provider=args.provider,
            evaluator_model=args.evaluator_model,
            timeout=args.timeout,
            ollama_url=args.ollama_url,
            api_base=args.api_base,
            api_key=args.api_key,
            limit=args.limit,
        )
        comparison["results"][prompt_name] = summary

    (args.output_dir / "paper_style_eval_comparison.json").write_text(
        json.dumps(comparison, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(json.dumps(comparison, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
