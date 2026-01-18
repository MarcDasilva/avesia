"""
Avesia Backend API - Unified FastAPI Application
Combines Overshoot SDK/Node system and MongoDB/Projects API
"""
from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional, Literal, Dict, Any
from enum import Enum
from datetime import datetime
import httpx
import json
import os
import asyncio
from dotenv import load_dotenv
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure
from bson import ObjectId
from bson.errors import InvalidId

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
NODE_SERVICE_URL = os.getenv("NODE_SERVICE_URL", "http://localhost:3001")

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
                "has_person": {"type": "boolean"}
            }
        }
    """
    properties = {}
    
    for i, node in enumerate(nodes):
        # Use node.name if provided, otherwise generate a name from index
        field_name = node.name or f"node_{i}"
        
        # Map Python datatype to JSON schema type
        if node.datatype == NodeDataType.BOOLEAN:
            properties[field_name] = {"type": "boolean"}
        elif node.datatype == NodeDataType.INTEGER:
            properties[field_name] = {"type": "integer"}
        elif node.datatype == NodeDataType.NUMBER:
            properties[field_name] = {"type": "number"}
        elif node.datatype == NodeDataType.STRING:
            properties[field_name] = {"type": "string"}
        else:
            # Default to string if unknown type
            properties[field_name] = {"type": "string"}
    
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
        Output: "1. Is there a person? 2. Count the cans"
    """
    if len(nodes) == 1:
        return nodes[0].prompt
    
    prompts = []
    for i, node in enumerate(nodes, 1):
        prompts.append(f"{i}. {node.prompt}")
    
    return " ".join(prompts)


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
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{NODE_SERVICE_URL}/api/nodes",
                json={
                    "nodes": nodes_with_ids,
                    "outputSchema": output_schema,
                    "prompt": combined_prompt
                },
                timeout=2.0  # Reduced from 5.0 to fail faster
            )
            response.raise_for_status()
            if nodes_with_ids:
                print(f"✅ Nodes sent to Node.js service: {len(nodes_with_ids)} nodes")
                print(f"   Prompt: {combined_prompt[:80]}...")
            else:
                print(f"⚠️  No nodes configured. Using default prompt: {combined_prompt}")
            return True
    except Exception as e:
        if retry_count < max_retries:
            print(f"⚠️  Could not send nodes to Node.js service (attempt {retry_count + 1}/{max_retries})...")
            await asyncio.sleep(retry_delay)
            return await send_nodes_to_nodejs(nodes_with_ids, output_schema, combined_prompt, retry_count + 1)
        else:
            print(f"⚠️  Could not send nodes to Node.js service after {max_retries} attempts")
            print(f"   Node.js service may not be running. Nodes will be available via API.")
            print(f"   Start Node.js service separately if needed.")
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
        "mongodb_connected": db is not None if db else False
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
        "mongodb_connected": db is not None if db else False
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
    
    # Print result in a clear format (only if verbose logging is enabled)
    # Commented out for performance - uncomment if you need detailed logging
    # print("\n" + "="*60)
    # print(f"📹 RESULT RECEIVED - {result_data['received_at']}")
    # print(f"🔍 Prompt: {result.prompt}")
    # if result.node_id:
    #     print(f"🆔 Node ID: {result.node_id}")
    # print(f"📝 Result ({'JSON' if is_json else 'Text'}):")
    # print("-"*60)
    # if is_json:
    #     print(json.dumps(parsed_result, indent=2))
    # else:
    #     print(result.result)
    # print("="*60 + "\n")
    
    # Quick log for performance
    if is_json:
        print(f"📹 Result: {len(parsed_result)} fields")
    else:
        print(f"📹 Result received")
    
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
                "message": "Nodes updated successfully",
                "nodes": nodes_with_ids,
                "outputSchema": output_schema,
                "prompt": combined_prompt
            }
    except httpx.RequestError as e:
        raise HTTPException(status_code=503, detail=f"Failed to connect to Node.js service: {str(e)}")
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=f"Node.js service error: {e.response.text}")


@app.get("/api/nodes")
async def get_nodes():
    """Get current nodes configuration"""
    # If nodes_store is empty, reload from file
    if not nodes_store:
        nodes, output_schema, combined_prompt = load_nodes_from_file()
        nodes_with_ids = []
        for i, node in enumerate(nodes):
            node_dict = node.dict()
            if not node_dict.get("id"):
                node_dict["id"] = node_dict.get("name") or f"node_{i}"
            node_dict["name"] = node_dict.get("name") or node_dict["id"]
            nodes_with_ids.append(node_dict)
        nodes_store.extend(nodes_with_ids)
    
    # Generate schema and prompt for response
    if nodes_store:
        output_schema = convert_nodes_to_output_schema([Node(**n) for n in nodes_store])
        combined_prompt = create_combined_prompt([Node(**n) for n in nodes_store])
    else:
        output_schema = {}
        combined_prompt = DEFAULT_PROMPT
    
    return {
        "nodes": nodes_store,
        "count": len(nodes_store),
        "outputSchema": output_schema,
        "prompt": combined_prompt
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
        "createdAt": now,
        "updatedAt": now,
    }
    
    result = db.projects.insert_one(project)
    project["_id"] = result.inserted_id
    
    return {
        "id": str(project["_id"]),
        "userId": project["userId"],
        "name": project["name"],
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
    
    return {
        "id": str(project["_id"]),
        "userId": project["userId"],
        "name": project["name"],
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


# ============================================================================
# Main Entry Point
# ============================================================================
if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 3001))
    uvicorn.run(app, host="0.0.0.0", port=port)
