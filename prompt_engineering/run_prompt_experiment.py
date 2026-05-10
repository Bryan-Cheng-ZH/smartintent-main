import argparse
import json
import statistics
import time
import urllib.error
import urllib.request
from pathlib import Path

from experiment_utils import (
    action_parameter_correct,
    canonicalize_output,
    detect_language,
    extract_json_payload,
    load_prompt,
    normalize_intent_result,
    result_device_action_set,
    result_device_set,
)

ROOT = Path(__file__).resolve().parent
DEFAULT_DATASET = ROOT / "dataset" / "dataset_new_aligned.jsonl"
DEFAULT_OUTPUT_DIR = ROOT / "experiment_outputs"


def load_dataset_records(dataset_path, limit):
    records = []
    with dataset_path.open("r", encoding="utf-8") as dataset_file:
        for line in dataset_file:
            if line.strip():
                records.append(json.loads(line))
    if limit is not None:
        records = records[:limit]
    return records


def build_prompt(prompt_text, record):
    model_input = {
        "userInstruction": record["input"]["userInstruction"],
        "current_state": record["input"]["current_state"],
        "timestamp": record["input"]["timestamp"],
    }
    return (
        prompt_text
        + "\n\nReturn only valid JSON. Do not include explanations, comments, markdown, or code fences."
        + f"\n\nInput:\n{json.dumps(model_input, ensure_ascii=False, indent=2)}"
    )


def call_ollama(model, prompt, ollama_url, timeout):
    payload = json.dumps({
        "model": model,
        "prompt": prompt,
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
    latency = time.time() - started
    return body.get("response", ""), latency


def evaluate_predictions(predictions):
    summary = {
        "samples": len(predictions),
        "json_parse_success": 0,
        "schema_valid": 0,
        "needs_clarification_correct": 0,
        "exact_match": 0,
        "result_match": 0,
        "message_nonempty": 0,
        "latency_seconds_mean": None,
        "latency_seconds_median": None,
        "errors": 0,
        "paper_metrics": {
            "IU": 0,
            "DI": 0,
            "CH": 0,
            "APC": 0,
            "OFC": 0,
            "LC": 0,
        },
    }

    latencies = []
    for item in predictions:
        if item["error"]:
            summary["errors"] += 1
            continue

        latencies.append(item["latency_seconds"])

        if item["parsed_success"]:
            summary["json_parse_success"] += 1
        if item["schema_valid"]:
            summary["schema_valid"] += 1
        if item["needs_clarification_correct"]:
            summary["needs_clarification_correct"] += 1
        if item["exact_match"]:
            summary["exact_match"] += 1
        if item["result_match"]:
            summary["result_match"] += 1
        if item["prediction"]["message"]:
            summary["message_nonempty"] += 1
        if item.get("iu_correct"):
            summary["paper_metrics"]["IU"] += 1
        if item.get("di_correct"):
            summary["paper_metrics"]["DI"] += 1
        if item.get("ch_correct"):
            summary["paper_metrics"]["CH"] += 1
        if item.get("apc_correct"):
            summary["paper_metrics"]["APC"] += 1
        if item.get("ofc_correct"):
            summary["paper_metrics"]["OFC"] += 1
        if item.get("lc_correct"):
            summary["paper_metrics"]["LC"] += 1

    if latencies:
        summary["latency_seconds_mean"] = round(sum(latencies) / len(latencies), 3)
        summary["latency_seconds_median"] = round(statistics.median(latencies), 3)

    for key in [
        "json_parse_success",
        "schema_valid",
        "needs_clarification_correct",
        "exact_match",
        "result_match",
        "message_nonempty",
    ]:
        summary[f"{key}_rate"] = round(summary[key] / summary["samples"], 4) if summary["samples"] else 0.0

    for key, value in list(summary["paper_metrics"].items()):
        summary["paper_metrics"][key] = {
            "count": value,
            "rate": round(value / summary["samples"], 4) if summary["samples"] else 0.0,
        }

    return summary


def prediction_paths(output_dir, prompt_name):
    return {
        "json": output_dir / f"{prompt_name}_predictions.json",
        "jsonl": output_dir / f"{prompt_name}_predictions.jsonl",
        "summary": output_dir / f"{prompt_name}_summary.json",
    }


def load_existing_predictions(jsonl_path):
    if not jsonl_path.exists():
        return []

    predictions = []
    with jsonl_path.open("r", encoding="utf-8") as jsonl_file:
        for line in jsonl_file:
            if not line.strip():
                continue
            predictions.append(json.loads(line))
    predictions.sort(key=lambda item: item["index"])
    return predictions


def write_outputs(output_dir, prompt_name, predictions):
    paths = prediction_paths(output_dir, prompt_name)
    summary = evaluate_predictions(predictions)
    paths["json"].write_text(json.dumps(predictions, ensure_ascii=False, indent=2), encoding="utf-8")
    paths["summary"].write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    return summary


def append_prediction(jsonl_path, prediction_record):
    with jsonl_path.open("a", encoding="utf-8") as jsonl_file:
        jsonl_file.write(json.dumps(prediction_record, ensure_ascii=False) + "\n")


def enrich_prediction_record(prediction_record):
    canonical_prediction = canonicalize_output(prediction_record["prediction"])
    canonical_reference = canonicalize_output(prediction_record["reference"])
    prediction_record["prediction"] = canonical_prediction
    prediction_record["reference"] = canonical_reference
    prediction_record["needs_clarification_correct"] = (
        canonical_prediction.get("needsClarification") == canonical_reference.get("needsClarification")
    )
    prediction_record["result_match"] = canonical_prediction.get("result") == canonical_reference.get("result")
    prediction_record["exact_match"] = canonical_prediction == canonical_reference
    prediction_record["iu_correct"] = result_device_action_set(canonical_prediction) == result_device_action_set(canonical_reference)
    prediction_record["di_correct"] = result_device_set(canonical_prediction) == result_device_set(canonical_reference)
    prediction_record["ch_correct"] = prediction_record["needs_clarification_correct"]
    prediction_record["apc_correct"] = action_parameter_correct(canonical_prediction, canonical_reference)
    prediction_record["ofc_correct"] = bool(prediction_record.get("schema_valid"))
    prediction_record["instruction_language"] = detect_language(prediction_record.get("userInstruction", ""))
    prediction_record["message_language"] = detect_language(canonical_prediction.get("message", ""))
    prediction_record["lc_correct"] = (
        prediction_record["message_language"] == prediction_record["instruction_language"]
        if prediction_record["instruction_language"] != "unknown"
        else False
    )
    return prediction_record


def run_single_prompt(prompt_name, dataset_path, model, ollama_url, timeout, limit, output_dir, resume):
    prompt_text = load_prompt(prompt_name)
    records = load_dataset_records(dataset_path, limit)
    paths = prediction_paths(output_dir, prompt_name)
    if resume:
        predictions = load_existing_predictions(paths["jsonl"])
    else:
        predictions = []
        for path in paths.values():
            if path.exists():
                path.unlink()
    completed_indices = {item["index"] for item in predictions}

    for index, record in enumerate(records, start=1):
        if index in completed_indices:
            continue

        raw_response = ""
        latency = None
        error = None
        parsed_success = False
        schema_valid = False
        prediction = {
            "needsClarification": False,
            "message": "",
            "result": [],
        }

        try:
            prompt = build_prompt(prompt_text, record)
            raw_response, latency = call_ollama(model, prompt, ollama_url, timeout)
            parsed = extract_json_payload(raw_response)
            parsed_success = True
            prediction = normalize_intent_result(parsed or {}, record["input"]["current_state"])
            schema_valid = isinstance(prediction.get("result"), list) and all(
                "deviceId" in item and "action" in item and "parameters" in item
                for item in prediction.get("result", [])
            )
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ValueError, json.JSONDecodeError) as exc:
            error = str(exc)
        except Exception as exc:  # noqa: BLE001
            error = str(exc)

        reference = record["reference_output"]
        canonical_prediction = canonicalize_output(prediction)
        canonical_reference = canonicalize_output(reference)

        prediction_record = {
            "index": index,
            "userInstruction": record["input"]["userInstruction"],
            "raw_response": raw_response,
            "parsed_success": parsed_success,
            "schema_valid": schema_valid,
            "prediction": canonical_prediction,
            "reference": canonical_reference,
            "needs_clarification_correct": (
                canonical_prediction.get("needsClarification") == canonical_reference.get("needsClarification")
            ),
            "result_match": canonical_prediction.get("result") == canonical_reference.get("result"),
            "exact_match": canonical_prediction == canonical_reference,
            "latency_seconds": latency,
            "error": error,
        }
        prediction_record = enrich_prediction_record(prediction_record)
        predictions.append(prediction_record)
        append_prediction(paths["jsonl"], prediction_record)
        write_outputs(output_dir, prompt_name, predictions)

    return predictions, write_outputs(output_dir, prompt_name, predictions)


def recompute_saved_outputs(output_dir, prompt_names):
    experiment_summary = {"results": {}}
    for prompt_name in prompt_names:
        predictions_path = prediction_paths(output_dir, prompt_name)["json"]
        predictions = json.loads(predictions_path.read_text(encoding="utf-8"))
        predictions = [enrich_prediction_record(item) for item in predictions]
        summary = write_outputs(output_dir, prompt_name, predictions)
        experiment_summary["results"][prompt_name] = summary
    return experiment_summary


def main():
    parser = argparse.ArgumentParser(description="Run offline prompt-engineering experiments with a local Ollama model.")
    parser.add_argument("--dataset", type=Path, default=DEFAULT_DATASET)
    parser.add_argument("--model", default="qwen2.5:3b")
    parser.add_argument("--ollama-url", default="http://127.0.0.1:11434/api/generate")
    parser.add_argument("--timeout", type=int, default=120)
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--prompt", choices=["baseline", "improved", "improved_v2", "improved_v3", "improved_v4", "both", "all"], default="both")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--resume", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--recompute-only", action="store_true")
    args = parser.parse_args()

    args.output_dir.mkdir(parents=True, exist_ok=True)
    if args.prompt == "both":
        prompt_names = ["baseline", "improved"]
    elif args.prompt == "all":
        prompt_names = ["baseline", "improved", "improved_v2", "improved_v3", "improved_v4"]
    else:
        prompt_names = [args.prompt]

    experiment_summary = {
        "dataset": str(args.dataset),
        "model": args.model,
        "ollama_url": args.ollama_url,
        "timeout_seconds": args.timeout,
        "limit": args.limit,
        "results": {},
    }

    if args.recompute_only:
        experiment_summary["results"] = recompute_saved_outputs(args.output_dir, prompt_names)["results"]
    else:
        for prompt_name in prompt_names:
            predictions, summary = run_single_prompt(
                prompt_name=prompt_name,
                dataset_path=args.dataset,
                model=args.model,
                ollama_url=args.ollama_url,
                timeout=args.timeout,
                limit=args.limit,
                output_dir=args.output_dir,
                resume=args.resume,
            )
            experiment_summary["results"][prompt_name] = summary

    combined_path = args.output_dir / "comparison_summary.json"
    combined_path.write_text(json.dumps(experiment_summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(experiment_summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
