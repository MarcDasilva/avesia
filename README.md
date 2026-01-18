# Avesia

> Making cameras smart

Avesia is a comprehensive project management platform for intelligent camera and video analysis. It combines AI-powered video detection with a visual node-based editing system, enabling users to create smart camera solutions with conditional logic, event triggers, and automated alerts.

## 🌟 Features

- **Project Management**: Organize videos and projects in a user-friendly dashboard
- **Video Upload & Processing**: Upload videos with automatic thumbnail generation
- **AI-Powered Detection**: Real-time video analysis using Overshoot SDK with custom node configurations
- **Visual Node Editor**: Drag-and-drop interface for creating Condition → Listener → Event workflows
- **User Authentication**: Secure authentication via Supabase (Email & Google OAuth)
- **Real-time Analysis**: Live camera feed processing with structured JSON output
- **Email Alerts**: Automated email notifications based on detected events

## 🏗️ Architecture

Avesia consists of three main components:

```
┌─────────────────┐
│  React Frontend │  (Supabase Auth)
│   Port: 5173    │
└────────┬────────┘
         │
         │ API Calls (X-User-Id header)
         │
┌────────▼─────────────────┐
│  FastAPI Backend         │  (MongoDB Atlas)
│  Port: 3001              │
└────────┬─────────────────┘
         │
         │ Controls & Config
         │
┌────────▼─────────────────┐
│  Node.js Overshoot SDK   │  (Video Processing)
│  Port: 3001              │
└──────────────────────────┘
```

### Technology Stack

**Frontend:**
- React 19 with Vite
- Supabase for authentication
- React Flow for visual node editor
- Tailwind CSS + Radix UI components
- GSAP for animations

**Backend:**
- FastAPI (Python)
- MongoDB Atlas for data persistence
- Overshoot SDK (Node.js) for video processing
- OpenCV for video/thumbnail processing

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm
- Python 3.9+
- MongoDB Atlas account (free tier works)
- Supabase account (free tier works)
- Overshoot API key

### 1. Clone the Repository

```bash
git clone <repository-url>
cd avesia
```

### 2. Backend Setup

#### Install Python Dependencies

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

#### Install Node.js Service Dependencies

```bash
cd backend/overshoot_service
npm install
cd ../..
```

#### Configure Backend Environment

Create a `.env` file in the `backend/` directory:

```env
# MongoDB Configuration
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/?retryWrites=true&w=majority
DATABASE_NAME=avesia

# Server Configuration
PORT=3001
FRONTEND_URL=http://localhost:5173

# Overshoot SDK Configuration
OVERSHOOT_API_KEY=your-api-key-here
PYTHON_BACKEND_URL=http://localhost:3001
NODE_SERVICE_PORT=3001
NODE_SERVICE_URL=http://localhost:3001

# Email Alerts Configuration (optional)
SENDER_EMAIL=your-email@example.com
SENDER_PASSWORD=your-app-password
```

**MongoDB Atlas Setup:**
- See `backend/ATLAS_SETUP.md` for detailed MongoDB Atlas configuration
- See `backend/SETUP_ENV.md` for environment variable details

### 3. Frontend Setup

#### Install Dependencies

```bash
cd frontend
npm install
```

#### Configure Frontend Environment

Create a `.env` file in the `frontend/` directory:

```env
VITE_SUPABASE_URL=your-supabase-project-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
VITE_API_BASE_URL=http://localhost:3001
```

**Supabase Setup:**
- See `frontend/SUPABASE_SETUP.md` for detailed Supabase authentication configuration

### 4. Start the Application

You need to run three services:

#### Terminal 1: Node.js Overshoot Service

```bash
cd backend/overshoot_service
node index.js
```

#### Terminal 2: Python Backend

```bash
cd backend
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
uvicorn main:app --reload --port 3001
```

#### Terminal 3: React Frontend

```bash
cd frontend
npm run dev
```

The application will be available at:
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3001
- **API Docs**: http://localhost:3001/docs

## 📖 Project Structure

```
avesia/
├── backend/
│   ├── main.py                 # FastAPI application
│   ├── requirements.txt        # Python dependencies
│   ├── sample_nodes.json       # Node configuration template
│   ├── Nodes/                  # Node processing system
│   │   ├── node_processing.py
│   │   ├── user_nodes.py
│   │   └── nodes_assistant/    # AI prompt parsing
│   ├── overshoot_service/      # Node.js Overshoot SDK service
│   │   └── index.js
│   ├── alerts/                 # Email alert system
│   ├── uploads/                # Uploaded videos
│   ├── thumbnails/             # Generated thumbnails
│   ├── clips/                  # Video clips
│   └── tests/                  # Backend tests
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx             # Main app component
│   │   ├── components/
│   │   │   ├── Dashboard.jsx   # Main dashboard
│   │   │   ├── ProjectView.jsx # Project editor with node editor
│   │   │   ├── ProjectsGrid.jsx
│   │   │   ├── EC2Console.jsx  # Terminal display
│   │   │   └── ...
│   │   ├── contexts/
│   │   │   └── AuthContext.jsx # Supabase auth
│   │   └── lib/
│   │       ├── api.js          # API client
│   │       └── supabase.js     # Supabase client
│   └── public/
│       └── waving.mp4          # Landing page video
│
└── README.md                   # This file
```

## 🎯 Core Concepts

### Projects

Projects are containers for videos and node configurations. Each project:
- Belongs to a specific user (authenticated via Supabase)
- Contains multiple videos
- Has a node configuration (Condition → Listener → Event chains)
- Stores metadata (name, thumbnails, timestamps)

### Node System

The system uses a three-tier node architecture:

1. **Condition Nodes** (Red) - Define when to trigger (weather, time, zone, etc.)
2. **Listener Nodes** (Blue) - Define what to detect (objects, activities, faces, etc.)
3. **Event Nodes** (Green) - Define actions to take (Email, Text alerts)

**Connection Rules:**
- Conditions → Listeners (1:1 per condition, but multiple conditions can share a listener)
- Listeners → Events (1:many)
- Conditions cannot connect directly to Events
- Events are terminal nodes (cannot connect further)

### Video Processing

- Videos are uploaded to the backend and stored in `uploads/` directory
- Thumbnails are automatically generated using OpenCV
- Videos can be streamed via authenticated URLs
- Supports MP4, WebM, and other video formats

### Overshoot SDK Integration

The Node.js service processes live video feeds using Overshoot SDK:
- Receives node configurations from the Python backend
- Processes video with AI detection based on node prompts
- Returns structured JSON results (typed: boolean, integer, number, string)
- Supports custom prompt-based detection

## 🔌 API Reference

### Projects API

All project endpoints require `X-User-Id` header for authentication.

```bash
# Get all projects
GET /api/projects
Headers: X-User-Id: <user-id>

# Create project
POST /api/projects
Headers: X-User-Id: <user-id>
Body: { "name": "Project Name" }

# Get project by ID
GET /api/projects/{id}

# Update project
PUT /api/projects/{id}
Body: { "name": "Updated Name" }

# Delete project
DELETE /api/projects/{id}

# Upload video
POST /api/projects/{project_id}/videos
Headers: X-User-Id: <user-id>
Body: FormData with video file

# Get video file
GET /api/projects/{project_id}/videos/{video_id}/file

# Update project nodes
PUT /api/projects/{project_id}/nodes
Body: { "listeners": [...], "total_listeners": N }
```

### Node System API

```bash
# Get current nodes
GET /api/nodes

# Update nodes
POST /api/nodes
Body: { "nodes": [{ "prompt": "...", "datatype": "...", "name": "..." }] }

# Reload nodes from file
POST /api/nodes/reload

# Get recent results
GET /api/results
```

Full API documentation available at: http://localhost:3001/docs

## 🧪 Testing

### Backend Tests

```bash
cd backend
pytest
```

Tests are located in `backend/tests/` and cover:
- Health endpoints
- Project endpoints
- Overshoot endpoints

## 📝 Configuration Files

### Node Configuration (`backend/sample_nodes.json`)

Define what the system should detect:

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

**Supported datatypes:**
- `boolean` - true/false values
- `integer` - whole numbers
- `number` - decimal numbers
- `string` - text values

## 🔐 Security

- **Authentication**: Supabase handles user authentication (email/password & OAuth)
- **Authorization**: All project endpoints verify user ownership via `X-User-Id` header
- **Video Access**: Video streaming requires authentication via query parameter
- **CORS**: Configured to allow frontend origin only

## 🐛 Troubleshooting

### Backend Issues

**MongoDB Connection Failed:**
- Verify `MONGODB_URI` in `.env` is correct
- Ensure IP address is whitelisted in MongoDB Atlas Network Access
- Check database user permissions

**Node.js Service Not Starting:**
- Verify `OVERSHOOT_API_KEY` is set correctly
- Ensure port 3001 is not in use by another service
- Check Node.js dependencies are installed

**Camera/Video Processing Issues:**
- Verify Overshoot API key is valid
- Check browser console for SDK errors
- Ensure camera permissions are granted

### Frontend Issues

**Authentication Not Working:**
- Verify Supabase credentials in `.env`
- Check that Google OAuth is configured in Supabase dashboard
- Ensure redirect URLs are correct

**API Calls Failing:**
- Verify `VITE_API_BASE_URL` points to backend (http://localhost:3001)
- Check backend is running and CORS is configured
- Verify user session exists (check Supabase auth)

## 📚 Additional Documentation

- `backend/README.md` - Detailed backend documentation
- `backend/ATLAS_SETUP.md` - MongoDB Atlas setup guide
- `backend/SETUP_ENV.md` - Environment variable reference
- `frontend/SUPABASE_SETUP.md` - Supabase authentication setup


## 🙏 Acknowledgments

- Overshoot SDK for video analysis capabilities
- shadcn
- Supabase for authentication infrastructure
- MongoDB Atlas for database hosting
- React Flow for visual node editor

---

**Avesia** - Making cameras smart 🎥✨

