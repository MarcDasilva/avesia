# Avesia Backend

## Architecture Overview

This backend consists of two services that work together:

1. **Node.js Overshoot Service** (`overshoot_service/`) - Handles live video processing using Overshoot SDK
2. **Python FastAPI Backend** (`app.py`) - Receives results and controls the Node.js service

## Communication Flow

```
Python Backend (FastAPI)  ←→  Node.js Service (Express)
       ↓                              ↓
   Receives results           Processes video & sends results
   Sends prompts              Receives prompt updates
   Controls service           Responds to control commands
```

## Setup

### 1. Python Backend Setup

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Node.js Service Setup

```bash
cd backend/overshoot_service
npm install
```

### 3. Environment Configuration

Create a `.env` file in the `backend/` directory:

```env
OVERSHOOT_API_KEY=your-api-key-here
PYTHON_BACKEND_URL=http://localhost:8000
NODE_SERVICE_PORT=3001
NODE_SERVICE_URL=http://localhost:3001
INITIAL_PROMPT=Read any visible text
```

## Running the Services

### Start Python Backend (Terminal 1)

```bash
cd backend
python app.py
# or
uvicorn app:app --reload
```

Python backend runs on `http://localhost:8000`

### Start Node.js Service (Terminal 2)

```bash
cd backend/overshoot_service
node index.js
```

Node.js service runs on `http://localhost:3001`

## API Endpoints

### Python Backend (FastAPI)

- `GET /` - Root endpoint
- `POST /api/results` - Receives results from Node.js service (called automatically)
- `GET /api/results` - Get recent results
- `POST /api/prompt` - Send prompt update to Node.js service
- `POST /api/control` - Control Node.js service (start/stop)
- `GET /health` - Health check

### Node.js Service (Express)

- `POST /api/prompt` - Update detection prompt (called by Python)
- `POST /api/start` - Start vision processing
- `POST /api/stop` - Stop vision processing
- `GET /health` - Health check

## Usage Examples

### Update the detection prompt (Python → Node.js)

```bash
curl -X POST http://localhost:8000/api/prompt \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Detect all objects in the scene"}'
```

### Start vision processing

```bash
curl -X POST http://localhost:8000/api/control \
  -H "Content-Type: application/json" \
  -d '{"action": "start"}'
```

### Get recent results

```bash
curl http://localhost:8000/api/results
```

## How It Works

1. **Node.js service** continuously processes live video using Overshoot SDK
2. When results are detected, **Node.js automatically sends them to Python** via `POST /api/results`
3. **Python backend** stores and processes these results
4. **Python can update the prompt** by sending requests to Node.js, which restarts vision processing with the new prompt
5. Both services can check each other's health status
