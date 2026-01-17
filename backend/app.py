"""
Python FastAPI Backend for Overshoot Video Processing
Receives results from Node.js service and sends prompt updates
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import httpx
import os
from dotenv import load_dotenv
from datetime import datetime

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


class Result(BaseModel):
    result: str
    timestamp: str
    prompt: str


class PromptUpdate(BaseModel):
    prompt: str


class ServiceControl(BaseModel):
    action: str  # "start" or "stop"


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "Avesia Backend API",
        "node_service_url": NODE_SERVICE_URL
    }


@app.post("/api/results")
async def receive_result(result: Result):
    """
    Receive results from Node.js Overshoot service
    This endpoint is called by the Node.js service when vision detects something
    """
    result_data = {
        "result": result.result,
        "timestamp": result.timestamp,
        "prompt": result.prompt,
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
    print(f"📝 Detected Text:")
    print("-"*60)
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
    uvicorn.run(app, host="0.0.0.0", port=8000)

