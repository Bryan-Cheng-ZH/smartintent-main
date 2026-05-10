import json
import re
from pathlib import Path

DEVICE_PARAMETER_KEYS = {
    "tv": ["channel", "volume"],
    "light": ["brightness"],
    "ac": ["temperature", "mode", "fanSpeed"],
    "humidifier": ["level"],
    "coffeeMachine": ["brewMode"],
    "smartCurtains": ["openPercentage"],
    "robotVacuum": ["cleaningMode"],
    "airPurifier": ["mode", "fanSpeed"],
    "smartWindow": ["openPercentage", "lockStatus"],
    "waterHeater": ["mode", "temperature"],
}

DEVICE_DEFAULTS = {
    "tv": {"status": "off", "channel": 1, "volume": 10},
    "light": {"status": "off", "brightness": 1},
    "ac": {"status": "off", "temperature": 24, "mode": "cool", "fanSpeed": "medium"},
    "humidifier": {"status": "off", "level": 1},
    "coffeeMachine": {"status": "off", "brewMode": "Espresso"},
    "smartCurtains": {"status": "off", "openPercentage": 0},
    "robotVacuum": {"status": "off", "cleaningMode": "standard"},
    "airPurifier": {"status": "off", "mode": "manual", "fanSpeed": "low"},
    "smartWindow": {"status": "off", "openPercentage": 0, "lockStatus": "unlocked"},
    "waterHeater": {"status": "off", "mode": "keep_warm", "temperature": 45},
}

NUMERIC_PARAMETER_TOLERANCES = {
    "temperature": 1,
    "brightness": 1,
    "level": 1,
    "channel": 1,
    "volume": 5,
    "openPercentage": 5,
}


def load_prompt(prompt_name: str) -> str:
    prompt_path = Path(__file__).resolve().parent / "prompts" / f"{prompt_name}_prompt.txt"
    return prompt_path.read_text(encoding="utf-8")


def extract_json_payload(text: str):
    cleaned = re.sub(r"^```(?:json)?\s*", "", text.strip())
    cleaned = re.sub(r"\s*```$", "", cleaned)

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    decoder = json.JSONDecoder()
    for index, char in enumerate(cleaned):
        if char not in "{[":
            continue
        try:
            parsed, _ = decoder.raw_decode(cleaned[index:])
            return parsed
        except json.JSONDecodeError:
            continue

    raise ValueError("No valid JSON object found in model response")


def clamp_int(value, minimum, maximum):
    if value is None:
        return None
    try:
        return max(minimum, min(maximum, int(value)))
    except (TypeError, ValueError):
        return None


def sanitize_parameters(device_id, parameters):
    parameters = parameters or {}

    if device_id == "tv":
        return {
            "channel": clamp_int(parameters.get("channel"), 1, 20),
            "volume": clamp_int(parameters.get("volume"), 0, 100),
        }
    if device_id == "light":
        return {"brightness": clamp_int(parameters.get("brightness"), 1, 5)}
    if device_id == "ac":
        mode = parameters.get("mode")
        if mode is not None:
            mode = str(mode).lower()
            if mode not in {"cool", "heat"}:
                mode = None
        fan_speed = parameters.get("fanSpeed")
        if fan_speed is not None:
            fan_speed = str(fan_speed).lower()
            if fan_speed not in {"low", "medium", "high"}:
                fan_speed = None
        return {
            "temperature": clamp_int(parameters.get("temperature"), 16, 30),
            "mode": mode,
            "fanSpeed": fan_speed,
        }
    if device_id == "humidifier":
        return {"level": clamp_int(parameters.get("level"), 1, 5)}
    if device_id == "coffeeMachine":
        mode = parameters.get("brewMode")
        normalized_mode = None if mode is None else {
            "espresso": "Espresso",
            "latte": "Latte",
            "americano": "Americano",
        }.get(str(mode).lower())
        return {"brewMode": normalized_mode}
    if device_id == "smartCurtains":
        return {"openPercentage": clamp_int(parameters.get("openPercentage"), 0, 100)}
    if device_id == "robotVacuum":
        mode = parameters.get("cleaningMode")
        normalized_mode = None if mode is None else {
            "standard": "standard",
            "quiet": "quiet",
            "strong": "turbo",
            "powerful": "turbo",
            "turbo": "turbo",
        }.get(str(mode).lower())
        return {"cleaningMode": normalized_mode}
    if device_id == "airPurifier":
        mode = parameters.get("mode")
        if mode is not None:
            mode = str(mode).lower()
            if mode not in {"manual", "auto"}:
                mode = None
        fan_speed = parameters.get("fanSpeed")
        if fan_speed is not None:
            fan_speed = str(fan_speed).lower()
            if fan_speed not in {"low", "medium", "high"}:
                fan_speed = None
        return {"mode": mode, "fanSpeed": fan_speed}
    if device_id == "smartWindow":
        lock_status = parameters.get("lockStatus")
        if lock_status is not None:
            lock_status = str(lock_status).lower()
            if lock_status not in {"locked", "unlocked"}:
                lock_status = None
        return {
            "openPercentage": clamp_int(parameters.get("openPercentage"), 0, 100),
            "lockStatus": lock_status,
        }
    if device_id == "waterHeater":
        mode = parameters.get("mode")
        if mode is not None:
            mode = str(mode).lower()
            if mode not in {"heating", "keep_warm"}:
                mode = None
        return {
            "mode": mode,
            "temperature": clamp_int(parameters.get("temperature"), 35, 75),
        }
    return {}


def inherit_device_parameters(device_id, parameters, current_state):
    merged = {}
    current_params = current_state.get(device_id, {})
    sanitized = sanitize_parameters(device_id, parameters)

    for key in DEVICE_PARAMETER_KEYS.get(device_id, []):
        value = sanitized.get(key)
        if value is None:
            value = current_params.get(key, DEVICE_DEFAULTS[device_id].get(key))
        merged[key] = value

    return merged


def normalize_intent_result(payload, current_state):
    if "rule" in payload:
        action = payload["rule"].get("action", {})
        device_id = action.get("deviceId")
        if device_id in DEVICE_PARAMETER_KEYS:
            action["parameters"] = inherit_device_parameters(
                device_id,
                action.get("parameters"),
                current_state
            )
        payload["rule"]["action"] = action
        return payload

    result_items = payload.get("result")
    if result_items is None:
        result_items = payload.get("results", [])

    normalized_result = []
    for item in result_items or []:
        device_id = item.get("deviceId")
        action = item.get("action")
        if device_id not in DEVICE_PARAMETER_KEYS or action not in {"turn_on", "turn_off"}:
            continue

        normalized_result.append({
            "deviceId": device_id,
            "action": action,
            "parameters": inherit_device_parameters(
                device_id,
                item.get("parameters"),
                current_state
            )
        })

    needs_clarification = bool(payload.get("needsClarification", False))
    if needs_clarification:
        normalized_result = []

    message = payload.get("message")
    if not isinstance(message, str) or not message.strip():
        if needs_clarification:
            message = "I need a little more information before I can decide."
        elif normalized_result:
            message = "I will handle that for you."
        else:
            message = "No action is needed right now."

    return {
        "needsClarification": needs_clarification,
        "message": message.strip(),
        "result": normalized_result,
    }


def canonicalize_result(result):
    return [
        {
            "deviceId": item["deviceId"],
            "action": item["action"],
            "parameters": {k: item["parameters"][k] for k in sorted(item.get("parameters", {}))}
        }
        for item in sorted(result, key=lambda x: (x["deviceId"], x["action"]))
    ]


def canonicalize_output(output):
    if "rule" in output:
        return output
    return {
        "needsClarification": bool(output.get("needsClarification")),
        "message": output.get("message", ""),
        "result": canonicalize_result(output.get("result", []))
    }


def detect_language(text):
    text = (text or "").strip()
    if not text:
        return "unknown"

    if re.search(r"[\u4e00-\u9fff]", text):
        return "zh"

    lowered = text.lower()
    french_markers = [
        " le ", " la ", " les ", " un ", " une ", " des ", " est ", " pour ", " avec ",
        "bonjour", "merci", "s'il", "ça", "être", "très", " plus ", " moins ",
    ]
    if any(marker in f" {lowered} " for marker in french_markers) or re.search(r"[àâçéèêëîïôûùüÿœ]", lowered):
        return "fr"

    return "en"


def result_device_set(output):
    return sorted({item["deviceId"] for item in output.get("result", [])})


def result_device_action_set(output):
    return sorted((item["deviceId"], item["action"]) for item in output.get("result", []))


def parameters_match(predicted_parameters, reference_parameters):
    for key, reference_value in reference_parameters.items():
        predicted_value = predicted_parameters.get(key)
        if isinstance(reference_value, (int, float)) and isinstance(predicted_value, (int, float)):
            tolerance = NUMERIC_PARAMETER_TOLERANCES.get(key, 0)
            if abs(predicted_value - reference_value) > tolerance:
                return False
        else:
            if predicted_value != reference_value:
                return False
    return True


def action_parameter_correct(prediction, reference):
    prediction_items = {
        (item["deviceId"], item["action"]): item["parameters"]
        for item in prediction.get("result", [])
    }
    reference_items = {
        (item["deviceId"], item["action"]): item["parameters"]
        for item in reference.get("result", [])
    }

    if prediction_items.keys() != reference_items.keys():
        return False

    return all(
        parameters_match(prediction_items[key], reference_items[key])
        for key in reference_items
    )
