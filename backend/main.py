"""
Avesia Backend API - Unified FastAPI Application
Combines Overshoot SDK/Node system and MongoDB/Projects API
"""
from fastapi import FastAPI, HTTPException, Header, File, UploadFile, Form, Query, Response, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from typing import List, Optional, Literal, Dict, Any
from enum import Enum
from datetime import datetime
import httpx
import json
import os
import asyncio
import shutil
import uuid
from pathlib import Path
from io import BytesIO
from dotenv import load_dotenv
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure
from bson import ObjectId
from bson.errors import InvalidId
import cv2
from PIL import Image
from google import genai

load_dotenv()

app = FastAPI(title="Avesia Backend API", version="1.0.0")

# CORS middleware - combine configurations
frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_url, "*"],  # Allow frontend and all origins for development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================================
# MongoDB Configuration
# ============================================================================
MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017/")
DATABASE_NAME = os.getenv("DATABASE_NAME", "avesia")

# ============================================================================
# Video Upload Configuration
# ============================================================================
UPLOADS_DIR = Path("uploads")
UPLOADS_DIR.mkdir(exist_ok=True)

THUMBNAILS_DIR = Path("thumbnails")
THUMBNAILS_DIR.mkdir(exist_ok=True)

# MongoDB connection
try:
    # Validate connection string format
    if not MONGODB_URI.startswith('mongodb+srv://') and not MONGODB_URI.startswith('mongodb://'):
        raise ValueError("Connection string must start with 'mongodb+srv://' or 'mongodb://'")
    
    # Use shorter timeout for faster startup (will fail gracefully if MongoDB unavailable)
    client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=5000)  # 5 seconds
    # Test connection
    client.admin.command('ping')
    db = client[DATABASE_NAME]
    print("✅ MongoDB connected successfully")
except ConnectionFailure as e:
    print(f"⚠️  Failed to connect to MongoDB: {e}")
    print("\n🔍 Troubleshooting tips:")
    print("1. ✅ CRITICAL: Go to Atlas → Network Access → Add IP Address")
    print("   - Click 'Allow Access from Anywhere' (0.0.0.0/0) for development")
    print("   - Wait 1-2 minutes after adding IP")
    print("2. Verify connection string format:")
    uri_display = MONGODB_URI.split('@')[0] + '@***' if '@' in MONGODB_URI else MONGODB_URI
    print(f"   Current URI format: {uri_display[:50]}...")
    print("   Should be: mongodb+srv://username:password@cluster.mongodb.net/...")
    print("3. Ensure username and password are correct (no typos)")
    print("4. Check Atlas cluster status is 'Active' (not still creating)")
    # Don't raise - allow server to start even if MongoDB is unavailable
    db = None
except Exception as e:
    print(f"⚠️  MongoDB connection error: {e}")
    print("\n🔍 Troubleshooting tips:")
    print("1. ✅ CRITICAL: Whitelist your IP in Atlas Network Access")
    print("2. Verify connection string uses 'mongodb+srv://' format")
    print("3. Ensure username and password are correct")
    # Don't raise - allow server to start even if MongoDB is unavailable
    db = None

# ============================================================================
# Overshoot SDK / Node System Configuration
# ============================================================================
NODE_SERVICE_URL = os.getenv("NODE_SERVICE_URL", "http://localhost:3001").rstrip("/")
OVERSHOOT_API_KEY = os.getenv("OVERSHOOT_API_KEY", "")
OVERSHOOT_API_URL = os.getenv("OVERSHOOT_API_URL", "https://cluster1.overshoot.ai/api/v0.2")

# Store results in memory (consider using a database for production)
results_store: List[dict] = []

# Store nodes configuration
nodes_store: List[dict] = []

# Default prompt if nodes file is missing
DEFAULT_PROMPT = "Please add nodes configuration in sample_nodes.json file"

# ============================================================================
# Pydantic Models
# ============================================================================

# Overshoot SDK Models
class NodeDataType(str, Enum):
    """Supported data types for nodes"""
    BOOLEAN = "boolean"
    INTEGER = "integer"
    NUMBER = "number"
    STRING = "string"


class Node(BaseModel):
    """Node configuration for vision processing"""
    id: Optional[str] = None
    prompt: str = Field(..., description="The prompt/question for this node")
    datatype: NodeDataType = Field(..., description="The expected data type of the result")
    name: Optional[str] = Field(None, description="Optional name/identifier for the node")


class Result(BaseModel):
    result: str
    timestamp: str
    prompt: str
    node_id: Optional[str] = None


class PromptUpdate(BaseModel):
    prompt: str


class ServiceControl(BaseModel):
    action: str  # "start" or "stop"


class NodesUpdate(BaseModel):
    """Update nodes configuration"""
    nodes: List[Node]

# Project Management Models
class ProjectCreate(BaseModel):
    name: str

class ProjectUpdate(BaseModel):
    name: str

class Project(BaseModel):
    id: str
    userId: str
    name: str
    videos: List[Dict[str, Any]] = Field(default_factory=list)
    nodes: Optional[Dict[str, Any]] = Field(default=None)  # UserNodes configuration
    createdAt: datetime
    updatedAt: datetime

    class Config:
        from_attributes = True

# ============================================================================
# Helper Functions
# ============================================================================

def get_user_id(x_user_id: Optional[str] = Header(None)) -> str:
    """Helper function to get user ID from header"""
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Unauthorized: User ID required")
    return x_user_id


def convert_nodes_to_output_schema(nodes: List[Node]) -> Dict[str, Any]:
    """
    Convert a list of nodes to Overshoot SDK outputSchema format.
    
    Example:
        Input: [Node(prompt="Is there a person?", datatype="boolean", name="has_person")]
        Output: {
            "type": "object",
            "properties": {
                "has_person": {"type": "boolean"},
                "has_person_description": {"type": "string"}
            }
        }
    """
    properties = {}
    
    for i, node in enumerate(nodes):
        # Use node.name if provided, otherwise generate a name from index
        field_name = node.name or f"node_{i}"
        
        # Map Python datatype to JSON schema type
        if node.datatype == NodeDataType.BOOLEAN:
            properties[field_name] = {
                "type": "boolean",
                "description": f"Whether the condition '{node.prompt}' is true"
            }
            # Add a description field for explaining why it's true
            properties[f"{field_name}_description"] = {
                "type": "string",
                "description": f"Detailed explanation of why '{node.prompt}' is true or false"
            }
        elif node.datatype == NodeDataType.INTEGER:
            properties[field_name] = {
                "type": "integer",
                "description": node.prompt
            }
        elif node.datatype == NodeDataType.NUMBER:
            properties[field_name] = {
                "type": "number",
                "description": node.prompt
            }
        elif node.datatype == NodeDataType.STRING:
            properties[field_name] = {
                "type": "string",
                "description": node.prompt
            }
        else:
            # Default to string if unknown type
            properties[field_name] = {
                "type": "string",
                "description": node.prompt
            }
    
    return {
        "type": "object",
        "properties": properties
    }


def create_combined_prompt(nodes: List[Node]) -> str:
    """
    Create a combined prompt from multiple nodes.
    
    Example:
        Input: [
            Node(prompt="Is there a person?", datatype="boolean", name="has_person"),
            Node(prompt="Count the cans", datatype="integer", name="can_count")
        ]
        Output: "Analyze the image quickly: 1. Is there a person? Explain why. 2. Count the cans."
    """
    if len(nodes) == 1:
        prompt = nodes[0].prompt
        if nodes[0].datatype == NodeDataType.BOOLEAN:
            return f"{prompt} Provide a brief explanation."
        return prompt
    
    prompts = []
    for i, node in enumerate(nodes, 1):
        if node.datatype == NodeDataType.BOOLEAN:
            prompts.append(f"{i}. {node.prompt} Explain why.")
        else:
            prompts.append(f"{i}. {node.prompt}")
    
    return "Analyze quickly: " + " ".join(prompts)


def load_nodes_from_file() -> tuple:
    """
    Load nodes from sample_nodes.json file.
    Returns: (nodes_list, output_schema, combined_prompt)
    """
    nodes_file = "sample_nodes.json"
    
    try:
        if not os.path.exists(nodes_file):
            print(f"⚠️  {nodes_file} not found. Using default prompt.")
            return [], {}, DEFAULT_PROMPT
        
        with open(nodes_file, 'r') as f:
            data = json.load(f)
        
        if not data.get("nodes") or not isinstance(data["nodes"], list):
            print(f"⚠️  Invalid {nodes_file} format. Using default prompt.")
            return [], {}, DEFAULT_PROMPT
        
        # Parse nodes
        nodes = []
        for node_data in data["nodes"]:
            try:
                node = Node(**node_data)
                nodes.append(node)
            except Exception as e:
                print(f"⚠️  Error parsing node: {e}")
                continue
        
        if not nodes:
            print(f"⚠️  No valid nodes in {nodes_file}. Using default prompt.")
            return [], {}, DEFAULT_PROMPT
        
        # Generate schema and prompt
        output_schema = convert_nodes_to_output_schema(nodes)
        combined_prompt = create_combined_prompt(nodes)
        
        print(f"✅ Loaded {len(nodes)} nodes from {nodes_file}")
        return nodes, output_schema, combined_prompt
        
    except Exception as e:
        print(f"⚠️  Error loading {nodes_file}: {e}. Using default prompt.")
        return [], {}, DEFAULT_PROMPT


async def send_nodes_to_nodejs(nodes_with_ids, output_schema, combined_prompt, retry_count=0):
    """Send nodes to Node.js service with retry logic"""
    max_retries = 2  # Reduced from 5 to fail faster
    retry_delay = 1  # Reduced from 2 to fail faster
    
    print(f"\n🔄 Attempting to send nodes to Node.js Overshoot service at {NODE_SERVICE_URL}")
    
    try:
        async with httpx.AsyncClient() as client:
            payload = {
                "nodes": nodes_with_ids,
                "outputSchema": output_schema,
                "prompt": combined_prompt
            }
            
            print(f"📤 Sending payload to {NODE_SERVICE_URL}/api/nodes")
            print(f"   Nodes: {len(nodes_with_ids)}")
            print(f"   Prompt length: {len(combined_prompt)} chars")
            
            response = await client.post(
                f"{NODE_SERVICE_URL}/api/nodes",
                json=payload,
                timeout=5.0
            )
            
            print(f"📥 Response status: {response.status_code}")
            
            response.raise_for_status()
            
            response_data = response.json()
            print(f"✅ Node.js service response: {json.dumps(response_data, indent=2)}")
            
            if nodes_with_ids:
                print("\n" + "="*70)
                print(f"✅ PROMPT SUCCESSFULLY SENT TO OVERSHOOT ({len(nodes_with_ids)} nodes)")
                print("="*70)
                print(combined_prompt)
                print("="*70 + "\n")
            else:
                print(f"⚠️  No nodes configured. Using default prompt: {combined_prompt}")
            return True
    except httpx.TimeoutException as e:
        print(f"❌ TIMEOUT: Node.js service at {NODE_SERVICE_URL} did not respond")
        if retry_count < max_retries:
            print(f"   Retrying... (attempt {retry_count + 1}/{max_retries})")
            await asyncio.sleep(retry_delay)
            return await send_nodes_to_nodejs(nodes_with_ids, output_schema, combined_prompt, retry_count + 1)
        else:
            print(f"❌ Failed after {max_retries} attempts")
            return False
    except httpx.ConnectError as e:
        print(f"❌ CONNECTION ERROR: Cannot reach Node.js service at {NODE_SERVICE_URL}")
        print(f"   Error: {e}")
        print(f"   ⚠️  Is the Node.js Overshoot service running?")
        if retry_count < max_retries:
            print(f"   Retrying... (attempt {retry_count + 1}/{max_retries})")
            await asyncio.sleep(retry_delay)
            return await send_nodes_to_nodejs(nodes_with_ids, output_schema, combined_prompt, retry_count + 1)
        else:
            print(f"❌ Failed after {max_retries} attempts")
            return False
    except Exception as e:
        print(f"❌ ERROR sending to Node.js service: {type(e).__name__}: {e}")
        if retry_count < max_retries:
            print(f"   Retrying... (attempt {retry_count + 1}/{max_retries})")
            await asyncio.sleep(retry_delay)
            return await send_nodes_to_nodejs(nodes_with_ids, output_schema, combined_prompt, retry_count + 1)
        else:
            print(f"❌ Failed after {max_retries} attempts")
            print(f"   ⚠️  Node.js service may not be running at {NODE_SERVICE_URL}")
            print(f"   ⚠️  Check if overshoot_service is started")
            return False


async def initialize_nodes_on_startup():
    """Initialize nodes from file on startup and send to Node.js service"""
    nodes, output_schema, combined_prompt = load_nodes_from_file()
    
    # Store nodes with IDs
    nodes_with_ids = []
    for i, node in enumerate(nodes):
        node_dict = node.dict()
        if not node_dict.get("id"):
            node_dict["id"] = node_dict.get("name") or f"node_{i}"
        node_dict["name"] = node_dict.get("name") or node_dict["id"]
        nodes_with_ids.append(node_dict)
    
    nodes_store.clear()
    nodes_store.extend(nodes_with_ids)
    
    # Try to send nodes to Node.js service, but don't block startup
    # Use asyncio.create_task to run in background
    asyncio.create_task(send_nodes_to_nodejs_async(nodes_with_ids, output_schema, combined_prompt))


async def send_nodes_to_nodejs_async(nodes_with_ids, output_schema, combined_prompt):
    """Send nodes to Node.js service asynchronously (non-blocking)"""
    # Wait a bit for Node.js service to start
    await asyncio.sleep(1)  # Reduced from 2 seconds
    await send_nodes_to_nodejs(nodes_with_ids, output_schema, combined_prompt)


# ============================================================================
# Startup Event
# ============================================================================
@app.on_event("startup")
async def startup_event():
    """Initialize nodes when server starts"""
    await initialize_nodes_on_startup()

# ============================================================================
# Root and Health Endpoints
# ============================================================================

@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "Avesia Backend API",
        "version": "1.0.0",
        "node_service_url": NODE_SERVICE_URL,
        "active_nodes": len(nodes_store),
        "mongodb_connected": db is not None
    }


@app.get("/health")
async def health_check():
    """Health check endpoint (for Overshoot SDK compatibility)"""
    # Check if Node.js service is reachable
    node_status = "unknown"
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{NODE_SERVICE_URL}/health", timeout=2.0)
            node_status = "connected" if response.status_code == 200 else "error"
    except:
        node_status = "disconnected"
    
    return {
        "status": "ok",
        "node_service_status": node_status,
        "results_count": len(results_store),
        "mongodb_connected": db is not None
    }


@app.get("/api/health")
async def api_health_check():
    """Health check endpoint (for Projects API compatibility)"""
    mongodb_status = "connected" if db is not None else "disconnected"
    
    # Try to ping MongoDB if connected
    if db:
        try:
            client.admin.command('ping')
        except:
            mongodb_status = "error"
    
    return {
        "status": "OK",
        "message": "Server is running",
        "mongodb_status": mongodb_status,
        "node_service_url": NODE_SERVICE_URL
    }

# ============================================================================
# Overshoot SDK / Node System Endpoints
# ============================================================================

@app.post("/api/results")
async def receive_result(result: Result):
    """
    Receive results from Node.js Overshoot service
    This endpoint is called by the Node.js service when vision detects something
    Results can be plain text or JSON (if using structured output)
    """
    # Try to parse as JSON if possible (for structured output)
    parsed_result = None
    is_json = False
    
    try:
        parsed_result = json.loads(result.result)
        is_json = True
    except (json.JSONDecodeError, TypeError):
        parsed_result = result.result
    
    result_data = {
        "result": parsed_result,
        "raw_result": result.result,
        "timestamp": result.timestamp,
        "prompt": result.prompt,
        "node_id": result.node_id,
        "is_json": is_json,
        "received_at": datetime.now().isoformat()
    }
    
    results_store.append(result_data)
    
    # Keep only last 100 results in memory
    if len(results_store) > 100:
        results_store.pop(0)
    
    # Print result in a clear format
    print("\n" + "="*70)
    print(f"📹 OVERSHOOT RESULT RECEIVED - {result_data['received_at']}")
    print("="*70)
    print(f"🔍 Prompt Used: {result.prompt}")
    if result.node_id:
        print(f"🆔 Node ID: {result.node_id}")
    print(f"\n📝 Result Type: {'JSON (Structured)' if is_json else 'Text (Unstructured)'}")
    print("-"*70)
    if is_json:
        print(json.dumps(parsed_result, indent=2))
    else:
        print(result.result)
    print("="*70 + "\n")
    
    return {"success": True, "message": "Result received"}


@app.get("/api/results")
async def get_results(limit: int = 10):
    """Get recent results"""
    return {
        "results": results_store[-limit:],
        "total": len(results_store)
    }


@app.post("/api/nodes")
async def update_nodes(nodes_update: NodesUpdate):
    """
    Update the nodes configuration
    This sends the nodes to the Node.js service to configure Overshoot SDK
    """
    if not nodes_update.nodes:
        raise HTTPException(status_code=400, detail="At least one node is required")
    
    # Store nodes with IDs
    nodes_with_ids = []
    for i, node in enumerate(nodes_update.nodes):
        node_dict = node.dict()
        if not node_dict.get("id"):
            node_dict["id"] = node_dict.get("name") or f"node_{i}"
        node_dict["name"] = node_dict.get("name") or node_dict["id"]
        nodes_with_ids.append(node_dict)
    
    nodes_store.clear()
    nodes_store.extend(nodes_with_ids)
    
    # Convert to outputSchema
    output_schema = convert_nodes_to_output_schema([Node(**n) for n in nodes_with_ids])
    combined_prompt = create_combined_prompt([Node(**n) for n in nodes_with_ids])
    
    # Try to send to Node.js service (optional - frontend can use nodes directly)
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{NODE_SERVICE_URL}/api/nodes",
                json={
                    "nodes": nodes_with_ids,
                    "outputSchema": output_schema,
                    "prompt": combined_prompt
                },
                timeout=2.0  # Short timeout since Node.js service is optional
            )
            response.raise_for_status()
            print("✅ Nodes sent to Node.js service (if running)")
    except:
        # Node.js service is optional - frontend will use nodes directly
        pass
    
    return {
        "success": True,
        "message": "Nodes updated successfully",
        "nodes": nodes_with_ids,
        "outputSchema": output_schema,
        "prompt": combined_prompt
    }


@app.get("/api/nodes")
async def get_nodes():
    """Get current nodes configuration"""
    print("\n" + "="*70)
    print("📡 CAMERA REQUESTING NODES (Camera is starting)")
    print("="*70)
    
    # If nodes_store is empty, reload from file
    if not nodes_store:
        print("⚠️  nodes_store is empty, loading from file...")
        nodes, output_schema, combined_prompt = load_nodes_from_file()
        nodes_with_ids = []
        for i, node in enumerate(nodes):
            node_dict = node.dict()
            if not node_dict.get("id"):
                node_dict["id"] = node_dict.get("name") or f"node_{i}"
            node_dict["name"] = node_dict.get("name") or node_dict["id"]
            nodes_with_ids.append(node_dict)
        nodes_store.extend(nodes_with_ids)
    else:
        print(f"✅ Using existing nodes_store with {len(nodes_store)} nodes")
    
    # Generate schema and prompt for response
    if nodes_store:
        output_schema = convert_nodes_to_output_schema([Node(**n) for n in nodes_store])
        combined_prompt = create_combined_prompt([Node(**n) for n in nodes_store])
        
        print(f"\n📋 NODES BEING SENT TO CAMERA:")
        print(json.dumps(nodes_store, indent=2))
        print(f"\n🎯 PROMPT BEING SENT TO CAMERA:")
        print(combined_prompt)
        print("="*70 + "\n")
    else:
        output_schema = {}
        combined_prompt = DEFAULT_PROMPT
        print("⚠️  No nodes available, using default prompt")
        print("="*70 + "\n")
    
    return {
        "nodes": nodes_store,
        "count": len(nodes_store),
        "outputSchema": output_schema,
        "prompt": combined_prompt
    }


@app.get("/api/overshoot/config")
async def get_overshoot_config():
    """Get Overshoot SDK configuration for frontend"""
    return {
        "apiUrl": OVERSHOOT_API_URL,
        "apiKey": OVERSHOOT_API_KEY if OVERSHOOT_API_KEY else "",
        "hasApiKey": bool(OVERSHOOT_API_KEY and OVERSHOOT_API_KEY != "your-api-key")
    }


@app.post("/api/nodes/reload")
async def reload_nodes():
    """Reload nodes from sample_nodes.json file"""
    nodes, output_schema, combined_prompt = load_nodes_from_file()
    
    # Store nodes with IDs
    nodes_with_ids = []
    for i, node in enumerate(nodes):
        node_dict = node.dict()
        if not node_dict.get("id"):
            node_dict["id"] = node_dict.get("name") or f"node_{i}"
        node_dict["name"] = node_dict.get("name") or node_dict["id"]
        nodes_with_ids.append(node_dict)
    
    nodes_store.clear()
    nodes_store.extend(nodes_with_ids)
    
    # Send to Node.js service
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{NODE_SERVICE_URL}/api/nodes",
                json={
                    "nodes": nodes_with_ids,
                    "outputSchema": output_schema,
                    "prompt": combined_prompt
                },
                timeout=10.0
            )
            response.raise_for_status()
            return {
                "success": True,
                "message": "Nodes reloaded successfully",
                "nodes": nodes_with_ids,
                "count": len(nodes_with_ids),
                "outputSchema": output_schema,
                "prompt": combined_prompt
            }
    except httpx.RequestError as e:
        return {
            "success": True,
            "message": "Nodes reloaded from file, but could not update Node.js service",
            "error": str(e),
            "nodes": nodes_with_ids,
            "count": len(nodes_with_ids),
            "outputSchema": output_schema,
            "prompt": combined_prompt
        }
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=f"Node.js service error: {e.response.text}")


@app.delete("/api/nodes")
async def clear_nodes():
    """Clear all nodes configuration"""
    nodes_store.clear()
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{NODE_SERVICE_URL}/api/nodes",
                json={"nodes": [], "outputSchema": {}, "prompt": ""},
                timeout=10.0
            )
            response.raise_for_status()
    except:
        pass  # Ignore errors if Node.js service is not available
    
    return {"success": True, "message": "Nodes cleared"}


@app.post("/api/prompt")
async def update_prompt(prompt_update: PromptUpdate):
    """
    Send prompt update to Node.js service
    This updates what the vision service should detect
    """
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{NODE_SERVICE_URL}/api/prompt",
                json={"prompt": prompt_update.prompt},
                timeout=10.0
            )
            response.raise_for_status()
            return response.json()
    except httpx.RequestError as e:
        raise HTTPException(status_code=503, detail=f"Failed to connect to Node.js service: {str(e)}")
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=f"Node.js service error: {e.response.text}")


@app.post("/api/control")
async def control_service(control: ServiceControl):
    """
    Control the Node.js vision service (start/stop)
    """
    if control.action not in ["start", "stop"]:
        raise HTTPException(status_code=400, detail="Action must be 'start' or 'stop'")
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{NODE_SERVICE_URL}/api/{control.action}",
                timeout=10.0
            )
            response.raise_for_status()
            return response.json()
    except httpx.RequestError as e:
        raise HTTPException(status_code=503, detail=f"Failed to connect to Node.js service: {str(e)}")
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=f"Node.js service error: {e.response.text}")

# ============================================================================
# Project Management Endpoints
# ============================================================================

@app.get("/api/projects", response_model=List[Project])
async def get_projects(userId: str = Header(None, alias="X-User-Id")):
    """Get all projects for the authenticated user"""
    if not userId:
        raise HTTPException(status_code=401, detail="Unauthorized: User ID required")
    
    if db is None:
        raise HTTPException(status_code=503, detail="MongoDB is not connected")
    
    projects = db.projects.find({"userId": userId}).sort("createdAt", -1)
    result = []
    for project in projects:
        result.append({
            "id": str(project["_id"]),
            "userId": project["userId"],
            "name": project["name"],
            "thumbnailPath": project.get("thumbnailPath"),
            "thumbnailFilename": project.get("thumbnailFilename"),
            "createdAt": project["createdAt"],
            "updatedAt": project["updatedAt"],
        })
    return result


@app.post("/api/projects", response_model=Project, status_code=201)
async def create_project(project_data: ProjectCreate, userId: str = Header(None, alias="X-User-Id")):
    """Create a new project"""
    if not userId:
        raise HTTPException(status_code=401, detail="Unauthorized: User ID required")
    
    if db is None:
        raise HTTPException(status_code=503, detail="MongoDB is not connected")
    
    if not project_data.name or not project_data.name.strip():
        raise HTTPException(status_code=400, detail="Project name is required")
    
    now = datetime.utcnow()
    project = {
        "userId": userId,
        "name": project_data.name.strip(),
        "videos": [],  # Initialize videos array
        "nodes": None,  # Initialize nodes configuration
        "createdAt": now,
        "updatedAt": now,
    }
    
    result = db.projects.insert_one(project)
    project["_id"] = result.inserted_id
    
    return {
        "id": str(project["_id"]),
        "userId": project["userId"],
        "name": project["name"],
        "videos": project.get("videos", []),
        "nodes": project.get("nodes"),  # Include nodes in response
        "createdAt": project["createdAt"],
        "updatedAt": project["updatedAt"],
    }


@app.get("/api/projects/{project_id}", response_model=Project)
async def get_project(project_id: str, userId: str = Header(None, alias="X-User-Id")):
    """Get a specific project"""
    if not userId:
        raise HTTPException(status_code=401, detail="Unauthorized: User ID required")
    
    if db is None:
        raise HTTPException(status_code=503, detail="MongoDB is not connected")
    
    try:
        object_id = ObjectId(project_id)
    except (InvalidId, ValueError):
        raise HTTPException(status_code=400, detail="Invalid project ID")
    
    project = db.projects.find_one({"_id": object_id, "userId": userId})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    videos = project.get("videos", [])
    nodes = project.get("nodes")  # Get nodes configuration
    # Debug logging
    print(f"DEBUG: Project {project_id} has {len(videos)} videos")
    print(f"DEBUG: Videos field exists: {'videos' in project}")
    print(f"DEBUG: Videos value: {videos}")
    
    return {
        "id": str(project["_id"]),
        "userId": project["userId"],
        "name": project["name"],
        "videos": videos,
        "nodes": nodes,  # Include nodes in response
        "thumbnailPath": project.get("thumbnailPath"),
        "thumbnailFilename": project.get("thumbnailFilename"),
        "createdAt": project["createdAt"],
        "updatedAt": project["updatedAt"],
    }


@app.put("/api/projects/{project_id}", response_model=Project)
async def update_project(project_id: str, project_data: ProjectUpdate, userId: str = Header(None, alias="X-User-Id")):
    """Update a project"""
    if not userId:
        raise HTTPException(status_code=401, detail="Unauthorized: User ID required")
    
    if db is None:
        raise HTTPException(status_code=503, detail="MongoDB is not connected")
    
    try:
        object_id = ObjectId(project_id)
    except (InvalidId, ValueError):
        raise HTTPException(status_code=400, detail="Invalid project ID")
    
    update_data = {
        "name": project_data.name.strip(),
        "updatedAt": datetime.utcnow(),
    }
    
    try:
        result = db.projects.find_one_and_update(
            {"_id": object_id, "userId": userId},
            {"$set": update_data},
            return_document=True
        )
    except Exception:
        # If mongomock raises an exception, treat as not found
        result = None
    
    if not result:
        raise HTTPException(status_code=404, detail="Project not found")
    
    return {
        "id": str(result["_id"]),
        "userId": result["userId"],
        "name": result["name"],
        "videos": result.get("videos", []),
        "createdAt": result["createdAt"],
        "updatedAt": result["updatedAt"],
    }


@app.delete("/api/projects/{project_id}")
async def delete_project(project_id: str, userId: str = Header(None, alias="X-User-Id")):
    """Delete a project"""
    if not userId:
        raise HTTPException(status_code=401, detail="Unauthorized: User ID required")
    
    if db is None:
        raise HTTPException(status_code=503, detail="MongoDB is not connected")
    
    try:
        object_id = ObjectId(project_id)
    except (InvalidId, ValueError):
        raise HTTPException(status_code=400, detail="Invalid project ID")
    
    try:
        result = db.projects.find_one_and_delete({"_id": object_id, "userId": userId})
    except Exception:
        # If mongomock raises an exception, treat as not found
        result = None
    
    if not result:
        raise HTTPException(status_code=404, detail="Project not found")
    
    return {"message": "Project deleted successfully"}


def generate_thumbnail(video_path: Path, thumbnail_path: Path, thumbnail_size: tuple = (640, 360)) -> bool:
    """Generate a thumbnail from a video file"""
    try:
        # Open video file
        cap = cv2.VideoCapture(str(video_path))
        if not cap.isOpened():
            return False
        
        # Get video properties
        fps = cap.get(cv2.CAP_PROP_FPS)
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        
        # Capture frame at 10% of video duration (or first frame if video is too short)
        target_frame = max(1, int(frame_count * 0.1))
        cap.set(cv2.CAP_PROP_POS_FRAMES, target_frame)
        
        # Read frame
        ret, frame = cap.read()
        cap.release()
        
        if not ret or frame is None:
            # Fallback to first frame
            cap = cv2.VideoCapture(str(video_path))
            ret, frame = cap.read()
            cap.release()
            if not ret or frame is None:
                return False
        
        # Convert BGR to RGB (OpenCV uses BGR, PIL uses RGB)
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        
        # Convert to PIL Image
        pil_image = Image.fromarray(frame_rgb)
        
        # Resize to thumbnail size while maintaining aspect ratio
        pil_image.thumbnail(thumbnail_size, Image.Resampling.LANCZOS)
        
        # Create a new image with the desired size and paste the resized image
        thumbnail = Image.new('RGB', thumbnail_size, (0, 0, 0))
        img_width, img_height = pil_image.size
        x_offset = (thumbnail_size[0] - img_width) // 2
        y_offset = (thumbnail_size[1] - img_height) // 2
        thumbnail.paste(pil_image, (x_offset, y_offset))
        
        # Save thumbnail
        thumbnail.save(thumbnail_path, 'JPEG', quality=85)
        return True
    except Exception as e:
        print(f"Error generating thumbnail: {e}")
        return False


@app.post("/api/projects/{project_id}/videos")
async def upload_video(
    project_id: str,
    file: UploadFile = File(...),
    userId: str = Header(None, alias="X-User-Id")
):
    """Upload a video file for a project"""
    if not userId:
        raise HTTPException(status_code=401, detail="Unauthorized: User ID required")
    
    if db is None:
        raise HTTPException(status_code=503, detail="MongoDB is not connected")
    
    # Validate file is a video
    if not file.content_type or not file.content_type.startswith("video/"):
        raise HTTPException(status_code=400, detail="File must be a video")
    
    try:
        object_id = ObjectId(project_id)
    except (InvalidId, ValueError):
        raise HTTPException(status_code=400, detail="Invalid project ID")
    
    # Verify project exists and belongs to user
    project = db.projects.find_one({"_id": object_id, "userId": userId})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Generate unique filename
    file_extension = Path(file.filename).suffix
    video_uuid = str(uuid.uuid4())
    unique_filename = f"{video_uuid}{file_extension}"
    file_path = UPLOADS_DIR / unique_filename
    
    # Save file to disk
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")
    
    # Generate thumbnail
    thumbnail_filename = f"{video_uuid}.jpg"
    thumbnail_path = THUMBNAILS_DIR / thumbnail_filename
    thumbnail_generated = False
    
    try:
        thumbnail_generated = generate_thumbnail(file_path, thumbnail_path)
    except Exception as e:
        print(f"Warning: Failed to generate thumbnail: {e}")
    
    # Create video metadata
    video_data = {
        "id": video_uuid,
        "filename": file.filename,
        "filepath": str(file_path),
        "contentType": file.content_type,
        "uploadedAt": datetime.utcnow(),
    }
    
    # Add thumbnail path if generated
    if thumbnail_generated:
        video_data["thumbnailPath"] = str(thumbnail_path)
        video_data["thumbnailFilename"] = thumbnail_filename
    
    # Update project: add video and update thumbnail if this is the first video
    update_data = {
        "$push": {"videos": video_data},
        "$set": {"updatedAt": datetime.utcnow()}
    }
    
    # If project doesn't have a thumbnail yet, set it from this video
    if thumbnail_generated and not project.get("thumbnailPath"):
        update_data["$set"]["thumbnailPath"] = str(thumbnail_path)
        update_data["$set"]["thumbnailFilename"] = thumbnail_filename
    
    # Add video to project
    db.projects.update_one(
        {"_id": object_id, "userId": userId},
        update_data
    )
    
    # Refetch the project to ensure we have the latest data with the new video
    updated_project = db.projects.find_one({"_id": object_id, "userId": userId})
    
    return {
        "success": True,
        "video": video_data,
        "message": "Video uploaded successfully",
        "videos_count": len(updated_project.get("videos", [])) if updated_project else 0
    }


@app.get("/api/projects/{project_id}/videos/{video_id}/file")
async def get_video_file(
    project_id: str,
    video_id: str,
    request: Request,
    userId: Optional[str] = Header(None, alias="X-User-Id"),
    userId_query: Optional[str] = Query(None, alias="userId")
):
    """Serve a video file for a project"""
    # Accept userId from either header or query parameter
    userId = userId or userId_query
    if not userId:
        raise HTTPException(status_code=401, detail="Unauthorized: User ID required")
    
    if db is None:
        raise HTTPException(status_code=503, detail="MongoDB is not connected")
    
    try:
        object_id = ObjectId(project_id)
    except (InvalidId, ValueError):
        raise HTTPException(status_code=400, detail="Invalid project ID")
    
    # Verify project exists and belongs to user
    project = db.projects.find_one({"_id": object_id, "userId": userId})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Find video in project
    videos = project.get("videos", [])
    video = next((v for v in videos if v.get("id") == video_id), None)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    
    file_path = Path(video["filepath"])
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Video file not found on server")
    
    # Create FileResponse with CORS headers
    response = FileResponse(
        str(file_path),
        media_type=video.get("contentType", "video/mp4"),
        filename=video.get("filename", "video.mp4")
    )
    
    # Explicitly set CORS headers to ensure they're present
    # This helps with fetch() requests from the frontend
    # Get origin from request, or use configured frontend_url
    origin = request.headers.get("origin") or frontend_url
    if origin:
        response.headers["Access-Control-Allow-Origin"] = origin
    response.headers["Access-Control-Allow-Credentials"] = "true"
    response.headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "*"
    
    return response


@app.get("/api/projects/{project_id}/thumbnail")
async def get_project_thumbnail(
    project_id: str,
    request: Request,
    userId: Optional[str] = Header(None, alias="X-User-Id"),
    userId_query: Optional[str] = Query(None, alias="userId")
):
    """Serve a thumbnail image for a project"""
    # Accept userId from either header or query parameter
    userId = userId or userId_query
    if not userId:
        raise HTTPException(status_code=401, detail="Unauthorized: User ID required")
    
    if db is None:
        raise HTTPException(status_code=503, detail="MongoDB is not connected")
    
    try:
        object_id = ObjectId(project_id)
    except (InvalidId, ValueError):
        raise HTTPException(status_code=400, detail="Invalid project ID")
    
    # Verify project exists and belongs to user
    project = db.projects.find_one({"_id": object_id, "userId": userId})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Check if project has a thumbnail
    thumbnail_path = project.get("thumbnailPath")
    thumbnail_filename = project.get("thumbnailFilename")
    
    if not thumbnail_path or not thumbnail_filename:
        raise HTTPException(status_code=404, detail="Thumbnail not found")
    
    # Verify file exists
    file_path = Path(thumbnail_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Thumbnail file not found")
    
    response = FileResponse(
        str(file_path),
        media_type="image/jpeg",
        filename=thumbnail_filename
    )
    
    # Set CORS headers
    origin = request.headers.get("origin") or frontend_url
    if origin:
        response.headers["Access-Control-Allow-Origin"] = origin
    response.headers["Access-Control-Allow-Credentials"] = "true"
    response.headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "*"
    
    return response


@app.post("/api/projects/{project_id}/thumbnail")
async def upload_project_thumbnail(
    project_id: str,
    file: UploadFile = File(...),
    userId: str = Header(None, alias="X-User-Id")
):
    """Upload a thumbnail image for a project"""
    if not userId:
        raise HTTPException(status_code=401, detail="Unauthorized: User ID required")
    
    if db is None:
        raise HTTPException(status_code=503, detail="MongoDB is not connected")
    
    # Validate file is an image
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")
    
    try:
        object_id = ObjectId(project_id)
    except (InvalidId, ValueError):
        raise HTTPException(status_code=400, detail="Invalid project ID")
    
    # Verify project exists and belongs to user
    project = db.projects.find_one({"_id": object_id, "userId": userId})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Generate unique filename
    file_extension = Path(file.filename).suffix
    # Only allow image extensions
    if file_extension.lower() not in ['.jpg', '.jpeg', '.png', '.gif', '.webp']:
        file_extension = '.jpg'
    
    thumbnail_uuid = str(uuid.uuid4())
    thumbnail_filename = f"{thumbnail_uuid}.jpg"
    thumbnail_path = THUMBNAILS_DIR / thumbnail_filename
    
    # Save file to disk
    try:
        # Read file content into memory
        file_content = await file.read()
        
        # Open image from bytes
        image = Image.open(BytesIO(file_content))
        
        # Convert RGBA to RGB if necessary (remove alpha channel)
        if image.mode in ('RGBA', 'LA', 'P'):
            # Create white background
            rgb_image = Image.new('RGB', image.size, (255, 255, 255))
            if image.mode == 'P':
                image = image.convert('RGBA')
            rgb_image.paste(image, mask=image.split()[-1] if image.mode in ('RGBA', 'LA') else None)
            image = rgb_image
        elif image.mode != 'RGB':
            image = image.convert('RGB')
        
        # Resize to standard thumbnail size (640x360) while maintaining aspect ratio
        image.thumbnail((640, 360), Image.Resampling.LANCZOS)
        
        # Create a new image with the desired size and paste the resized image
        thumbnail = Image.new('RGB', (640, 360), (0, 0, 0))
        img_width, img_height = image.size
        x_offset = (640 - img_width) // 2
        y_offset = (360 - img_height) // 2
        thumbnail.paste(image, (x_offset, y_offset))
        
        # Save as JPEG
        thumbnail.save(thumbnail_path, 'JPEG', quality=85)
        
        # If there's an old thumbnail, optionally delete it (or keep for history)
        old_thumbnail_path = project.get("thumbnailPath")
        if old_thumbnail_path:
            old_path = Path(old_thumbnail_path)
            if old_path.exists() and old_path != thumbnail_path:
                try:
                    old_path.unlink()
                except Exception as e:
                    print(f"Warning: Failed to delete old thumbnail: {e}")
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process image: {str(e)}")
    
    # Update project with new thumbnail
    db.projects.update_one(
        {"_id": object_id, "userId": userId},
        {
            "$set": {
                "thumbnailPath": str(thumbnail_path),
                "thumbnailFilename": thumbnail_filename,
                "updatedAt": datetime.utcnow()
            }
        }
    )
    
    return {
        "success": True,
        "thumbnailPath": str(thumbnail_path),
        "thumbnailFilename": thumbnail_filename,
        "message": "Thumbnail uploaded successfully"
    }


def nodes_to_prompt_description(nodes_data: Dict[str, Any]) -> str:
    """
    Convert nodes configuration to a natural language prompt description.
    This description will be sent to Gemini to generate a vision processing prompt.
    """
    if not nodes_data or not nodes_data.get("listeners"):
        return ""
    
    descriptions = []
    for listener in nodes_data.get("listeners", []):
        listener_data = listener.get("listener_data", {})
        listener_type = listener_data.get("listener_type", "")
        listener_desc = listener_data.get("description", "")
        
        # Build listener description
        listener_text = f"Detect {listener_type}"
        if listener_desc:
            listener_text += f": {listener_desc}"
        
        # Add conditions
        conditions = listener.get("conditions", [])
        if conditions:
            cond_texts = []
            for cond in conditions:
                cond_data = cond.get("condition_data", {})
                cond_type = cond_data.get("condition_type", "")
                cond_desc = cond_data.get("description", "")
                cond_text = cond_type
                if cond_desc:
                    cond_text += f" ({cond_desc})"
                cond_texts.append(cond_text)
            listener_text += f" when {', '.join(cond_texts)}"
        
        descriptions.append(listener_text)
    
    return ". ".join(descriptions) + "." if descriptions else ""


async def generate_prompt_with_gemini(nodes_description: str) -> str:
    """
    Use Gemini to enhance the nodes description into an optimal vision processing prompt.
    """
    if not nodes_description:
        return "Analyze the video feed and detect any relevant objects or events."
    
    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
    if not GEMINI_API_KEY:
        # Fallback to simple prompt if Gemini not configured
        return f"Monitor the video feed for: {nodes_description}"
    
    try:
        client = genai.Client(api_key=GEMINI_API_KEY)
        
        gemini_prompt = f"""Convert the following automation description into a clear, concise vision processing prompt for real-time video analysis.

Automation Description:
{nodes_description}

Create a prompt that:
1. Clearly states what to detect or monitor in the video
2. Includes any conditions or constraints mentioned
3. Is optimized for real-time vision AI processing
4. Is concise and action-oriented

Return ONLY the prompt text, no explanations or markdown."""

        response = client.models.generate_content(
            model='models/gemini-2.5-flash',
            contents=gemini_prompt
        )
        
        prompt = response.text.strip()
        # Remove markdown code blocks if present
        if prompt.startswith("```"):
            prompt = prompt.split("```")[1]
            if prompt.startswith("text"):
                prompt = prompt[4:]
            prompt = prompt.strip()
        if prompt.endswith("```"):
            prompt = prompt.rsplit("```", 1)[0].strip()
        
        return prompt
    except Exception as e:
        print(f"Warning: Failed to generate prompt with Gemini: {e}")
        # Fallback to simple prompt
        return f"Monitor the video feed for: {nodes_description}"


@app.get("/api/projects/{project_id}/prompt")
async def get_project_prompt(
    project_id: str,
    userId: str = Header(None, alias="X-User-Id")
):
    """
    Generate a vision processing prompt from project nodes using Gemini.
    Returns the prompt that should be used for Overshoot vision processing.
    """
    if not userId:
        raise HTTPException(status_code=401, detail="Unauthorized: User ID required")
    
    if db is None:
        raise HTTPException(status_code=503, detail="MongoDB is not connected")
    
    try:
        object_id = ObjectId(project_id)
    except (InvalidId, ValueError):
        raise HTTPException(status_code=400, detail="Invalid project ID")
    
    # Verify project exists and belongs to user
    project = db.projects.find_one({"_id": object_id, "userId": userId})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Get nodes from project
    nodes = project.get("nodes")
    if not nodes or not nodes.get("listeners"):
        # Return default prompt if no nodes
        return {
            "prompt": "Analyze the video feed and detect any relevant objects or events.",
            "hasNodes": False
        }
    
    # Convert nodes to description
    nodes_description = nodes_to_prompt_description(nodes)
    
    # Generate enhanced prompt with Gemini
    enhanced_prompt = await generate_prompt_with_gemini(nodes_description)
    
    return {
        "prompt": enhanced_prompt,
        "hasNodes": True,
        "nodesDescription": nodes_description
    }


@app.put("/api/projects/{project_id}/nodes")
async def save_project_nodes(
    project_id: str,
    nodes_data: Dict[str, Any],
    userId: str = Header(None, alias="X-User-Id")
):
    """Save nodes configuration for a project"""
    if not userId:
        raise HTTPException(status_code=401, detail="Unauthorized: User ID required")
    
    if db is None:
        raise HTTPException(status_code=503, detail="MongoDB is not connected")
    
    try:
        object_id = ObjectId(project_id)
    except (InvalidId, ValueError):
        raise HTTPException(status_code=400, detail="Invalid project ID")
    
    # Verify project exists and belongs to user
    project = db.projects.find_one({"_id": object_id, "userId": userId})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Update project with nodes configuration
    db.projects.update_one(
        {"_id": object_id, "userId": userId},
        {
            "$set": {
                "nodes": nodes_data,
                "updatedAt": datetime.utcnow()
            }
        }
    )
    
    # Process nodes and update global nodes_store so camera uses the saved nodes
    print("\n" + "="*70)
    print("💾 NODES SAVED - Processing and updating global nodes_store")
    print("="*70)
    print("\n📥 RECEIVED NODES DATA:")
    print(json.dumps(nodes_data, indent=2))
    
    from nodes.node_processing import process_listeners
    
    try:
        # Process the nodes using node_processing.py
        processed_result = process_listeners(nodes_data)
        processed_nodes = processed_result.get("nodes", [])
        
        print(f"\n📋 PROCESSED NODES ({len(processed_nodes)} nodes):")
        print(json.dumps(processed_nodes, indent=2))
        
        # Update global nodes_store
        nodes_store.clear()
        nodes_store.extend(processed_nodes)
        
        print(f"\n✅ Updated global nodes_store with {len(processed_nodes)} nodes")
        
        # Generate the combined prompt and schema for logging
        if processed_nodes:
            # Convert processed nodes to Node objects for schema generation
            node_objects = []
            for node in processed_nodes:
                node_objects.append(Node(
                    id=node.get("name"),
                    prompt=node.get("prompt"),
                    datatype=NodeDataType(node.get("datatype", "boolean")),
                    name=node.get("name")
                ))
            
            output_schema = convert_nodes_to_output_schema(node_objects)
            combined_prompt = create_combined_prompt(node_objects)
            
            print(f"\n🎯 COMBINED PROMPT:")
            print(combined_prompt)
            print("="*70 + "\n")
            
            # Send updated nodes to Node.js service
            await send_nodes_to_nodejs(processed_nodes, output_schema, combined_prompt)
        else:
            print("⚠️  No nodes to process from saved project")
            print("="*70 + "\n")
            
    except Exception as e:
        print(f"\n❌ ERROR processing nodes: {e}")
        import traceback
        traceback.print_exc()
        print("="*70 + "\n")
    
    return {
        "success": True,
        "message": "Nodes saved successfully",
        "nodes": nodes_data
    }


# ============================================================================
# Main Entry Point
# ============================================================================
if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 3001))
    uvicorn.run(app, host="0.0.0.0", port=port)
