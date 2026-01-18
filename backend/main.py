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
import sys

# Add Nodes directory to path for imports
sys.path.insert(0, str(Path(__file__).parent / "Nodes"))
from node_processing import process_listeners

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

CLIPS_DIR = Path("clips")
CLIPS_DIR.mkdir(exist_ok=True)

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
OVERSHOOT_API_KEY = os.getenv("OVERSHOOT_API_KEY", "")
OVERSHOOT_API_URL = os.getenv("OVERSHOOT_API_URL", "https://cluster1.overshoot.ai/api/v0.2")

# Store results in memory (consider using a database for production)
results_store: List[dict] = []

# Rate limiting for email alerts: track last email sent time per listener per project
# Format: {project_id: {listener_id: timestamp}}
# This prevents spam by limiting emails to once every 2 minutes per listener
email_rate_limit: Dict[str, Dict[str, float]] = {}
EMAIL_RATE_LIMIT_SECONDS = 120  # 2 minutes

# Rate limiting for clip saving: track last clip saved time per listener per project
# Format: {project_id: {listener_id: timestamp}}
# This prevents duplicate clips by limiting to once every 5 seconds per listener
clip_rate_limit: Dict[str, Dict[str, float]] = {}
CLIP_RATE_LIMIT_SECONDS = 5  # 5 seconds - prevents rapid duplicate saves

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
    project_id: Optional[str] = None  # CRITICAL: Track which project this result is from
    video_id: Optional[str] = None  # Track which video is being processed


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
    Receive results from Overshoot SDK
    This endpoint is called when vision detects something
    Results can be plain text or JSON (if using structured output)
    
    CRITICAL: If result contains 'true' values, triggers email alerts based on project nodes
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
        "project_id": result.project_id,  # Store project ID
        "is_json": is_json,
        "received_at": datetime.now().isoformat()
    }
    
    results_store.append(result_data)
    
    # Keep only last 100 results in memory
    if len(results_store) > 100:
        results_store.pop(0)
    
    # CRITICAL: Check for 'true' values and trigger email alerts
    # Only process if we have a project_id and JSON result
    if result.project_id and is_json and isinstance(parsed_result, dict):
        try:
            # Check each field in the result for 'true' values
            for listener_id, value in parsed_result.items():
                # Check if value is True (boolean) or "true" (string)
                if value is True or (isinstance(value, str) and value.lower() == "true"):
                    print(f"✅ Trigger detected for listener: {listener_id}")
                    print(f"📋 Debug - video_id: {result.video_id}, project_id: {result.project_id}")
                    
                    project_id_str = result.project_id
                    current_time = datetime.now().timestamp()
                    
                    # CRITICAL: Save video clip for ANY detected event (not just email events)
                    # This works for prerecorded videos (video_id provided) or live footage (clip uploaded separately)
                    # BUT: Only save once per event to prevent duplicates (rate limit check)
                    print(f"🔍 DEBUG: Event detected - video_id={result.video_id}, project_id={result.project_id}, listener_id={listener_id}")
                    
                    # Check rate limit for clip saving to prevent duplicates
                    clip_saved = False
                    if result.video_id:
                        # Initialize project in rate limit dict if needed
                        if project_id_str not in clip_rate_limit:
                            clip_rate_limit[project_id_str] = {}
                        
                        # Check if we've saved a clip recently for this listener
                        last_clip_time = clip_rate_limit[project_id_str].get(listener_id, 0)
                        time_since_last_clip = current_time - last_clip_time
                        
                        if time_since_last_clip < CLIP_RATE_LIMIT_SECONDS:
                            time_remaining = CLIP_RATE_LIMIT_SECONDS - time_since_last_clip
                            print(f"⏱️ Clip rate limit active for listener {listener_id}: {time_remaining:.1f}s remaining before next clip")
                        else:
                            # Rate limit passed - proceed with clip extraction
                            print(f"✅ Clip rate limit passed for listener {listener_id} - proceeding with clip extraction")
                            
                            try:
                                project_object_id = ObjectId(result.project_id)
                                project = db.projects.find_one({"_id": project_object_id})
                                
                                if not project:
                                    print(f"⚠️ Project {result.project_id} not found in database")
                                else:
                                    videos = project.get("videos", [])
                                    print(f"🔍 DEBUG: Project has {len(videos)} video(s)")
                                    video = next((v for v in videos if v.get("id") == result.video_id), None)
                                    
                                    if not video:
                                        print(f"⚠️ Video {result.video_id} not found in project. Available IDs: {[v.get('id') for v in videos]}")
                                    elif not video.get("filepath"):
                                        print(f"⚠️ Video {result.video_id} has no filepath")
                                    else:
                                        video_path = Path(video["filepath"])
                                        print(f"🔍 DEBUG: Video filepath: {video_path}")
                                        
                                        if not video_path.exists():
                                            print(f"⚠️ Video file does not exist: {video_path}")
                                        else:
                                            print(f"📹 Extracting last 5 seconds of video {result.video_id} for event")
                                            
                                            # Generate unique filename for clip
                                            clip_uuid = str(uuid.uuid4())
                                            clip_filename = f"{clip_uuid}.mp4"
                                            clip_path = CLIPS_DIR / clip_filename
                                            
                                            # Ensure clips directory exists
                                            CLIPS_DIR.mkdir(exist_ok=True)
                                            
                                            # Extract last 5 seconds
                                            extracted_path = extract_last_n_seconds(
                                                video_path, 
                                                clip_path, 
                                                seconds=5
                                            )
                                            
                                            if not extracted_path:
                                                print(f"⚠️ Failed to extract video clip - extract_last_n_seconds returned None")
                                            else:
                                                print(f"✅ Clip extracted: {extracted_path}")
                                                event_type = "event_trigger"
                                                
                                                # Save clip to database with event timestamp (from when event was detected)
                                                clip_id = await save_video_clip_to_database(
                                                    project_id=result.project_id,
                                                    listener_id=listener_id,
                                                    event_timestamp=result.timestamp,  # Use event timestamp, not current time
                                                    video_id=result.video_id,
                                                    clip_file_path=extracted_path,
                                                    event_type=event_type,
                                                )
                                                
                                                if clip_id:
                                                    print(f"✅ Video clip saved to database: {clip_id} for project {result.project_id} at timestamp {result.timestamp}")
                                                    clip_saved = True
                                                    # Update rate limit timestamp after successful save
                                                    clip_rate_limit[project_id_str][listener_id] = current_time
                                                    print(f"⏱️ Clip rate limit updated: next clip for {listener_id} can be saved in {CLIP_RATE_LIMIT_SECONDS}s")
                                                else:
                                                    print(f"⚠️ save_video_clip_to_database returned None")
                            except Exception as e:
                                print(f"❌ Error extracting/saving video clip: {e}")
                                import traceback
                                traceback.print_exc()
                    else:
                        print(f"⚠️ No video_id provided - cannot extract clip for prerecorded video")
                    
                    # CRITICAL: Check rate limit before sending email
                    # Only send if 2 minutes have passed since last email for this listener
                    # Initialize project in rate limit dict if needed
                    if project_id_str not in email_rate_limit:
                        email_rate_limit[project_id_str] = {}
                    
                    # Check if we've sent an email recently for this listener
                    last_email_time = email_rate_limit[project_id_str].get(listener_id, 0)
                    time_since_last_email = current_time - last_email_time
                    
                    if time_since_last_email < EMAIL_RATE_LIMIT_SECONDS:
                        time_remaining = EMAIL_RATE_LIMIT_SECONDS - time_since_last_email
                        print(f"⏱️ Rate limit active for listener {listener_id}: {int(time_remaining)}s remaining before next email")
                        continue  # Skip email, but clip was already saved above
                    
                    # Rate limit passed - proceed with email
                    print(f"✅ Rate limit passed for listener {listener_id} - proceeding with email")
                    
                    # Find project and get nodes
                    try:
                        project_object_id = ObjectId(result.project_id)
                        project = db.projects.find_one({"_id": project_object_id})
                        
                        if not project or not project.get("nodes"):
                            print(f"⚠️ Project {result.project_id} not found or has no nodes")
                            continue
                        
                        # Find the listener and its associated email events
                        nodes = project.get("nodes", {})
                        listeners = nodes.get("listeners", [])
                        
                        for listener in listeners:
                            if listener.get("listener_id") == listener_id:
                                # Found the listener - check for email events
                                events = listener.get("events", [])
                                
                                email_sent = False  # Track if we actually sent an email
                                
                                for event in events:
                                    event_data = event.get("event_data", {})
                                    event_type = event_data.get("event_type", "").lower()
                                    
                                    # Check if this is an email event (Gmail or Email)
                                    if event_type in ["gmail", "email"]:
                                        # Extract email and message from event_data
                                        # Email is stored as "recipient" for Email events, or "email" for Gmail
                                        email = event_data.get("recipient", "") or event_data.get("email", "")
                                        message = event_data.get("message", "")
                                        description = event_data.get("description", "")
                                        
                                        # Use description as message if message is empty
                                        if not message and description:
                                            message = description
                                        
                                        # If still no message, use a default
                                        if not message:
                                            listener_name = listener.get("listener_data", {}).get("name", listener_id)
                                            message = f"Alert triggered for {listener_name}"
                                        
                                        # Only send if we have an email address
                                        if email:
                                            print(f"📧 Sending email alert to {email} for listener {listener_id}")
                                            
                                            # Import email alert function
                                            from alerts.email_alert import send_email
                                            
                                            # Get listener name for subject
                                            listener_name = listener.get("listener_data", {}).get("name", "Detection")
                                            
                                            # Get project name for email
                                            project_name = project.get("name", "Unknown Project")
                                            
                                            # Format email message using boilerplate template
                                            # Read boilerplate template
                                            boilerplate_path = Path(__file__).parent / "alerts" / "boilerplate.txt"
                                            try:
                                                with open(boilerplate_path, "r", encoding="utf-8") as f:
                                                    boilerplate_template = f.read()
                                            except Exception as e:
                                                print(f"⚠️ Could not read boilerplate template: {e}")
                                                # Fallback template
                                                boilerplate_template = """Hello,

This is an automated message from **Avesia** regarding your camera automation.

An event or workflow you configured has been triggered. No action is required unless otherwise noted.
------------------------------------------------------------------------------------------


------------------------------------------------------------------------------------------

If this message requires your attention, please review the details in your Avesia dashboard.

If you believe you received this message in error, you can safely ignore it.

—
Avesia
Camera Automation Platform
This email was sent automatically. Please do not reply."""
                                            
                                            # Replace the custom message section (between dashes) with the actual message
                                            # Format: "Automated message from {project}: {message}"
                                            project_message = f"Automated message from {project_name}: {message}"
                                            
                                            # Split template by dashes and insert custom message
                                            parts = boilerplate_template.split("------------------------------------------------------------------------------------------")
                                            if len(parts) >= 3:
                                                # Reconstruct with custom message in the middle
                                                formatted_message = (
                                                    parts[0] +
                                                    "------------------------------------------------------------------------------------------\n\n" +
                                                    project_message +
                                                    "\n\n------------------------------------------------------------------------------------------" +
                                                    parts[2]
                                                )
                                            else:
                                                # Fallback if template format is unexpected
                                                formatted_message = boilerplate_template.replace(
                                                    "------------------------------------------------------------------------------------------\n\n\n------------------------------------------------------------------------------------------",
                                                    f"------------------------------------------------------------------------------------------\n\n{project_message}\n\n------------------------------------------------------------------------------------------"
                                                )
                                            
                                            # Send email with formatted message
                                            email_result = send_email(
                                                recipient_email=email,
                                                subject=f"Alert: {listener_name}",
                                                message=formatted_message
                                            )
                                            
                                            if email_result.get("success"):
                                                print(f"✅ Email sent successfully to {email}")
                                                email_sent = True
                                                
                                                # CRITICAL: Update rate limit timestamp after successful send
                                                email_rate_limit[project_id_str][listener_id] = current_time
                                                print(f"⏱️ Rate limit updated: next email for {listener_id} can be sent in {EMAIL_RATE_LIMIT_SECONDS}s")
                                                
                                                # Update clip event type to email_alert if clip was already saved
                                                # (Video clips are saved for ANY event above, but we update type for email events)
                                                if result.video_id and db:
                                                    try:
                                                        # Find and update the most recent clip for this event
                                                        db.video_clips.update_one(
                                                            {
                                                                "projectId": result.project_id,
                                                                "listenerId": listener_id,
                                                                "eventTimestamp": result.timestamp,
                                                            },
                                                            {
                                                                "$set": {
                                                                    "eventType": "email_alert",
                                                                    "emailSentTo": email,
                                                                }
                                                            }
                                                        )
                                                    except Exception as e:
                                                        print(f"⚠️ Could not update clip event type: {e}")
                                            else:
                                                print(f"❌ Failed to send email: {email_result.get('error')}")
                                        else:
                                            print(f"⚠️ Email event found but no email address configured for listener {listener_id}")
                                
                                # Only break if we found the listener (email sent or no email configured)
                                break  # Found the listener, no need to continue
                    
                    except (InvalidId, ValueError) as e:
                        print(f"⚠️ Invalid project ID: {result.project_id} - {e}")
                    except Exception as e:
                        print(f"❌ Error processing alert for listener {listener_id}: {e}")
        
        except Exception as e:
            print(f"❌ Error checking for triggers: {e}")
    
    # Quick log for performance
    if is_json:
        print(f"📹 Result: {len(parsed_result) if isinstance(parsed_result, dict) else 1} fields")
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


async def save_video_clip_to_database(
    project_id: str,
    listener_id: str,
    event_timestamp: str,
    video_id: Optional[str] = None,
    clip_file_path: Optional[Path] = None,
    clip_blob: Optional[bytes] = None,
    event_type: str = "event_trigger",
    email_sent_to: Optional[str] = None,
) -> Optional[str]:
    """
    Save a video clip to the database.
    Can handle either a file path (for prerecorded videos) or blob data (for live footage).
    
    Returns the clip ID if successful, None otherwise.
    """
    try:
        if db is None:
            print("⚠️ MongoDB not available, cannot save clip to database")
            return None
        
        # If we have blob data, save it to a file first
        if clip_blob:
            clip_uuid = str(uuid.uuid4())
            clip_filename = f"{clip_uuid}.mp4"
            clip_path = CLIPS_DIR / clip_filename
            
            # Ensure clips directory exists
            CLIPS_DIR.mkdir(exist_ok=True)
            
            # Write blob to file
            with open(clip_path, "wb") as f:
                f.write(clip_blob)
            
            clip_file_path = clip_path
        
        # If we have a file path but no UUID yet, generate one
        if clip_file_path and not clip_file_path.stem:
            clip_uuid = str(uuid.uuid4())
            clip_filename = f"{clip_uuid}.mp4"
            new_clip_path = CLIPS_DIR / clip_filename
            clip_file_path.rename(new_clip_path)
            clip_file_path = new_clip_path
            clip_filename = clip_uuid
        elif clip_file_path:
            clip_uuid = clip_file_path.stem
            clip_filename = f"{clip_uuid}.mp4"
        else:
            print("⚠️ No clip file path or blob provided")
            return None
        
        # Save clip metadata to database
        clip_metadata = {
            "id": clip_uuid,
            "projectId": project_id,
            "listenerId": listener_id,
            "eventTimestamp": event_timestamp,
            "clipPath": str(clip_file_path),
            "clipFilename": clip_filename,
            "durationSeconds": 5,
            "createdAt": datetime.utcnow(),
            "eventType": event_type,
        }
        
        if video_id:
            clip_metadata["videoId"] = video_id
        
        if email_sent_to:
            clip_metadata["emailSentTo"] = email_sent_to
        
        db.video_clips.insert_one(clip_metadata)
        print(f"✅ Video clip saved to database: {clip_uuid}")
        return clip_uuid
        
    except Exception as e:
        print(f"❌ Error saving video clip to database: {e}")
        import traceback
        traceback.print_exc()
        return None


def extract_last_n_seconds(video_path: Path, output_path: Path, seconds: int = 5) -> Optional[Path]:
    """
    Extract the last N seconds of a video file.
    
    Args:
        video_path: Path to input video file
        output_path: Path to save the output clip
        seconds: Number of seconds to extract from the end (default: 5)
    
    Returns:
        Path to the output clip if successful, None otherwise
    """
    cap = None
    out = None
    try:
        # Ensure video path is absolute
        video_path = video_path.resolve()
        output_path = output_path.resolve()
        
        # Ensure output directory exists
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        print(f"🔍 DEBUG: Extracting from {video_path} to {output_path}")
        
        # Open video file
        cap = cv2.VideoCapture(str(video_path))
        if not cap.isOpened():
            print(f"❌ Error: Could not open video file {video_path}")
            return None
        
        # Get video properties
        fps = cap.get(cv2.CAP_PROP_FPS)
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        
        print(f"🔍 DEBUG: Video properties - fps={fps}, frames={frame_count}, width={width}, height={height}")
        
        if fps == 0 or frame_count == 0:
            print(f"❌ Error: Invalid video properties (fps={fps}, frames={frame_count})")
            return None
        
        # Calculate start frame (last N seconds)
        total_duration = frame_count / fps
        start_time = max(0, total_duration - seconds)
        start_frame = int(start_time * fps)
        
        # If video is shorter than requested seconds, extract from beginning
        if start_frame < 0:
            start_frame = 0
        
        print(f"🔍 DEBUG: Extracting from frame {start_frame} (time {start_time:.2f}s) to end")
        
        # Try multiple codecs - mp4v may not work on all systems
        codecs = ['mp4v', 'XVID', 'avc1']
        fourcc = None
        out = None
        
        for codec in codecs:
            try:
                fourcc = cv2.VideoWriter_fourcc(*codec)
                # Use .mp4 extension for mp4v/avc1, .avi for XVID
                if codec == 'XVID':
                    output_path_alt = output_path.with_suffix('.avi')
                else:
                    output_path_alt = output_path
                
                out = cv2.VideoWriter(str(output_path_alt), fourcc, fps, (width, height))
                if out.isOpened():
                    print(f"✅ Using codec {codec} for output")
                    output_path = output_path_alt
                    break
                else:
                    if out:
                        out.release()
                    out = None
            except Exception as e:
                print(f"⚠️ Codec {codec} failed: {e}")
                if out:
                    out.release()
                    out = None
                continue
        
        if not out or not out.isOpened():
            print(f"❌ Error: Could not create VideoWriter with any codec")
            return None
        
        # Seek to start frame
        cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)
        
        # Read and write frames
        frames_written = 0
        max_frames = int(seconds * fps) + 10  # Add buffer
        
        while frames_written < max_frames:
            ret, frame = cap.read()
            if not ret or frame is None:
                break
            
            # Ensure frame dimensions match
            if frame.shape[0] != height or frame.shape[1] != width:
                frame = cv2.resize(frame, (width, height))
            
            out.write(frame)
            frames_written += 1
        
        print(f"🔍 DEBUG: Wrote {frames_written} frames")
        
        # Explicitly release everything
        cap.release()
        out.release()
        
        # Wait a moment for file system to flush
        import time
        time.sleep(0.1)
        
        # Verify output file was created
        if output_path.exists():
            file_size = output_path.stat().st_size
            if file_size > 0:
                print(f"✅ Extracted last {seconds} seconds ({frames_written} frames, {file_size} bytes) to {output_path}")
                return output_path
            else:
                print(f"❌ Error: Output file exists but is empty ({file_size} bytes)")
        else:
            print(f"❌ Error: Output file was not created at {output_path}")
        
        return None
            
    except Exception as e:
        print(f"❌ Error extracting video clip: {e}")
        import traceback
        traceback.print_exc()
        return None
    finally:
        # Ensure cleanup
        if cap:
            try:
                cap.release()
            except:
                pass
        if out:
            try:
                out.release()
            except:
                pass


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


@app.get("/api/projects/{project_id}/clips/{clip_id}/file")
async def get_clip_file(
    project_id: str,
    clip_id: str,
    request: Request,
    userId: Optional[str] = Header(None, alias="X-User-Id"),
    userId_query: Optional[str] = Query(None, alias="userId")
):
    """Serve a video clip file for a project"""
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
    
    # Find clip in database
    clip = db.video_clips.find_one({"id": clip_id, "projectId": project_id})
    if not clip:
        raise HTTPException(status_code=404, detail="Clip not found")
    
    clip_path = Path(clip.get("clipPath", ""))
    if not clip_path.exists():
        raise HTTPException(status_code=404, detail="Clip file not found on server")
    
    # Create FileResponse with CORS headers
    response = FileResponse(
        str(clip_path),
        media_type="video/mp4",
        filename=clip.get("clipFilename", "clip.mp4")
    )
    
    # Explicitly set CORS headers
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


@app.get("/api/projects/{project_id}/prompt")
async def get_project_prompt(
    project_id: str,
    userId: str = Header(None, alias="X-User-Id")
):
    """Generate a vision processing prompt from project nodes"""
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
            "hasNodes": False,
            "outputSchema": {},
            "nodes": []
        }
    
    try:
        # Process listeners to create prompts
        processed = process_listeners(nodes)
        processed_nodes = processed.get("nodes", [])
        
        if not processed_nodes:
            return {
                "prompt": "Analyze the video feed and detect any relevant objects or events.",
                "hasNodes": False,
                "outputSchema": {},
                "nodes": []
            }
        
        # Create combined prompt from processed nodes
        prompt_parts = []
        for node in processed_nodes:
            node_prompt = node.get("prompt", "").strip()
            if node_prompt:
                prompt_parts.append(node_prompt)
        
        # Combine prompts - use natural language joining for better readability
        # If multiple listeners, join with "Also" for natural flow
        if len(prompt_parts) > 1:
            combined_prompt = prompt_parts[0]
            for prompt in prompt_parts[1:]:
                combined_prompt += f". Also, {prompt}"
        elif len(prompt_parts) == 1:
            combined_prompt = prompt_parts[0]
        else:
            combined_prompt = "Analyze the video feed and detect any relevant objects or events."
        
        # Debug: Log the final prompt being sent to Overshoot
        print(f"🎯 Final combined prompt for project {project_id}: {combined_prompt}")
        print(f"📋 Number of nodes: {len(processed_nodes)}")
        
        # Create output schema from processed nodes
        output_schema = {
            "type": "object",
            "properties": {}
        }
        for node in processed_nodes:
            node_name = node.get("name", f"node_{len(output_schema['properties'])}")
            datatype = node.get("datatype", "boolean")
            # Map datatype to JSON schema type
            schema_type = {
                "boolean": "boolean",
                "integer": "integer",
                "number": "number",
                "string": "string"
            }.get(datatype, "boolean")
            output_schema["properties"][node_name] = {"type": schema_type}
        
        return {
            "prompt": combined_prompt,
            "hasNodes": True,
            "nodes": processed_nodes,
            "outputSchema": output_schema
        }
    except Exception as e:
        print(f"Error processing nodes to prompt: {e}")
        import traceback
        traceback.print_exc()
        # Return default prompt on error
        return {
            "prompt": "Analyze the video feed and detect any relevant objects or events.",
            "hasNodes": False,
            "error": str(e),
            "outputSchema": {},
            "nodes": []
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
    
    return {
        "success": True,
        "message": "Nodes saved successfully",
        "nodes": nodes_data
    }


@app.get("/api/projects/{project_id}/analytics")
async def get_project_analytics(
    project_id: str,
    userId: str = Header(None, alias="X-User-Id")
):
    """Get analytics/events history for a project"""
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
    
    # Fetch events from video_clips collection for this project
    events = []
    try:
        # Get video clips (all event types - email alerts, event triggers, etc.)
        clips = db.video_clips.find({"projectId": project_id}).sort("createdAt", -1)
        for clip in clips:
            event_type = clip.get("eventType", "event_trigger")
            listener_id = clip.get("listenerId", "unknown")
            email_sent_to = clip.get("emailSentTo")
            
            # Create description based on event type
            if event_type == "email_alert" and email_sent_to:
                description = f"Email alert sent to {email_sent_to} for listener {listener_id}"
            elif event_type == "event_trigger":
                description = f"Event triggered for listener {listener_id}"
            else:
                description = f"Event occurred for listener {listener_id}"
            
            events.append({
                "id": clip.get("id"),
                "type": event_type,  # Use actual event type, not hardcoded "email_alert"
                "eventType": event_type,
                "timestamp": clip.get("eventTimestamp"),
                "createdAt": clip.get("createdAt"),
                "listenerId": listener_id,
                "videoId": clip.get("videoId"),
                "emailSentTo": email_sent_to,
                "description": description,
                "clipId": clip.get("id"),  # Include clip ID for frontend to access clip file
                "clipFilename": clip.get("clipFilename"),  # Include filename for reference
            })
    except Exception as e:
        print(f"Error fetching video clips: {e}")
        import traceback
        traceback.print_exc()
    
    # Sort all events by timestamp (most recent first)
    events.sort(key=lambda x: x.get("timestamp") or x.get("createdAt") or "", reverse=True)
    
    return {
        "success": True,
        "events": events,
        "count": len(events)
    }


# ============================================================================
# Main Entry Point
# ============================================================================
if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 3001))
    uvicorn.run(app, host="0.0.0.0", port=port)
