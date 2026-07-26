import os
import time
from datetime import datetime
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import bcrypt
from pymongo import MongoClient
from bson import ObjectId
from starlette.middleware.base import BaseHTTPMiddleware
from dotenv import load_dotenv

# Load environment variables from .env file before any database configurations
load_dotenv()

app = FastAPI(title="AI Codebase Tutorial Builder")

# --- Prevent Static Caching in Browser (for seamless development testing) ---
class NoCacheMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        if request.url.path.startswith("/static") or request.url.path == "/":
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"
        return response

app.add_middleware(NoCacheMiddleware)

# --- Serve Static Assets ---
if not os.path.exists("static"):
    os.makedirs("static")
    os.makedirs("static/css")
    os.makedirs("static/js")

app.mount("/static", StaticFiles(directory="static"), name="static")

# --- MongoDB Connectivity & Fallback ---
mongo_uri = os.environ.get("MONGODB_URI", "mongodb://localhost:27017/")
db_name = os.environ.get("MONGODB_DB", "codebase_tutorial_builder")
db_fallback = False

try:
    # Set short connection timeout to check availability quickly
    mongo_client = MongoClient(mongo_uri, serverSelectionTimeoutMS=1500)
    mongo_client.server_info() # triggers connection check
    db = mongo_client[db_name]
    print(f"Database: Connected successfully to MongoDB at {mongo_uri}")
except Exception as e:
    print(f"Warning: Could not connect to MongoDB. Error: {e}")
    print("Falling back to local In-Memory database mock for development.")
    db_fallback = True
    
    # Lightweight database collections mockup to prevent startup crashes
    class MockCollection:
        def __init__(self):
            self.data = {}
        def find_one(self, query):
            for item in self.data.values():
                if all(item.get(k) == v for k, v in query.items()):
                    return item
            return None
        def insert_one(self, doc):
            doc_id = str(len(self.data) + 1)
            doc['_id'] = doc_id
            self.data[doc_id] = doc
            return type('Obj', (), {'inserted_id': doc_id})()
        def find(self, query=None):
            if not query:
                return list(self.data.values())
            return [item for item in self.data.values() if all(item.get(k) == v for k, v in query.items())]
            
    class MockDatabase:
        def __init__(self):
            self.users = MockCollection()
            self.tutorials = MockCollection()
            
    db = MockDatabase()

# --- Password Encryption Helper Functions ---
def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')

def verify_password(password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode('utf-8'), hashed_password.encode('utf-8'))
    except Exception:
        return False

# --- Pydantic Data Models ---
class AuthRequest(BaseModel):
    username: str
    password: str

class GenerateRequest(BaseModel):
    repo_url: str
    username: str

# --- Authentication Routes ---
@app.post("/api/auth/signup")
def auth_signup(request: AuthRequest):
    username = request.username.strip().lower()
    password = request.password
    
    if not username or not password:
        raise HTTPException(status_code=400, detail="Username and password are required.")
    
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")
    
    # Check if user already exists
    existing_user = db.users.find_one({"username": username})
    if existing_user:
        raise HTTPException(status_code=400, detail="Username already exists. Please pick another one.")
    
    # Save user
    hashed = hash_password(password)
    db.users.insert_one({
        "username": username,
        "password_hash": hashed,
        "created_at": datetime.utcnow()
    })
    
    return {"success": True, "message": "Sign up completed successfully!"}

@app.post("/api/auth/login")
def auth_login(request: AuthRequest):
    username = request.username.strip().lower()
    password = request.password
    
    user = db.users.find_one({"username": username})
    if not user or not verify_password(password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid username or password.")
        
    return {
        "success": True, 
        "username": user["username"],
        "message": "Login successful!"
    }

# --- Tutorial History Routes ---
@app.get("/api/tutorials")
def list_tutorials(username: str):
    """Lists past tutorials generated by the user."""
    username = username.strip().lower()
    cursor = db.tutorials.find({"username": username})
    
    tutorials_list = []
    for item in cursor:
        tutorials_list.append({
            "id": str(item["_id"]),
            "project_name": item.get("project_name", "Unknown Codebase"),
            "repo_url": item.get("repo_url", "")
        })
        
    return {
        "success": True,
        "tutorials": tutorials_list
    }

@app.get("/api/tutorials/{tutorial_id}")
def get_tutorial_details(tutorial_id: str):
    """Fetches full payload of a saved tutorial by ID."""
    tutorial = None
    if not db_fallback:
        try:
            tutorial = db.tutorials.find_one({"_id": ObjectId(tutorial_id)})
        except Exception:
            pass
            
    if not tutorial:
        # Check in fallback mock database
        tutorial = db.tutorials.find_one({"_id": tutorial_id})
        
    if not tutorial:
        raise HTTPException(status_code=404, detail="Tutorial not found.")
        
    return {
        "success": True,
        "project_name": tutorial.get("project_name", "sample-project"),
        "repo_url": tutorial.get("repo_url", ""),
        "index_content": tutorial.get("index_content", ""),
        "chapters": tutorial.get("chapters", [])
    }

@app.delete("/api/tutorials/{tutorial_id}")
def delete_tutorial(tutorial_id: str):
    """Deletes a saved tutorial by ID from MongoDB or Mock DB."""
    result = None
    if not db_fallback:
        try:
            result = db.tutorials.delete_one({"_id": ObjectId(tutorial_id)})
        except Exception:
            pass
            
    if not result or result.deleted_count == 0:
        # Fallback Mock lookup delete
        if tutorial_id in db.tutorials.data:
            del db.tutorials.data[tutorial_id]
            return {"success": True, "message": "Tutorial deleted from Mock database."}
        raise HTTPException(status_code=404, detail="Tutorial not found.")
        
    return {"success": True, "message": "Tutorial deleted successfully."}


# --- Core Flow / Root Page Route ---
@app.get("/")
def read_root():
    index_path = os.path.join("static", "index.html")
    if not os.path.exists(index_path):
        raise HTTPException(status_code=404, detail="index.html not found.")
    return FileResponse(index_path)

@app.post("/api/generate")
def generate_tutorial(request: GenerateRequest):
    """
    Simulates generation workflow, reads pre-generated mock data, 
    and saves the resulting payload to MongoDB under the user's account.
    """
    repo_url = request.repo_url.strip()
    username = request.username.strip().lower()
    
    if not repo_url:
        raise HTTPException(status_code=400, detail="Repository URL cannot be empty.")
    if not username:
        raise HTTPException(status_code=400, detail="User session not found. Please log in.")
        
    # Simulate a brief delay to demonstrate the frontend loading spinner and steps
    time.sleep(2.5)
    
    output_dir = os.path.join("output", "sample-project")
    if not os.path.exists(output_dir):
        raise HTTPException(status_code=500, detail="Tutorial source directory 'output/sample-project' not found.")
    
    # Load index.md
    index_file = os.path.join(output_dir, "index.md")
    if not os.path.exists(index_file):
        raise HTTPException(status_code=500, detail="Index file 'index.md' not found in sample-project.")
    
    with open(index_file, "r", encoding="utf-8") as f:
        index_content = f.read()
        
    # Read all chapter markdown files
    chapters = []
    try:
        filenames = os.listdir(output_dir)
        md_filenames = [f for f in filenames if f.endswith(".md") and f != "index.md"]
        md_filenames.sort()
        
        for fname in md_filenames:
            filepath = os.path.join(output_dir, fname)
            with open(filepath, "r", encoding="utf-8") as f:
                content = f.read()
            
            title = fname
            for line in content.splitlines():
                if line.startswith("# "):
                    title = line.replace("# ", "").strip()
                    break
            
            chapters.append({
                "title": title,
                "filename": fname,
                "content": content
            })
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading chapters: {str(e)}")
    
    # Save the generated tutorial to MongoDB (or mock)
    tutorial_doc = {
        "username": username,
        "repo_url": repo_url,
        "project_name": "sample-project",
        "index_content": index_content,
        "chapters": chapters,
        "created_at": datetime.utcnow()
    }
    
    result = db.tutorials.insert_one(tutorial_doc)
    doc_id = str(result.inserted_id)
        
    return {
        "success": True,
        "id": doc_id,
        "project_name": "sample-project",
        "repo_url": repo_url,
        "index_content": index_content,
        "chapters": chapters
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="127.0.0.1", port=8000, reload=True)
