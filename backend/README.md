# Avesia Backend

Backend server for Avesia project management platform using FastAPI, MongoDB, and Overshoot SDK integration.

## Architecture Overview

This backend consists of two services that work together:

1. **Python FastAPI Backend** (`app.py` / `main.py`) - Receives results, manages node configurations, controls the Node.js service, and provides project management API
2. **Node.js Overshoot Service** (`overshoot_service/`) - Serves the browser interface that processes live video using Overshoot SDK

## Communication Flow

```
Browser (Overshoot SDK)  →  Python Backend (FastAPI)
       ↓                              ↓
   Processes video           Receives structured results
   Sends JSON results        Manages node configurations
                            Manages projects (MongoDB)
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

Create a `.env` file in the `backend/` directory (see `.env.template` for reference):

```env
# MongoDB Configuration
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/?retryWrites=true&w=majority
DATABASE_NAME=avesia
PORT=3001
FRONTEND_URL=http://localhost:5173

# Overshoot SDK Configuration
OVERSHOOT_API_KEY=your-api-key-here
PYTHON_BACKEND_URL=http://localhost:8000
NODE_SERVICE_PORT=3001
NODE_SERVICE_URL=http://localhost:3001

# Email Alerts Configuration
SENDER_EMAIL=your-email@example.com
SENDER_PASSWORD=your-app-password
```

**For MongoDB Atlas:**
- Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
- Create a free cluster if you don't have one
- Click "Connect" on your cluster
- Choose "Connect your application"
- Copy the connection string
- Replace `<password>` with your database user password
- Replace `<username>` with your database username
- The connection string format: `mongodb+srv://username:password@cluster.mongodb.net/?retryWrites=true&w=majority`

See `ATLAS_SETUP.md` and `SETUP_ENV.md` for detailed MongoDB Atlas setup instructions.

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

**Development mode with uvicorn:**
```bash
cd backend
uvicorn main:app --reload --port 3001
```

**Or using the Python script directly:**
```bash
cd backend
python main.py
```

Python backend runs on `http://localhost:3001` by default (or `http://localhost:8000` for the Overshoot service backend if using `app.py`).

**Note:** Start Node.js first, then Python. Python will automatically load nodes from `sample_nodes.json` and send them to Node.js.

### Open Browser

Navigate to: `http://localhost:3001`

1. Click **"Enable Camera"** → Allow camera permissions
2. Click **"Start Camera"**
3. Results will appear automatically with structured JSON based on your nodes

## API Documentation

FastAPI automatically generates interactive API documentation:
- Swagger UI: `http://localhost:3001/docs`
- ReDoc: `http://localhost:3001/redoc`

## API Endpoints

### Overshoot SDK / Node System

#### Python Backend (FastAPI)

- `GET /` - Root endpoint
- `POST /api/results` - Receives results from browser (called automatically)
- `GET /api/results` - Get recent results
- `GET /api/nodes` - Get current nodes configuration
- `POST /api/nodes` - Update nodes configuration
- `POST /api/nodes/reload` - Reload nodes from `sample_nodes.json`
- `POST /api/prompt` - Send prompt update to Node.js service
- `POST /api/control` - Control Node.js service (start/stop)
- `GET /health` - Health check

#### Node.js Service (Express)

- `GET /` - Redirects to browser interface
- `GET /api/nodes` - Get current nodes configuration
- `POST /api/nodes` - Update nodes from Python backend
- `POST /api/prompt` - Update detection prompt (called by Python)
- `GET /health` - Health check

### Project Management API

- `GET /api/projects` - Get all projects for the authenticated user
  - Headers: `X-User-Id: <user-id>`
- `POST /api/projects` - Create a new project
  - Headers: `X-User-Id: <user-id>`
  - Body: `{ "name": "Project Name" }`
- `GET /api/projects/{id}` - Get a specific project
- `PUT /api/projects/{id}` - Update a project
  - Body: `{ "name": "Updated Name" }`
- `DELETE /api/projects/{id}` - Delete a project

### Authentication

The API expects the user ID in the `X-User-Id` header for project management endpoints.

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

### Create a Project

```bash
curl -X POST http://localhost:3001/api/projects \
  -H "Content-Type: application/json" \
  -H "X-User-Id: user123" \
  -d '{
    "name": "My Project"
  }'
```

### Get All Projects

```bash
curl -H "X-User-Id: user123" http://localhost:3001/api/projects
```

## How It Works

1. **Python backend** loads nodes from `sample_nodes.json` on startup
2. **Nodes are sent to Node.js service** which stores the configuration
3. **Browser loads** and receives nodes/prompt via URL parameters
4. **Overshoot SDK** processes video with structured output schema
5. **Results are sent to Python** as structured JSON with typed values
6. **Python backend** receives and processes the structured results
7. **Projects are stored** in MongoDB Atlas for persistence

## Changing Node Configuration

To change what the system detects:

1. Edit `sample_nodes.json` in the `backend/` directory
2. Restart the Python backend
3. Refresh the browser at `http://localhost:3001`

The new nodes will be automatically loaded and applied.

## MongoDB Atlas Setup

1. **Create a MongoDB Atlas Account:**
   - Go to [https://www.mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas)
   - Sign up for a free account (free tier available)

2. **Create a Cluster:**
   - Click "Build a Database"
   - Choose the FREE tier (M0 Sandbox)
   - Select a cloud provider and region
   - Click "Create"

3. **Create a Database User:**
   - Go to "Database Access" in the left sidebar
   - Click "Add New Database User"
   - Choose "Password" authentication
   - Enter a username and password (save these!)
   - Set privileges to "Read and write to any database"
   - Click "Add User"

4. **Whitelist Your IP Address:**
   - Go to "Network Access" in the left sidebar
   - Click "Add IP Address"
   - For development, click "Allow Access from Anywhere" (adds `0.0.0.0/0`)
   - For production, add only your server's IP address
   - Click "Confirm"

5. **Get Your Connection String:**
   - Go to "Database" → click "Connect" on your cluster
   - Choose "Connect your application"
   - Select "Python" and version "3.6 or later"
   - Copy the connection string
   - Replace `<password>` with your database user password
   - Replace `<username>` with your database username

6. **Update your `.env` file:**
   ```
   MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/?retryWrites=true&w=majority
   DATABASE_NAME=avesia
   ```

**Connection String Format:**
- Atlas: `mongodb+srv://username:password@cluster.mongodb.net/?retryWrites=true&w=majority`
- Make sure to URL-encode special characters in your password if needed

See `ATLAS_SETUP.md` and `SETUP_ENV.md` for more detailed setup instructions.

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

### MongoDB Connection Issues
- Verify your `.env` file has the correct `MONGODB_URI`
- Check that your IP address is whitelisted in MongoDB Atlas
- Ensure your database user has the correct permissions
- Verify the connection string format is correct
- See `TROUBLESHOOTING.md` for detailed MongoDB troubleshooting

### Stream Errors
- The system automatically attempts to reconnect on stream loss
- If persistent, try stopping and restarting the camera
- Check browser console for detailed error messages

## Additional Documentation

- `ATLAS_SETUP.md` - Detailed MongoDB Atlas setup guide
- `SETUP_ENV.md` - Environment variable setup instructions
- `TROUBLESHOOTING.md` - Common issues and solutions
