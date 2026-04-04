# Smartwatch Integration Design for SmartIntent System

## 1. Overview

To enhance the realism and usability of the smart home system, we introduce a smartwatch-based input channel.  
This allows users to interact with the system using short, natural, and context-dependent voice commands.

The smartwatch is not a separate system, but an additional input interface integrated into the existing pipeline.

---

## 2. System Pipeline

```text
Smartwatch Voice Input
        ↓
Speech-to-Text (on smartwatch)
        ↓
Send Text (via network or phone)
        ↓
SmartIntent (LLM-based intent parsing)
        ↓
Structured Action Output
        ↓
Web UI Update (device state changes)
```

---

## 3. Example Workflow

### User Input

User speaks to smartwatch:

> "打开空调" (Turn on the air conditioner)

---

### Step-by-Step Execution

#### Step 1: Speech Recognition (on Smartwatch)

- The smartwatch captures voice input
- Converts speech to text:

```text
"打开空调"
```

- Wear OS provides built-in speech recognition (free-form input)
- No need to implement ASR manually

---

#### Step 2: Text Transmission

There are two common approaches:

### Option A: Watch → Backend (Direct)

Smartwatch sends request directly:

```json
POST /intent
{
  "text": "打开空调",
  "source": "smartwatch"
}
```

Advantages:
- Simple
- Fast
- Recommended for demo

---

### Option B: Watch → Phone → Backend

Workflow:

```text
Smartwatch
   ↓
Data Layer API
   ↓
Mobile Phone (Companion App)
   ↓
Backend
```

- Uses Wear OS Data Layer API
- Suitable for paired device communication

---

#### Step 3: Intent Processing (SmartIntent)

Backend sends text to SmartIntent:

```text
Input: "打开空调"
```

Output:

```json
{
  "device": "ac",
  "action": "on"
}
```

---

#### Step 4: System Execution + UI Update

- Backend updates device state
- Web UI reflects the change:

```text
Air Conditioner → ON
```

---

## 4. Key Technologies

### 4.1 Speech Input

- Built-in Wear OS speech recognition
- Supports free-form voice commands
- No additional ASR system required

---

### 4.2 Communication Methods

#### 1. Data Layer API

- Watch ↔ Phone communication
- Low latency
- Reliable for paired devices

#### 2. Direct Network Request

- Watch sends HTTP request directly
- Works via Wi-Fi, cellular, or phone proxy

Example:

```http
POST /intent
```

---

### 4.3 Tiles (Quick Actions)

Tiles are:

- Lightweight UI components
- Designed for quick access
- Not suitable for complex interfaces

Example actions:

- Turn on AC
- Turn off lights
- Too hot
- Too bright

---

## 5. Architecture Design

### Architecture A (Recommended – Simple)

```text
Smartwatch
   ↓
HTTP Request
   ↓
Backend (SmartIntent)
   ↓
Web UI Update
```

Advantages:
- Easy to implement
- Fast deployment
- Minimal system changes

---

### Architecture B (Standard Wear OS Design)

```text
Smartwatch
   ↓
Data Layer API
   ↓
Mobile Phone
   ↓
Backend
   ↓
Web UI Update
```

Advantages:
- More realistic
- Aligns with official Wear OS architecture

Disadvantages:
- Higher complexity
- Requires companion app

---

## 6. Design Characteristics of Smartwatch Input

| Feature | Description |
|--------|------------|
| Length | Short |
| Clarity | Often ambiguous |
| Context | Highly dependent |

### Example Inputs

#### Explicit Commands

- 打开空调
- 关闭灯

#### Ambiguous Commands (Important)

- 有点热 (too hot)
- 太亮了 (too bright)
- 调舒服一点 (make it comfortable)
- make it cozy

---

## 7. Research Significance

Smartwatch input introduces:

- Short utterances
- Missing parameters
- Context-dependent meaning

This creates a challenging testbed for:

> Prompt engineering strategies for reliable intent understanding

---

## 8. Integration with Existing System

The current system already includes:

- Web interface
- Voice input (browser)
- Backend intent processing

Smartwatch integration adds:

```text
New Input Channel: Smartwatch
```

No modification is required for:

- SmartIntent core logic
- Device control logic

---

## 9. Minimum Viable Implementation (MVP)

Smartwatch application only needs:

### Screen 1: Voice Input
- Microphone button
- Display recognized text

### Screen 2: Quick Actions
- Too hot
- Lights off
- Turn on AC

### Screen 3: Feedback
- "AC turned on"
- "Action failed"

---

## 10. System Extension

Original system:

```text
Web Input → Backend → UI
```

Extended system:

```text
Web + Smartwatch Input → Backend → UI
```

---

## 11. Key Insight

The goal is NOT:

> "Control devices using a smartwatch"

The real contribution is:

> Evaluating how LLM + prompt engineering handles short, ambiguous, real-world inputs

---

## 12. Conclusion

By integrating smartwatch input:

- The system becomes more realistic
- The dataset becomes more challenging
- The evaluation becomes more meaningful

This directly supports the research objective:

> Improving reliability of intent-based smart home automation
