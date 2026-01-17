"""
Python FastAPI Backend for Overshoot Video Processing
Receives results from Node.js service and sends prompt updates
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional, Literal, Dict, Any
from enum import Enum
import httpx
import os
from dotenv import load_dotenv
from datetime import datetime
import json

load_dotenv()

app = FastAPI(title="Avesia Backend API")

# CORS middleware for frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify allowed origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration
NODE_SERVICE_URL = os.getenv("NODE_SERVICE_URL", "http://localhost:3001")

# Store results in memory (consider using a database for production)
results_store: List[dict] = []

# Store nodes configuration
nodes_store: List[dict] = []

# Default prompt if nodes file is missing
DEFAULT_PROMPT = "Please add nodes configuration in sample_nodes.json file"

# Default prompt if nodes file is missing
DEFAULT_PROMPT = "Please add nodes configuration in sample_nodes.json file"


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
    max_retries = 5
    retry_delay = 2
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{NODE_SERVICE_URL}/api/nodes",
                json={
                    "nodes": nodes_with_ids,
                    "outputSchema": output_schema,
                    "prompt": combined_prompt
                },
                timeout=5.0
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
            print(f"   Retrying in {retry_delay} seconds...")
            import asyncio
            await asyncio.sleep(retry_delay)
            return await send_nodes_to_nodejs(nodes_with_ids, output_schema, combined_prompt, retry_count + 1)
        else:
            print(f"⚠️  Could not send nodes to Node.js service after {max_retries} attempts")
            print(f"   Node.js service may not be running. Nodes will be available via API.")
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
    
    # Wait a bit for Node.js service to start, then send nodes with retry
    import asyncio
    await asyncio.sleep(2)  # Give Node.js service time to start
    await send_nodes_to_nodejs(nodes_with_ids, output_schema, combined_prompt)


@app.on_event("startup")
async def startup_event():
    """Initialize nodes when server starts"""
    await initialize_nodes_on_startup()


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "Avesia Backend API",
        "node_service_url": NODE_SERVICE_URL,
        "active_nodes": len(nodes_store)
    }


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
    print("\n" + "="*60)
    print(f"📹 RESULT RECEIVED - {result_data['received_at']}")
    print(f"🔍 Prompt: {result.prompt}")
    if result.node_id:
        print(f"🆔 Node ID: {result.node_id}")
    print(f"📝 Result ({'JSON' if is_json else 'Text'}):")
    print("-"*60)
    if is_json:
        print(json.dumps(parsed_result, indent=2))
    else:
        print(result.result)
    print("="*60 + "\n")
    
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


@app.get("/health")
async def health_check():
    """Health check endpoint"""
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
        "results_count": len(results_store)
    }


if __name__ == "__main__":
    import uvicorn
    import asyncio
    # Initialize nodes before starting server
    asyncio.run(initialize_nodes_on_startup())
    uvicorn.run(app, host="0.0.0.0", port=8000)

