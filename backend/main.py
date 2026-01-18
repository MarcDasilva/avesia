from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from dotenv import load_dotenv
import os

load_dotenv()

app = FastAPI(title="Avesia API", version="1.0.0")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("FRONTEND_URL", "http://localhost:5173")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# MongoDB connection (Atlas or local)
# For Atlas: mongodb+srv://username:password@cluster.mongodb.net/?retryWrites=true&w=majority
# For local: mongodb://localhost:27017/
MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017/")
DATABASE_NAME = os.getenv("DATABASE_NAME", "avesia")

try:
    # Validate connection string format
    if not MONGODB_URI.startswith('mongodb+srv://') and not MONGODB_URI.startswith('mongodb://'):
        raise ValueError("Connection string must start with 'mongodb+srv://' or 'mongodb://'")
    
    # Use longer timeout for Atlas connections
    client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=30000)  # 30 seconds
    # Test connection
    client.admin.command('ping')
    db = client[DATABASE_NAME]
    print("MongoDB connected successfully")
except ConnectionFailure as e:
    print(f"Failed to connect to MongoDB: {e}")
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
    raise
except Exception as e:
    print(f"MongoDB connection error: {e}")
    print("\n🔍 Troubleshooting tips:")
    print("1. ✅ CRITICAL: Whitelist your IP in Atlas Network Access")
    print("2. Verify connection string uses 'mongodb+srv://' format")
    print("3. Ensure username and password are correct")
    raise

# Pydantic models
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

# Helper function to get user ID from header
def get_user_id(x_user_id: Optional[str] = Header(None)) -> str:
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Unauthorized: User ID required")
    return x_user_id

# Routes
@app.get("/api/health")
async def health_check():
    return {"status": "OK", "message": "Server is running"}

@app.get("/api/projects", response_model=List[Project])
async def get_projects(userId: str = Header(None, alias="X-User-Id")):
    if not userId:
        raise HTTPException(status_code=401, detail="Unauthorized: User ID required")
    
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
    if not userId:
        raise HTTPException(status_code=401, detail="Unauthorized: User ID required")
    
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
    if not userId:
        raise HTTPException(status_code=401, detail="Unauthorized: User ID required")
    
    from bson import ObjectId
    try:
        project = db.projects.find_one({"_id": ObjectId(project_id), "userId": userId})
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        return {
            "id": str(project["_id"]),
            "userId": project["userId"],
            "name": project["name"],
            "createdAt": project["createdAt"],
            "updatedAt": project["updatedAt"],
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail="Invalid project ID")

@app.put("/api/projects/{project_id}", response_model=Project)
async def update_project(project_id: str, project_data: ProjectUpdate, userId: str = Header(None, alias="X-User-Id")):
    if not userId:
        raise HTTPException(status_code=401, detail="Unauthorized: User ID required")
    
    from bson import ObjectId
    try:
        update_data = {
            "name": project_data.name.strip(),
            "updatedAt": datetime.utcnow(),
        }
        
        result = db.projects.find_one_and_update(
            {"_id": ObjectId(project_id), "userId": userId},
            {"$set": update_data},
            return_document=True
        )
        
        if not result:
            raise HTTPException(status_code=404, detail="Project not found")
        
        return {
            "id": str(result["_id"]),
            "userId": result["userId"],
            "name": result["name"],
            "createdAt": result["createdAt"],
            "updatedAt": result["updatedAt"],
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail="Invalid project ID")

@app.delete("/api/projects/{project_id}")
async def delete_project(project_id: str, userId: str = Header(None, alias="X-User-Id")):
    if not userId:
        raise HTTPException(status_code=401, detail="Unauthorized: User ID required")
    
    from bson import ObjectId
    try:
        result = db.projects.find_one_and_delete({"_id": ObjectId(project_id), "userId": userId})
        if not result:
            raise HTTPException(status_code=404, detail="Project not found")
        
        return {"message": "Project deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=400, detail="Invalid project ID")

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 3001))
    uvicorn.run(app, host="0.0.0.0", port=port)

