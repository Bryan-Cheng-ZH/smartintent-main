# Smart Home Command Training Data

This directory contains the `training.csv` file, which is used for training a smart home assistant model. The data consists of user commands, the current state of smart home devices, and the expected response or action from the assistant.

## `training.csv`

This file contains the following columns:

*   **userInstruction**: The command given by the user in natural language (Chinese).
*   **current_state**: A JSON string representing the current status of relevant smart home devices. Each device has a `deviceId`, `parameters` (like volume, humidity, temperature), and `status` (on/off).
*   **needsClarification**: A boolean value indicating whether the user's command is ambiguous and requires a clarifying question from the assistant.
*   **message**: The message the assistant should respond with. This could be a clarifying question or a confirmation of the action taken.
*   **results**: A JSON string representing the action to be taken on a device. This includes the `deviceId`, the `action` to perform (e.g., "turn_on"), and any `parameters` for the action.

### Example

Here is an example from the dataset:

```
userInstruction: 电视声音太大了，吵到邻居了。
current_state: "[{"deviceId": "LivingRoomTV", "parameters": {"volume": 60}, "status": "on"}, {"deviceId": "BedroomTV", "parameters": {"volume": 35}, "status": "on"}, {"deviceId": "KitchenTV", "parameters": {"volume": 25}, "status": "on"}]"
needsClarification: True
message: 您想调整哪个区域的电视音量呢？客厅、卧室还是厨房的电视机？
results: "[]"
```

In this example, the user's instruction is to lower the TV volume. However, since there are multiple TVs, the assistant needs to ask for clarification. Therefore, `needsClarification` is `True`, and the `message` is a question to the user. The `results` are empty because no action is taken until the user provides more information.

```