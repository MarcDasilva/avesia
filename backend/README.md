# Avesia Backend

## Architecture Overview

This backend consists of two services that work together:

1. **Python FastAPI Backend** (`app.py`) - Receives results, manages node configurations, and controls the Node.js service
2. **Node.js Overshoot Service** (`overshoot_service/`) - Serves the browser interface that processes live video using Overshoot SDK

## Communication Flow

```
Browser (Overshoot SDK)  →  Python Backend (FastAPI)
       ↓                              ↓
   Processes video           Receives structured results
   Sends JSON results        Manages node configurations
                            Controls via API
```

## Node System

The system uses a **dynamic node configuration** system where each node defines:
- **Prompt**: What to detect/analyze
- **Datatype**: Expected output type (`boolean`, `integer`, `number`, `string`)
- **Name**: Identifier for the result field

Nodes are automatically loaded from `sample_nodes.json` on startup and generate structured JSON output.

### Example Node Configuration

```json
{
  "nodes": [
    {
      "prompt": "Is there a person in front of the camera?",
      "datatype": "boolean",
      "name": "has_person"
    },
    {
      "prompt": "Count the number of cans visible in the frame",
      "datatype": "integer",
      "name": "can_count"
    }
  ]
}
```

This generates structured output like:
```json
{
  "has_person": true,
  "can_count": 3
}
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
```

### 4. Node Configuration

Edit `sample_nodes.json` to configure what the system should detect:

```json
{
  "nodes": [
    {
      "prompt": "Your detection prompt here",
      "datatype": "boolean",
      "name": "field_name"
    }
  ]
}
```

**Supported datatypes:**
- `boolean` - true/false values
- `integer` - whole numbers
- `number` - decimal numbers
- `string` - text values

## Running the Services

### Start Node.js Service (Terminal 1)

```bash
cd backend/overshoot_service
node index.js
```

Node.js service runs on `http://localhost:3001`

### Start Python Backend (Terminal 2)

```bash
cd backend
python app.py
```

Python backend runs on `http://localhost:8000`

**Note:** Start Node.js first, then Python. Python will automatically load nodes from `sample_nodes.json` and send them to Node.js.

### Open Browser

Navigate to: `http://localhost:3001`

1. Click **"Enable Camera"** → Allow camera permissions
2. Click **"Start Camera"**
3. Results will appear automatically with structured JSON based on your nodes

## API Endpoints

### Python Backend (FastAPI)

- `GET /` - Root endpoint
- `POST /api/results` - Receives results from browser (called automatically)
- `GET /api/results` - Get recent results
- `GET /api/nodes` - Get current nodes configuration
- `POST /api/nodes` - Update nodes configuration
- `POST /api/nodes/reload` - Reload nodes from `sample_nodes.json`
- `POST /api/prompt` - Send prompt update to Node.js service
- `POST /api/control` - Control Node.js service (start/stop)
- `GET /health` - Health check

### Node.js Service (Express)

- `GET /` - Redirects to browser interface
- `GET /api/nodes` - Get current nodes configuration
- `POST /api/nodes` - Update nodes from Python backend
- `POST /api/prompt` - Update detection prompt (called by Python)
- `GET /health` - Health check

## Usage Examples

### Get Current Nodes

```bash
curl http://localhost:8000/api/nodes
```

### Reload Nodes from File

```bash
curl -X POST http://localhost:8000/api/nodes/reload
```

### Get Recent Results

```bash
curl http://localhost:8000/api/results
```

### Update Nodes Programmatically

```bash
curl -X POST http://localhost:8000/api/nodes \
  -H "Content-Type: application/json" \
  -d '{
    "nodes": [
      {
        "prompt": "Is there a person?",
        "datatype": "boolean",
        "name": "has_person"
      }
    ]
  }'
```

## How It Works

1. **Python backend** loads nodes from `sample_nodes.json` on startup
2. **Nodes are sent to Node.js service** which stores the configuration
3. **Browser loads** and receives nodes/prompt via URL parameters
4. **Overshoot SDK** processes video with structured output schema
5. **Results are sent to Python** as structured JSON with typed values
6. **Python backend** receives and processes the structured results

## Changing Node Configuration

To change what the system detects:

1. Edit `sample_nodes.json` in the `backend/` directory
2. Restart the Python backend
3. Refresh the browser at `http://localhost:3001`

The new nodes will be automatically loaded and applied.

## Troubleshooting

### Camera Not Starting
- Check browser console (F12) for errors
- Verify camera permissions are granted
- Ensure no other application is using the camera
- Check VPN connection (required for Overshoot API)

### No Results Appearing
- Verify nodes are loaded: `curl http://localhost:8000/api/nodes`
- Check browser console for SDK errors
- Verify camera feed is visible on the page
- Check Python terminal for received results

### Connection Issues
- Ensure both servers are running
- Check that Node.js starts before Python
- Verify `.env` file has correct API key
- Check network/VPN connection for Overshoot API

### Stream Errors
- The system automatically attempts to reconnect on stream loss
- If persistent, try stopping and restarting the camera
- Check browser console for detailed error messages
