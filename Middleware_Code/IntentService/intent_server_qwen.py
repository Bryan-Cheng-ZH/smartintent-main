from flask import Flask, request, jsonify
import json
import os
import re
import time

import requests

app = Flask(__name__)

PORT = int(os.getenv("PORT", "5050"))
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434/api/generate")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5:3b")
AGGREGATOR_URL = os.getenv(
    "AGGREGATOR_URL",
    "http://121.40.148.46:8080/all-status"
)
RULE_ENGINE_URL = os.getenv(
    "RULE_ENGINE_URL",
    "http://121.40.148.46:8080/rules"
)
DISPATCHER_URL = os.getenv(
    "DISPATCHER_URL",
    "http://121.40.148.46:8080/dispatch"
)

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

SENSOR_EXTRACTORS = {
    "temperatureSensor": "currentTemperature",
    "humiditySensor": "currentHumidity",
    "indoorPollutionSensor": "currentPollution",
    "outdoorPollutionSensor": "currentPollution",
    "co2Sensor": "currentCO2",
    "noiseSensor": "currentNoise",
    "pollutionSensor": "currentPollution",
}

PROMPT_TEMPLATE = """
You are a smart-home intent model. You will receive one JSON input object with:
- userInstruction: the user's natural language request
- current_state: the full current state of all supported devices and sensors
- timestamp: the current time in HH:MM:SS

Supported controllable devices:
- tv: status, channel (1-20), volume (0-100)
- light: status, brightness (1-5)
- ac: status, temperature (16-30), mode (cool/heat), fanSpeed (low/medium/high)
- humidifier: status, level (1-5)
- coffeeMachine: status, brewMode (Espresso/Latte/Americano)
- smartCurtains: status, openPercentage (0-100)
- robotVacuum: status, cleaningMode (standard/quiet/turbo)
- airPurifier: status, mode (manual/auto), fanSpeed (low/medium/high)
- smartWindow: status, openPercentage (0-100), lockStatus (locked/unlocked)
- waterHeater: status, mode (heating/keep_warm), temperature (35-75)

Supported sensors:
- temperatureSensor
- humiditySensor
- indoorPollutionSensor
- outdoorPollutionSensor
- co2Sensor
- noiseSensor

Task:
Decide whether to:
1. ask for clarification,
2. execute one or more valid device actions, or
3. do nothing.

Rules:
- Output must be valid JSON only.
- For ordinary requests, the top-level JSON must contain exactly:
  - needsClarification
  - message
  - result
- needsClarification must be true or false.
- message must be natural English and consistent with the decision.
- result must always be an array.
- When needsClarification is true, result must be [].
- When needsClarification is false, result may be [] or contain one or more actions.
- Each action object in result must contain exactly:
  - deviceId
  - action
  - parameters
- action must be turn_on or turn_off.
- parameters must contain all valid parameters for that device, and must never include status.
- If the user gives a pure on/off instruction without specifying device settings, inherit the device's current parameter values from current_state.
- Only use the supported device IDs and sensors listed above.
- Do not use pollutionSensor. Use indoorPollutionSensor and outdoorPollutionSensor instead.
- If information is insufficient to choose one device or one action, set needsClarification to true and ask a focused clarification question.
- If no action is needed, set needsClarification to false, explain why in message, and set result to [].

Environmental reasoning hints:
- If the user says it is noisy outside, prefer turning off smartWindow when noiseSensor is high.
- If indoor air is poor and outdoor air is also poor, prefer airPurifier over smartWindow.
- If indoor air is poor and outdoor air is fresh, smartWindow or airPurifier may both be valid depending on ambiguity.
- If co2Sensor is high and outdoor air is fresh, opening smartWindow may help.
- If the user mentions hot water, consider waterHeater.

Persistent automation rule extension:
If the instruction clearly asks for a persistent future rule such as "whenever", "always", "automatically", "从今以后", "以后", "每次", or "一直",
return this top-level structure instead of the ordinary output:
{
  "rule": {
    "trigger": {
      "sensor": "temperatureSensor",
      "operator": ">",
      "value": 28
    },
    "action": {
      "deviceId": "ac",
      "action": "turn_on",
      "parameters": {
        "temperature": 26,
        "mode": "cool",
        "fanSpeed": "medium"
      }
    }
  }
}

Examples:
{
  "needsClarification": true,
  "message": "It seems a bit stuffy. Would you like me to open the window or turn on the air purifier?",
  "result": []
}

{
  "needsClarification": false,
  "message": "It feels dry, so I will turn on the humidifier for you.",
  "result": [
    {
      "deviceId": "humidifier",
      "action": "turn_on",
      "parameters": {
        "level": 3
      }
    }
  ]
}
"""


def clamp_int(value, minimum, maximum):
    if value is None:
        return None
    try:
        return max(minimum, min(maximum, int(value)))
    except (TypeError, ValueError):
        return None


def normalize_status(value):
    return "on" if str(value).lower() == "on" else "off"


def normalize_sensor_value(sensor_name, raw_value):
    if isinstance(raw_value, dict):
        nested_key = SENSOR_EXTRACTORS.get(sensor_name)
        if nested_key in raw_value:
            raw_value = raw_value[nested_key]
        elif len(raw_value) == 1:
            raw_value = next(iter(raw_value.values()))
        else:
            return None

    if sensor_name in {"humiditySensor", "co2Sensor"}:
        try:
            return int(raw_value)
        except (TypeError, ValueError):
            return None

    try:
        return float(raw_value)
    except (TypeError, ValueError):
        return None


def normalize_device_state(device_id, raw_state):
    state = dict(DEVICE_DEFAULTS[device_id])
    if isinstance(raw_state, dict):
        state.update(raw_state)

    state["status"] = normalize_status(state.get("status"))

    if device_id == "tv":
        state["channel"] = clamp_int(state.get("channel"), 1, 20) or DEVICE_DEFAULTS["tv"]["channel"]
        state["volume"] = clamp_int(state.get("volume"), 0, 100)
        if state["volume"] is None:
            state["volume"] = DEVICE_DEFAULTS["tv"]["volume"]
    elif device_id == "light":
        state["brightness"] = clamp_int(state.get("brightness"), 1, 5) or DEVICE_DEFAULTS["light"]["brightness"]
    elif device_id == "ac":
        state["temperature"] = clamp_int(state.get("temperature"), 16, 30) or DEVICE_DEFAULTS["ac"]["temperature"]
        state["mode"] = str(state.get("mode", "cool")).lower()
        if state["mode"] not in {"cool", "heat"}:
            state["mode"] = DEVICE_DEFAULTS["ac"]["mode"]
        state["fanSpeed"] = str(state.get("fanSpeed", "medium")).lower()
        if state["fanSpeed"] not in {"low", "medium", "high"}:
            state["fanSpeed"] = DEVICE_DEFAULTS["ac"]["fanSpeed"]
    elif device_id == "humidifier":
        state["level"] = clamp_int(state.get("level"), 1, 5) or DEVICE_DEFAULTS["humidifier"]["level"]
    elif device_id == "coffeeMachine":
        mode = str(state.get("brewMode", "Espresso")).strip().lower()
        state["brewMode"] = {
            "espresso": "Espresso",
            "latte": "Latte",
            "americano": "Americano",
        }.get(mode, DEVICE_DEFAULTS["coffeeMachine"]["brewMode"])
    elif device_id == "smartCurtains":
        state["openPercentage"] = clamp_int(state.get("openPercentage"), 0, 100)
        if state["openPercentage"] is None:
            state["openPercentage"] = 0 if state["status"] == "off" else 100
    elif device_id == "robotVacuum":
        mode = str(state.get("cleaningMode", "standard")).strip().lower()
        state["cleaningMode"] = {
            "standard": "standard",
            "quiet": "quiet",
            "strong": "turbo",
            "powerful": "turbo",
            "turbo": "turbo",
        }.get(mode, DEVICE_DEFAULTS["robotVacuum"]["cleaningMode"])
    elif device_id == "airPurifier":
        state["mode"] = str(state.get("mode", "manual")).lower()
        if state["mode"] not in {"manual", "auto"}:
            state["mode"] = DEVICE_DEFAULTS["airPurifier"]["mode"]
        state["fanSpeed"] = str(state.get("fanSpeed", "low")).lower()
        if state["fanSpeed"] not in {"low", "medium", "high"}:
            state["fanSpeed"] = DEVICE_DEFAULTS["airPurifier"]["fanSpeed"]
    elif device_id == "smartWindow":
        state["openPercentage"] = clamp_int(state.get("openPercentage"), 0, 100)
        if state["openPercentage"] is None:
            state["openPercentage"] = 0 if state["status"] == "off" else 100
        lock_status = str(state.get("lockStatus", "unlocked")).lower()
        state["lockStatus"] = lock_status if lock_status in {"locked", "unlocked"} else "unlocked"
    elif device_id == "waterHeater":
        state["mode"] = str(state.get("mode", "keep_warm")).lower()
        if state["mode"] not in {"heating", "keep_warm"}:
            state["mode"] = DEVICE_DEFAULTS["waterHeater"]["mode"]
        state["temperature"] = clamp_int(state.get("temperature"), 35, 75) or DEVICE_DEFAULTS["waterHeater"]["temperature"]

    normalized = {"status": state["status"]}
    for key in DEVICE_PARAMETER_KEYS[device_id]:
        normalized[key] = state[key]
    return normalized


def normalize_current_state(raw_state):
    raw_state = raw_state or {}
    normalized = {}

    device_aliases = {
        "tv": "tv",
        "light": "light",
        "airConditioner": "ac",
        "ac": "ac",
        "humidifier": "humidifier",
        "coffeeMachine": "coffeeMachine",
        "smartCurtains": "smartCurtains",
        "robotVacuum": "robotVacuum",
        "airPurifier": "airPurifier",
        "smartWindow": "smartWindow",
        "waterHeater": "waterHeater",
    }

    for raw_key, normalized_key in device_aliases.items():
        if raw_key in raw_state:
            normalized[normalized_key] = normalize_device_state(normalized_key, raw_state[raw_key])

    for device_id in DEVICE_PARAMETER_KEYS:
        if device_id not in normalized:
            normalized[device_id] = normalize_device_state(device_id, {})

    sensor_order = [
        "temperatureSensor",
        "humiditySensor",
        "indoorPollutionSensor",
        "outdoorPollutionSensor",
        "co2Sensor",
        "noiseSensor",
    ]

    for sensor_name in sensor_order:
        raw_value = raw_state.get(sensor_name)
        if raw_value is None and sensor_name == "indoorPollutionSensor":
            raw_value = raw_state.get("pollutionSensor")
        normalized[sensor_name] = normalize_sensor_value(sensor_name, raw_value)

    return normalized


def extract_json_payload(text):
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
        if mode is None:
            normalized_mode = None
        else:
            normalized_mode = {
                "espresso": "Espresso",
                "latte": "Latte",
                "americano": "Americano",
            }.get(str(mode).lower())
        return {"brewMode": normalized_mode}
    if device_id == "smartCurtains":
        return {"openPercentage": clamp_int(parameters.get("openPercentage"), 0, 100)}
    if device_id == "robotVacuum":
        mode = parameters.get("cleaningMode")
        normalized_mode = {
            "standard": "standard",
            "quiet": "quiet",
            "strong": "turbo",
            "powerful": "turbo",
            "turbo": "turbo",
        }.get(str(mode).lower()) if mode is not None else None
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


def summarize_result(intent_result):
    if intent_result.get("message"):
        return intent_result["message"]

    if intent_result.get("needsClarification"):
        return "Clarification is required."

    actions = intent_result.get("result", [])
    if not actions:
        return "No action is needed."

    parts = []
    for item in actions:
        parts.append(f"{item['action']} {item['deviceId']}")
    return ", ".join(parts)


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


def call_qwen(user_instruction, current_state, timestamp):
    model_input = {
        "userInstruction": user_instruction,
        "current_state": current_state,
        "timestamp": timestamp,
    }
    full_prompt = (
        PROMPT_TEMPLATE
        + "\nReturn only valid JSON. Do not include markdown or code fences."
        + f"\n\nInput:\n{json.dumps(model_input, ensure_ascii=False, indent=2)}"
    )

    try:
        response = requests.post(
            OLLAMA_URL,
            json={
                "model": OLLAMA_MODEL,
                "prompt": full_prompt,
                "stream": False,
                "keep_alive": -1
            },
            timeout=120
        )
        response.raise_for_status()
        data = response.json()
        return data.get("response")
    except Exception as exc:
        print("[OLLAMA ERROR]:", str(exc))
        return None


@app.route('/healthz', methods=['GET'])
def healthz():
    return jsonify({
        "status": "ok",
        "service": "intent-server-qwen",
        "model": OLLAMA_MODEL
    })


@app.route('/get-intent', methods=['POST'])
def get_intent():
    data = request.get_json() or {}
    print("[RAW BODY]:", request.data)
    user_instruction = data.get("userInstruction")
    print("[INTENT]:", user_instruction)

    if not user_instruction:
        return jsonify({"error": "userInstruction is necessary"}), 400

    try:
        state_resp = requests.get(AGGREGATOR_URL, timeout=50)
        state_resp.raise_for_status()
        raw_state = extract_json_payload(state_resp.text)
        current_state = normalize_current_state(raw_state)
        timestamp = data.get("timestamp") or time.strftime("%H:%M:%S")

        print("[AGGREGATOR RAW TEXT]:", state_resp.text)
        print("[NORMALIZED STATE]:", current_state)

        result_text = call_qwen(user_instruction, current_state, timestamp)
        print("[LLM RESULT TEXT]:", result_text)

        if result_text is None:
            fallback = {
                "needsClarification": False,
                "message": "The local model is currently unavailable. Please try again later.",
                "result": []
            }
            return jsonify({
                "error": "LLM unavailable or Ollama failed",
                "fallback": True,
                "intent_result": fallback,
                "summary": fallback["message"],
                "allError": True
            }), 503

        try:
            parsed_payload = extract_json_payload(result_text)
        except Exception:
            return jsonify({
                "error": "Model return result can not be parsed into JSON",
                "raw_result": result_text
            }), 500

        normalized_payload = normalize_intent_result(parsed_payload or {}, current_state)

        if "rule" in normalized_payload:
            rule_payload = {
                "id": f"rule_{int(time.time())}",
                "trigger": normalized_payload["rule"]["trigger"],
                "action": normalized_payload["rule"]["action"],
                "active": True
            }
            return jsonify({
                "LLM_result": result_text,
                "rule_payload": rule_payload,
                "summary": (
                    f"When {rule_payload['trigger']['sensor']} "
                    f"{rule_payload['trigger']['operator']} "
                    f"{rule_payload['trigger']['value']}, "
                    f"{rule_payload['action']['deviceId']} will run automatically."
                ),
                "allError": False
            })

        summary_text = summarize_result(normalized_payload)
        return jsonify({
            "intent_result": normalized_payload,
            "summary": summary_text,
            "allError": False
        })
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@app.route('/confirm-rule', methods=['POST'])
def confirm_rule():
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "No JSON body received"}), 400

        rule_payload = data.get("rule_payload")
        if not rule_payload:
            return jsonify({"error": "rule_payload is required"}), 400

        if not rule_payload.get("id") or not rule_payload.get("trigger") or not rule_payload.get("action"):
            return jsonify({"error": "rule_payload missing required fields"}), 400

        rule_resp = requests.post(
            RULE_ENGINE_URL,
            json=rule_payload,
            timeout=10
        )

        try:
            rule_engine_response = rule_resp.json()
        except Exception:
            rule_engine_response = {"raw_text": rule_resp.text}

        if rule_resp.status_code not in [200, 201]:
            return jsonify({
                "error": "rule-engine failed to save rule",
                "rule_engine_status": rule_resp.status_code,
                "rule_engine_response": rule_engine_response
            }), rule_resp.status_code

        return jsonify({
            "message": "Rule saved successfully",
            "rule_engine_status": rule_resp.status_code,
            "rule_engine_response": rule_engine_response
        }), 201
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@app.route('/execute-intent', methods=['POST'])
def execute_intent():
    data = request.get_json() or {}
    results = data.get("result", data.get("results", []))

    dispatch_responses = []
    for item in results:
        payload = {
            "deviceId": item.get("deviceId"),
            "action": item.get("action"),
            "parameters": item.get("parameters") or {}
        }
        try:
            dispatch_resp = requests.post(
                DISPATCHER_URL,
                json=payload,
                timeout=5
            )
            dispatch_responses.append({
                "deviceId": payload.get("deviceId"),
                "status": "success" if dispatch_resp.ok else "failed",
                "response": dispatch_resp.json()
            })
        except Exception as exc:
            dispatch_responses.append({
                "deviceId": payload.get("deviceId"),
                "status": "error",
                "error": str(exc)
            })

    return jsonify({
        "dispatch_results": dispatch_responses
    })


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=PORT)
