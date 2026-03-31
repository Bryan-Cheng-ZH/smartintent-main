from openai import OpenAI
from flask import Flask, request, jsonify
import requests
import json
import re
import time

app = Flask(__name__)

client = OpenAI(
    api_key="sk-1d027182b56a489981c329fc45daa25c",
    base_url="https://api.deepseek.com"
)

PROMPT_TEMPLATE = '''
You will receive a JSON object with the following keys:

- userInstruction (string): the user's natural language command.
- current_state (object): an object containing the current environment information with the following properties:
    - For controllable devices (only these eight devices are supported):
        - "tv": current status and parameters of the TV.
        - "light": current status and parameters of the light.
        - "ac": current status and parameters of the air conditioner.
        - "humidifier": current status and parameters of the humidifier.
        - "coffeeMachine": current status and parameters of the coffee machine.
        - "smartCurtains": current status and parameters of the smart curtains.
        - "robotVacuum": current status and parameters of the robot vacuum cleaner.
        - "airPurifier": current status and parameters of the air purifier.
    - For sensors (which are not controllable, only provide feedback):
        - "temperatureSensor": current temperature reading.
        - "humiditySensor": current humidity reading.
        - "pollutionSensor": current pollution level.

Your Task:
1. Based on the userInstruction and current_state, determine how to adjust the state and parameters of the eight controllable devices to achieve the user's goal.
1.1. Only generate control instructions for devices that are relevant to the user's instruction. Do not output any objects for devices that are not mentioned or implied by the user's instruction and do not require any changes.
1.2. Only adjust the state and parameters of the devices explicitly mentioned or implied by the user's instruction. All other devices must retain their current state and parameters, without any changes.
2. Use only the following deviceId values for controllable devices: "tv", "light", "ac", "humidifier", "coffeeMachine", "smartCurtains", "robotVacuum", "airPurifier".
   - If the userInstruction refers to any device outside of these, output an object for that device with status and action set to "error" and message "no valid device".
3. For each controllable device, update its status ("on" or "off") using only actions "turn_on" or "turn_off".
4. All device-specific settings must be provided in the "parameters" object.
   - If a device appears in the “results” array, always include all its parameters in the “parameters” object. For each parameter, if it is not modified by the instruction, set its value to null.

Device parameter rules:
- TV:
    - channel: integer between 1 and 20
    - volume: integer between 0 and 100
- Light:
    - brightness: integer between 1 and 5
- AC:
    - temperature: integer between 16 and 30
    - mode: "cool" or "heat"
    - fanSpeed: "low", "medium", "high"
- Humidifier:
    - level: integer between 1 and 5
- Coffee Machine:
    - brewMode: "Espresso", "Latte", or "Americano"
- Smart Curtains:
    - openPercentage: integer between 0 and 100
- Robot Vacuum:
    - cleaningMode: "standard", "quiet", or "turbo"
- Air Purifier:
    - mode: "manual" or "auto"
    - fanSpeed: "low", "medium", "high"

Error Handling:
- If a device is not among the eight supported devices, output:
  {
    "deviceId": "<deviceName>",
    "status": "error",
    "action": "error",
    "message": "no valid device",
    "parameters": {}
  }
- If an invalid parameter is provided, output an object for that device with "status" and "action" set to "error" and include an appropriate "message".

Important:
- Only output the final JSON object with the single key "results".
- Do not include any additional text, explanations, markdown formatting, or extra keys beyond the specified structure.
- Do not output devices with no changes.
- Example outputs should only include devices that have been adjusted, and omit all others.

Output Format:
- Return the final result as a JSON object with a single key "results".
- "results" is an array, each element represents a device control instruction.
- Each element must include exactly the following keys:
  - "message": a string describing the execution outcome or error.
  - "deviceId": the device name.
  - "status": "on", "off", or "error".
  - "action": "turn_on", "turn_off", or "error".
  - "parameters": an object containing the updated parameters for that device (if a parameter is not modified, its value should be null).
- Important: **Always include the "message" field for both success and error cases.**
- Important: **Only output devices that require a state change or parameter adjustment. Do not output devices whose state and parameters remain unchanged.**


Example output:
{
  "results": [
    {
      "message": "TV has been successfully turned on.",
      "deviceId": "tv",
      "status": "on",
      "action": "turn_on",
      "parameters": {
        "channel": 5,
        "volume": 20
      }
    }
  ]
}

# Automation Rule Extension

If the user instruction implies a long-term or persistent automation rule, such as:

- "In the future"
- "Whenever"
- "Always"
- "Automatically"
- "从今以后", "以后", "每次", "一直", "当...时"

Then return a JSON object with a top-level key `"rule"` **instead of** `"results"`.

Use this format exactly:

{
  "rule": {
    "trigger": {
      "sensor": "temperatureSensor",  // Must be one of: temperatureSensor, humiditySensor, pollutionSensor
      "operator": ">",                // One of: >, <, >=, <=, ==, !=
      "value": 28                     // A number
    },
    "action": {
      "deviceId": "ac",               // One of the 8 controllable devices
      "action": "turn_on",            // "turn_on" or "turn_off"
      "parameters": {
        "temperature": 26,            // All parameters required, unmodified = null
        "mode": "cool",
        "fanSpeed": "medium"
      }
    }
  }
}

Do NOT return the "results" key when returning a rule. Only return the top-level "rule" field.

If the instruction is **not a persistent rule**, continue returning "results" as usual.
In the "parameters" object, DO NOT include "status" or "action". Only include valid control parameters for the device.
'''

def summarize_result(result_json):
    summaries = []
    for item in result_json.get("results", []):
        device = item["deviceId"]
        action = item["action"]
        status = item["status"]
        params = item.get("parameters", {})


        if status == "error":
            summaries.append(f"Sorry, there is no such device: {device}.")
        else:
            param_strs = []
            for k, v in params.items():
                if v is not None:
                    param_strs.append(f"{k}: {v}")
            param_summary = ", ".join(param_strs) if param_strs else "no specific parameters"

            summaries.append(f"{device.upper()} will be turned {status}, with {param_summary}.")
    
    return " ".join(summaries)


# Get json file
def call_deepseek(user_instruction, current_state):
    full_prompt = PROMPT_TEMPLATE + f"\n\nInput:\n{{\n  \"userInstruction\": \"{user_instruction}\",\n  \"current_state\": {current_state}\n}}"
    
    response = client.chat.completions.create(
        # model="Qwen/Qwen2.5-14B-Instruct",
        model="deepseek-chat",
        messages=[{"role": "user", "content": full_prompt}],
        temperature=0.3,
        max_tokens=800
    )
    
    content = response.choices[0].message.content
    # content = response['choices'][0]['message']['content']
    # Remove markdown code block markers from the beginning and the end
    cleaned = re.sub(r"^```(?:json)?\s*", "", content)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    return cleaned


# Define API to get intent (POST http://localhost:5000/get-intent)
@app.route('/get-intent', methods=['POST'])
def get_intent():
    data = request.get_json()
    print("[RAW BODY]:", request.data)  # 原始 body
    user_instruction = data.get("userInstruction")
    print("[INTENT]:", user_instruction)

    if not user_instruction:
        return jsonify({"error": "userInstruction is necessary"}), 400 

    try:
        # Get Current State
        aggregator_url = "http://aggregator.default/all-status"
        state_resp = requests.get(aggregator_url, timeout=50)
        current_state = state_resp.json()
        print("[STATE]:", current_state)

        # Call LLM
        result_text = call_deepseek(user_instruction, current_state)
        print("[LLM Results_text]:", result_text)

        # Convert test into json format
        try:
            result_json = json.loads(result_text)
            if "rule" in result_json:
                print("===== NEW GET-INTENT RULE BRANCH =====")
                print("This version should NOT save to Mongo before confirmation")
                print("[LLM Results_json]:", result_json)
                rule_id = f"rule_{int(time.time())}"  # 生成唯一 ID
                rule_payload = {
                    "id": rule_id,
                    "trigger": result_json["rule"]["trigger"],
                    "action": result_json["rule"]["action"],
                    "active": True
                }
                # 存入 rule-engine
                # try:
                #     rule_resp = requests.post("http://rule-engine.default/rules", json=rule_payload)
                #     print("✅ Rule has been written to MongoDB:", rule_resp.json())
                # except Exception as e:
                #     print("❌ Failed to write the rule to MongoDC:", str(e))

                return jsonify({
                    "LLM_result":result_text,
                    "rule_payload": rule_payload,
                    "summary": f"✅ It's suggested to created the rule：When {rule_payload['trigger']['sensor']} {rule_payload['trigger']['operator']} {rule_payload['trigger']['value']} ，Automatically execute {rule_payload['action']['deviceId']} control。",
                    "allError": False
                })
        except Exception as e:
            return jsonify({
                "error": "DeepSeek's return results can not changes into JSON",
                "raw_result": result_text
            }), 500

        print("[LLM Results_json]:", result_json)
        summary_text = summarize_result(result_json)
        print("[LLM Results_json_Natural_language]:", summary_text)

        all_error = all(item["status"] == "error" for item in result_json.get("results", []))

        return jsonify({
            "intent_result": result_json,
            "summary": summary_text,
            "allError": all_error
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    

@app.route('/confirm-rule', methods=['POST'])
def confirm_rule():
    try:
        data = request.get_json()
        print("===== /confirm-rule called =====")
        print("Received data:", data)

        if not data:
            return jsonify({"error": "No JSON body received"}), 400

        rule_payload = data.get("rule_payload")
        print("rule_payload:", rule_payload)

        if not rule_payload:
            return jsonify({"error": "rule_payload is required"}), 400

        if not rule_payload.get("id") or not rule_payload.get("trigger") or not rule_payload.get("action"):
            return jsonify({"error": "rule_payload missing required fields"}), 400

        rule_resp = requests.post(
            "http://rule-engine.default/rules",
            json=rule_payload,
            timeout=10
        )

        print("rule-engine status:", rule_resp.status_code)
        print("rule-engine text:", rule_resp.text)

        try:
            rule_engine_response = rule_resp.json()
        except Exception:
            rule_engine_response = {"raw_text": rule_resp.text}

        if rule_resp.status_code != 201:
            return jsonify({
                "error": "rule-engine failed to create rule",
                "rule_engine_status": rule_resp.status_code,
                "rule_engine_response": rule_engine_response
            }), rule_resp.status_code

        return jsonify({
            "message": "Rule created successfully",
            "rule_engine_status": rule_resp.status_code,
            "rule_engine_response": rule_engine_response
        }), 201

    except Exception as e:
        print("confirm_rule exception:", str(e))
        return jsonify({"error": str(e)}), 500


@app.route('/execute-intent', methods=['POST'])
def execute_intent():
    data = request.get_json()
    results = data.get("results", [])

    dispatch_responses = []
    for item in results:
        if item.get("parameters") is None:
            item["parameters"] = {}
            
        try:
            dispatch_resp = requests.post(
                "http://dispatcher.default/dispatch",
                json=item,
                timeout=5
            )
            dispatch_responses.append({
                "deviceId": item.get("deviceId"),
                "status": "success" if dispatch_resp.ok else "failed",
                "response": dispatch_resp.json()
            })
        except Exception as e:
            dispatch_responses.append({
                "deviceId": item.get("deviceId"),
                "status": "error",
                "error": str(e)
            })

    return jsonify({
        "dispatch_results": dispatch_responses
    })


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5050)
