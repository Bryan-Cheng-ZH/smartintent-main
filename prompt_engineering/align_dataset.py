import json
from pathlib import Path

SOURCE_PATH = Path("/Users/lty/Desktop/smartintent-main_fixed/prompt_engineering/dataset/dataset_new.jsonl")
TARGET_PATH = Path("/Users/lty/Desktop/smartintent-main_fixed/prompt_engineering/dataset/dataset_new_aligned.jsonl")

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

PURE_SWITCH_SENTINELS = {
    "tv": {"channel": None, "volume": 0},
    "light": {"brightness": 0},
    "smartCurtains": {"openPercentage": 0},
    "smartWindow": {"openPercentage": 0, "lockStatus": None},
}
MISSING = object()
PURE_SWITCH_PHRASES = [
    "turn on",
    "turn off",
    "switch on",
    "switch off",
    "power on",
    "power off",
    "everything off",
    "everything on",
    "open the window",
    "close the window",
    "open the curtains",
    "close the curtains",
]
PARAMETER_HINTS = [
    "temperature",
    "degree",
    "fan",
    "speed",
    "mode",
    "brightness",
    "bright",
    "dim",
    "volume",
    "channel",
    "level",
    "espresso",
    "latte",
    "americano",
    "percentage",
    "percent",
    "turbo",
    "quiet mode",
]


def clamp_int(value, minimum, maximum):
    if value is None:
        return None
    try:
        return max(minimum, min(maximum, int(value)))
    except (TypeError, ValueError):
        return None


def normalize_status(value):
    return "on" if str(value).lower() == "on" else "off"


def normalize_sensor(sensor_name, value):
    if sensor_name in {"humiditySensor", "co2Sensor"}:
        try:
            return int(value)
        except (TypeError, ValueError):
            return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def normalize_device_state(device_id, raw_state):
    state = dict(DEVICE_DEFAULTS[device_id])
    if isinstance(raw_state, dict):
        state.update(raw_state)

    state["status"] = normalize_status(state.get("status"))

    if device_id == "tv":
        state["channel"] = clamp_int(state.get("channel"), 1, 20) or 1
        state["volume"] = clamp_int(state.get("volume"), 0, 100)
        if state["volume"] is None:
            state["volume"] = 10
    elif device_id == "light":
        state["brightness"] = clamp_int(state.get("brightness"), 1, 5) or 1
    elif device_id == "ac":
        state["temperature"] = clamp_int(state.get("temperature"), 16, 30) or 24
        state["mode"] = str(state.get("mode", "cool")).lower()
        if state["mode"] not in {"cool", "heat"}:
            state["mode"] = "cool"
        state["fanSpeed"] = str(state.get("fanSpeed", "medium")).lower()
        if state["fanSpeed"] not in {"low", "medium", "high"}:
            state["fanSpeed"] = "medium"
    elif device_id == "humidifier":
        state["level"] = clamp_int(state.get("level"), 1, 5) or 1
    elif device_id == "coffeeMachine":
        state["brewMode"] = {
            "espresso": "Espresso",
            "latte": "Latte",
            "americano": "Americano",
        }.get(str(state.get("brewMode", "Espresso")).lower(), "Espresso")
    elif device_id == "smartCurtains":
        state["openPercentage"] = clamp_int(state.get("openPercentage"), 0, 100)
        if state["openPercentage"] is None:
            state["openPercentage"] = 0 if state["status"] == "off" else 100
    elif device_id == "robotVacuum":
        state["cleaningMode"] = {
            "standard": "standard",
            "quiet": "quiet",
            "strong": "turbo",
            "powerful": "turbo",
            "turbo": "turbo",
        }.get(str(state.get("cleaningMode", "standard")).lower(), "standard")
    elif device_id == "airPurifier":
        state["mode"] = str(state.get("mode", "manual")).lower()
        if state["mode"] not in {"manual", "auto"}:
            state["mode"] = "manual"
        state["fanSpeed"] = str(state.get("fanSpeed", "low")).lower()
        if state["fanSpeed"] not in {"low", "medium", "high"}:
            state["fanSpeed"] = "low"
    elif device_id == "smartWindow":
        state["openPercentage"] = clamp_int(state.get("openPercentage"), 0, 100)
        if state["openPercentage"] is None:
            state["openPercentage"] = 0 if state["status"] == "off" else 100
        state["lockStatus"] = str(state.get("lockStatus", "unlocked")).lower()
        if state["lockStatus"] not in {"locked", "unlocked"}:
            state["lockStatus"] = "unlocked"
    elif device_id == "waterHeater":
        state["mode"] = str(state.get("mode", "keep_warm")).lower()
        if state["mode"] not in {"heating", "keep_warm"}:
            state["mode"] = "keep_warm"
        state["temperature"] = clamp_int(state.get("temperature"), 35, 75) or 45

    normalized = {"status": state["status"]}
    for key in DEVICE_PARAMETER_KEYS[device_id]:
        normalized[key] = state[key]
    return normalized


def sanitize_parameters(device_id, raw_parameters):
    raw_parameters = raw_parameters or {}

    if device_id == "tv":
        return {
            "channel": clamp_int(raw_parameters.get("channel"), 1, 20),
            "volume": clamp_int(raw_parameters.get("volume"), 0, 100),
        }
    if device_id == "light":
        return {"brightness": clamp_int(raw_parameters.get("brightness"), 1, 5)}
    if device_id == "ac":
        mode = raw_parameters.get("mode")
        if mode is not None:
            mode = str(mode).lower()
            if mode not in {"cool", "heat"}:
                mode = None
        fan_speed = raw_parameters.get("fanSpeed")
        if fan_speed is not None:
            fan_speed = str(fan_speed).lower()
            if fan_speed not in {"low", "medium", "high"}:
                fan_speed = None
        return {
            "temperature": clamp_int(raw_parameters.get("temperature"), 16, 30),
            "mode": mode,
            "fanSpeed": fan_speed,
        }
    if device_id == "humidifier":
        return {"level": clamp_int(raw_parameters.get("level"), 1, 5)}
    if device_id == "coffeeMachine":
        brew_mode = raw_parameters.get("brewMode")
        normalized_mode = {
            "espresso": "Espresso",
            "latte": "Latte",
            "americano": "Americano",
        }.get(str(brew_mode).lower()) if brew_mode is not None else None
        return {"brewMode": normalized_mode}
    if device_id == "smartCurtains":
        return {"openPercentage": clamp_int(raw_parameters.get("openPercentage"), 0, 100)}
    if device_id == "robotVacuum":
        mode = raw_parameters.get("cleaningMode")
        normalized_mode = {
            "standard": "standard",
            "quiet": "quiet",
            "strong": "turbo",
            "powerful": "turbo",
            "turbo": "turbo",
        }.get(str(mode).lower()) if mode is not None else None
        return {"cleaningMode": normalized_mode}
    if device_id == "airPurifier":
        mode = raw_parameters.get("mode")
        if mode is not None:
            mode = str(mode).lower()
            if mode not in {"manual", "auto"}:
                mode = None
        fan_speed = raw_parameters.get("fanSpeed")
        if fan_speed is not None:
            fan_speed = str(fan_speed).lower()
            if fan_speed not in {"low", "medium", "high"}:
                fan_speed = None
        return {"mode": mode, "fanSpeed": fan_speed}
    if device_id == "smartWindow":
        lock_status = raw_parameters.get("lockStatus")
        if lock_status is not None:
            lock_status = str(lock_status).lower()
            if lock_status not in {"locked", "unlocked"}:
                lock_status = None
        return {
            "openPercentage": clamp_int(raw_parameters.get("openPercentage"), 0, 100),
            "lockStatus": lock_status,
        }
    if device_id == "waterHeater":
        mode = raw_parameters.get("mode")
        if mode is not None:
            mode = str(mode).lower()
            if mode not in {"heating", "keep_warm"}:
                mode = None
        return {
            "mode": mode,
            "temperature": clamp_int(raw_parameters.get("temperature"), 35, 75),
        }
    return {}


def instruction_suggests_pure_switch(instruction):
    lowered = instruction.lower()
    if not any(phrase in lowered for phrase in PURE_SWITCH_PHRASES):
        return False
    return not any(hint in lowered for hint in PARAMETER_HINTS)


def is_pure_switch_action(instruction, action_item, current_state):
    device_id = action_item.get("deviceId")
    action = action_item.get("action")
    if device_id not in DEVICE_PARAMETER_KEYS or action not in {"turn_on", "turn_off"}:
        return False

    if instruction_suggests_pure_switch(instruction):
        return True

    raw_parameters = action_item.get("parameters") or {}
    if not raw_parameters:
        return True

    current_params = current_state[device_id]
    sentinels = PURE_SWITCH_SENTINELS.get(device_id, {})

    for key in DEVICE_PARAMETER_KEYS[device_id]:
        value = raw_parameters.get(key)
        if value is None:
            continue
        sentinel = sentinels.get(key, MISSING)
        if sentinel is not MISSING and value == sentinel:
            continue
        if value != current_params.get(key):
            return False
    return True


def merge_parameters(device_id, raw_parameters, current_state, pure_switch):
    current_params = current_state[device_id]
    sanitized = sanitize_parameters(device_id, raw_parameters)
    merged = {}

    for key in DEVICE_PARAMETER_KEYS[device_id]:
        if pure_switch:
            merged[key] = current_params[key]
        else:
            value = sanitized.get(key)
            if value is None:
                value = current_params[key]
            merged[key] = value

    return merged


def align_record(record):
    input_payload = record["input"]
    original_state = input_payload["current_state"]

    aligned_state = {}
    for device_id in DEVICE_PARAMETER_KEYS:
        aligned_state[device_id] = normalize_device_state(device_id, original_state.get(device_id, {}))

    for sensor_name in [
        "temperatureSensor",
        "humiditySensor",
        "indoorPollutionSensor",
        "outdoorPollutionSensor",
        "co2Sensor",
        "noiseSensor",
    ]:
        aligned_state[sensor_name] = normalize_sensor(sensor_name, original_state.get(sensor_name))

    aligned_input = {
        "userInstruction": input_payload["userInstruction"],
        "current_state": aligned_state,
        "timestamp": input_payload["timestamp"],
    }

    reference_output = dict(record["reference_output"])
    result = []
    pure_switch_rows = []
    instruction = aligned_input["userInstruction"]

    for action_item in reference_output.get("result", []):
        device_id = action_item.get("deviceId")
        if device_id not in DEVICE_PARAMETER_KEYS:
            continue

        pure_switch = is_pure_switch_action(instruction, action_item, aligned_state)
        aligned_action = {
            "deviceId": device_id,
            "action": action_item.get("action"),
            "parameters": merge_parameters(
                device_id,
                action_item.get("parameters"),
                aligned_state,
                pure_switch
            )
        }
        result.append(aligned_action)
        if pure_switch:
            pure_switch_rows.append(aligned_action)

    aligned_output = {
        "needsClarification": bool(reference_output.get("needsClarification")),
        "message": reference_output.get("message", ""),
        "result": [] if reference_output.get("needsClarification") else result,
    }

    return {
        "input": aligned_input,
        "reference_output": aligned_output,
    }, pure_switch_rows


def main():
    aligned_records = []
    pure_switch_examples = []

    with SOURCE_PATH.open("r", encoding="utf-8") as source_file:
        for index, line in enumerate(source_file, 1):
            if not line.strip():
                continue
            record = json.loads(line)
            aligned_record, pure_switch_rows = align_record(record)
            aligned_records.append(aligned_record)
            if pure_switch_rows:
                pure_switch_examples.append({
                    "line": index,
                    "instruction": aligned_record["input"]["userInstruction"],
                    "current_state": aligned_record["input"]["current_state"],
                    "result": pure_switch_rows,
                })

    with TARGET_PATH.open("w", encoding="utf-8") as target_file:
        for record in aligned_records:
            target_file.write(json.dumps(record, ensure_ascii=False) + "\n")

    print(f"Aligned dataset written to: {TARGET_PATH}")
    print(f"Total records: {len(aligned_records)}")
    print(f"Pure switch records detected: {len(pure_switch_examples)}")
    print("Sample pure switch inheritance checks:")
    for example in pure_switch_examples[:8]:
        print(json.dumps(example, ensure_ascii=False))


if __name__ == "__main__":
    main()
