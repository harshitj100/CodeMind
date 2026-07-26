import os
import time
import re
from datetime import datetime
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import bcrypt
from pymongo import MongoClient
from bson import ObjectId
from starlette.middleware.base import BaseHTTPMiddleware
from dotenv import load_dotenv
import json
import requests

from utils.rag_pipeline import (
    clone_repository,
    index_repository_rag,
    retrieve_relevant_chunks,
    rerank_chunks
)

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
        
    graph_data = tutorial.get("graph")
    if not graph_data:
        graph_data = generate_repository_graph(tutorial.get("project_name", "sample-project"), tutorial.get("repo_url", ""))
        
    return {
        "success": True,
        "project_name": tutorial.get("project_name", "sample-project"),
        "repo_url": tutorial.get("repo_url", ""),
        "status": tutorial.get("status", "completed"),
        "chat_ready": tutorial.get("chat_ready", True),
        "index_content": tutorial.get("index_content", ""),
        "chapters": tutorial.get("chapters", []),
        "graph": graph_data
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


def generate_repository_graph(project_name: str, repo_url: str, local_dir: str = None) -> dict:
    """
    Generates a node-edge graph representation of the codebase.
    Returns predefined highly descriptive graph for 'sample-project', 
    and scans actual files dynamically for any other repository.
    """
    if project_name == "sample-project" or (repo_url and "sample-project" in repo_url):
        return {
            "nodes": [
                {
                    "id": "src/",
                    "type": "folder",
                    "label": "src",
                    "path": "src",
                    "summary": "Root source directory containing core logic modules."
                },
                {
                    "id": "src/auth/",
                    "type": "folder",
                    "label": "auth",
                    "path": "src/auth",
                    "summary": "User management, authentication, passwords, and sessions."
                },
                {
                    "id": "src/auth/auth.py",
                    "type": "file",
                    "label": "auth.py",
                    "path": "src/auth/auth.py",
                    "summary": "Authentication controller implementing JWT login and signup endpoints.",
                    "language": "python",
                    "classes": ["User", "SessionManager"],
                    "functions": ["login_user", "register_user", "verify_token"],
                    "imports": ["src/db/connection.py"],
                    "imported_by": ["src/orders/orders.py"],
                    "chapter_idx": 1
                },
                {
                    "id": "src/auth/auth.py::User",
                    "type": "class",
                    "label": "User",
                    "path": "src/auth/auth.py",
                    "summary": "User model holding profile information and credential hashes."
                },
                {
                    "id": "src/auth/auth.py::hash_password",
                    "type": "function",
                    "label": "hash_password",
                    "path": "src/auth/auth.py",
                    "summary": "Helper function encrypting raw passwords via bcrypt salt rounds."
                },
                {
                    "id": "src/catalog/",
                    "type": "folder",
                    "label": "catalog",
                    "path": "src/catalog",
                    "summary": "Product catalogue, search indices, categories, and inventory."
                },
                {
                    "id": "src/catalog/catalog.py",
                    "type": "file",
                    "label": "catalog.py",
                    "path": "src/catalog/catalog.py",
                    "summary": "Manages database products listing and search filters.",
                    "language": "python",
                    "classes": ["Product", "CatalogIndex"],
                    "functions": ["search_catalog", "add_product"],
                    "imports": ["src/db/connection.py"],
                    "imported_by": ["src/cart/cart.py", "src/agents/recommender.py"],
                    "chapter_idx": 2
                },
                {
                    "id": "src/catalog/catalog.py::Product",
                    "type": "class",
                    "label": "Product",
                    "path": "src/catalog/catalog.py",
                    "summary": "Entity schema mapping catalog items."
                },
                {
                    "id": "src/catalog/catalog.py::ProductEmbedder",
                    "type": "embedding",
                    "label": "ProductEmbedder",
                    "path": "src/catalog/catalog.py",
                    "summary": "Generates Vector embeddings of products for semantic similarity lookup."
                },
                {
                    "id": "src/cart/",
                    "type": "folder",
                    "label": "cart",
                    "path": "src/cart",
                    "summary": "Shopping cart operations, line item computations, and cache."
                },
                {
                    "id": "src/cart/cart.py",
                    "type": "file",
                    "label": "cart.py",
                    "path": "src/cart/cart.py",
                    "summary": "Implements active user shopping session caching and total calculator.",
                    "language": "python",
                    "classes": ["ShoppingCart"],
                    "functions": ["add_to_cart", "clear_cart"],
                    "imports": ["src/catalog/catalog.py"],
                    "imported_by": ["src/orders/orders.py"],
                    "chapter_idx": 3
                },
                {
                    "id": "src/cart/cart.py::ShoppingCart",
                    "type": "class",
                    "label": "ShoppingCart",
                    "path": "src/cart/cart.py",
                    "summary": "Shopping cart controller caching active items."
                },
                {
                    "id": "src/orders/",
                    "type": "folder",
                    "label": "orders",
                    "path": "src/orders",
                    "summary": "Checkout logic, billing, receipts, invoice generation, and status."
                },
                {
                    "id": "src/orders/orders.py",
                    "type": "file",
                    "label": "orders.py",
                    "path": "src/orders/orders.py",
                    "summary": "Validates transactions and completes purchases.",
                    "language": "python",
                    "classes": ["Order", "PaymentGateway"],
                    "functions": ["checkout_cart", "process_payment"],
                    "imports": ["src/cart/cart.py", "src/auth/auth.py"],
                    "imported_by": [],
                    "chapter_idx": 4
                },
                {
                    "id": "src/orders/orders.py::Order",
                    "type": "class",
                    "label": "Order",
                    "path": "src/orders/orders.py",
                    "summary": "Order schema containing shipping and line item details."
                },
                {
                    "id": "src/orders/orders.py::POST_checkout",
                    "type": "api",
                    "label": "POST /api/checkout",
                    "path": "src/orders/orders.py",
                    "summary": "API endpoint receiving user cart checkouts and triggering billing."
                },
                {
                    "id": "src/db/",
                    "type": "folder",
                    "label": "db",
                    "path": "src/db",
                    "summary": "Database connection clients, environment loaders, and base tables."
                },
                {
                    "id": "src/db/connection.py",
                    "type": "file",
                    "label": "connection.py",
                    "path": "src/db/connection.py",
                    "summary": "Creates connections to database instances.",
                    "language": "python",
                    "classes": ["DatabaseConnection"],
                    "functions": ["get_db_session"],
                    "imports": [],
                    "imported_by": ["src/auth/auth.py", "src/catalog/catalog.py", "src/orders/orders.py"],
                    "chapter_idx": 5
                },
                {
                    "id": "src/db/connection.py::MongoDB",
                    "type": "database",
                    "label": "MongoDB",
                    "path": "src/db/connection.py",
                    "summary": "Main document datastore containing user accounts and purchase orders."
                },
                {
                    "id": "src/agents/",
                    "type": "folder",
                    "label": "agents",
                    "path": "src/agents",
                    "summary": "AI recommendation engines, search copilots, and prompts."
                },
                {
                    "id": "src/agents/recommender.py",
                    "type": "file",
                    "label": "recommender.py",
                    "path": "src/agents/recommender.py",
                    "summary": "AI recommendation controller using catalog embedders to generate suggestions.",
                    "language": "python",
                    "classes": ["AssistantAgent"],
                    "functions": ["generate_recommendations"],
                    "imports": ["src/catalog/catalog.py"],
                    "imported_by": [],
                    "chapter_idx": 6
                },
                {
                    "id": "src/agents/recommender.py::ShoppingAssistantAgent",
                    "type": "agent",
                    "label": "ShoppingAssistantAgent",
                    "path": "src/agents/recommender.py",
                    "summary": "Conversational AI assistant helping buyers find items in the store."
                }
            ],
            "edges": [
                { "source": "src/auth/auth.py", "target": "src/db/connection.py", "type": "imports" },
                { "source": "src/catalog/catalog.py", "target": "src/db/connection.py", "type": "imports" },
                { "source": "src/cart/cart.py", "target": "src/catalog/catalog.py", "type": "imports" },
                { "source": "src/orders/orders.py", "target": "src/cart/cart.py", "type": "imports" },
                { "source": "src/orders/orders.py", "target": "src/auth/auth.py", "type": "imports" },
                { "source": "src/agents/recommender.py", "target": "src/catalog/catalog.py", "type": "imports" },
                
                { "source": "src/auth/auth.py::hash_password", "target": "src/auth/auth.py::User", "type": "calls" },
                { "source": "src/orders/orders.py::POST_checkout", "target": "src/orders/orders.py::Order", "type": "calls" },
                { "source": "src/orders/orders.py::POST_checkout", "target": "src/cart/cart.py::ShoppingCart", "type": "calls" },
                { "source": "src/agents/recommender.py::ShoppingAssistantAgent", "target": "src/catalog/catalog.py::ProductEmbedder", "type": "semantic" },
                { "source": "src/agents/recommender.py::ShoppingAssistantAgent", "target": "src/catalog/catalog.py::Product", "type": "composition" },
                { "source": "src/orders/orders.py::Order", "target": "src/db/connection.py::MongoDB", "type": "runtime" },
                { "source": "src/auth/auth.py::User", "target": "src/db/connection.py::MongoDB", "type": "runtime" },
                { "source": "src/auth/auth.py::SessionManager", "target": "src/auth/auth.py::User", "type": "composition" }
            ]
        }
    
    nodes = []
    edges = []
    target_path = local_dir or os.path.join("venv", "temp_repos", project_name)
    if not os.path.exists(target_path):
        target_path = "." # Fallback
        
    file_list = []
    for root, dirs, files in os.walk(target_path):
        dirs[:] = [d for d in dirs if d not in ['venv', '.venv', 'node_modules', '.git', '__pycache__', 'dist', 'build']]
        for file in files:
            ext = os.path.splitext(file)[1]
            if ext in ['.py', '.js', '.jsx', '.ts', '.tsx', '.go', '.java']:
                rel_path = os.path.relpath(os.path.join(root, file), target_path).replace("\\", "/")
                file_list.append((rel_path, os.path.join(root, file)))

    folders = set()
    for rel_path, abs_path in file_list:
        parts = rel_path.split("/")[:-1]
        for i in range(len(parts)):
            folders.add("/".join(parts[:i+1]) + "/")

    for folder in sorted(folders):
        nodes.append({
            "id": folder,
            "type": "folder",
            "label": folder.split("/")[-2],
            "path": folder,
            "summary": f"Directory containing codebase modules for {folder.split('/')[-2]}."
        })

    for rel_path, abs_path in file_list:
        try:
            with open(abs_path, "r", encoding="utf-8", errors="ignore") as f:
                code = f.read()
        except:
            code = ""
            
        classes = re.findall(r"class\s+(\w+)", code)
        functions = re.findall(r"(?:def|function)\s+(\w+)", code)
        
        summary = f"Codebase file implementing logical routines for {os.path.basename(rel_path)}."
        docstring_match = re.search(r'"""([\s\S]*?)"""', code)
        if docstring_match:
            summary = docstring_match.group(1).strip().split("\n")[0]
            
        nodes.append({
            "id": rel_path,
            "type": "file",
            "label": os.path.basename(rel_path),
            "path": rel_path,
            "summary": summary,
            "language": os.path.splitext(rel_path)[1].replace(".", ""),
            "classes": classes,
            "functions": functions,
            "imports": [],
            "imported_by": []
        })

        for cls in classes:
            nodes.append({
                "id": f"{rel_path}::{cls}",
                "type": "class",
                "label": cls,
                "path": rel_path,
                "summary": f"Class definition '{cls}' inside {os.path.basename(rel_path)}."
            })
            edges.append({
                "source": f"{rel_path}::{cls}",
                "target": rel_path,
                "type": "composition"
            })
        for fn in functions:
            if fn not in ["__init__", "prep", "exec", "post"]:
                nodes.append({
                    "id": f"{rel_path}::{fn}",
                    "type": "function",
                    "label": fn,
                    "path": rel_path,
                    "summary": f"Function utility '{fn}' declared in {os.path.basename(rel_path)}."
                })
                edges.append({
                    "source": f"{rel_path}::{fn}",
                    "target": rel_path,
                    "type": "calls"
                })

    for rel_path, abs_path in file_list:
        try:
            with open(abs_path, "r", encoding="utf-8", errors="ignore") as f:
                lines = f.readlines()
        except:
            lines = []
            
        for line in lines:
            for other_rel_path, _ in file_list:
                if other_rel_path == rel_path:
                    continue
                other_name = os.path.splitext(os.path.basename(other_rel_path))[0]
                if other_name in line and ("import" in line or "require" in line or "from" in line):
                    exists = any(e["source"] == rel_path and e["target"] == other_rel_path for e in edges)
                    if not exists:
                        edges.append({
                            "source": rel_path,
                            "target": other_rel_path,
                            "type": "imports"
                        })
                        
    return {"nodes": nodes, "edges": edges}

# --- Core Flow / Root Page Route ---
@app.get("/")
def read_root():
    index_path = os.path.join("static", "index.html")
    if not os.path.exists(index_path):
        raise HTTPException(status_code=404, detail="index.html not found.")
    return FileResponse(index_path)

def run_background_pipeline(doc_id: str, repo_url: str, username: str):
    """
    Background worker running RAG indexing (Tree-sitter parse + embeddings) in parallel,
    updating status when chat is ready, and calling existing tutorial generator.
    """
    try:
        dest_dir = os.path.join("venv", "temp_repos", doc_id)
        # 1. Clone repository
        clone_repository(repo_url, dest_dir)
        
        # 2. Run RAG Indexing Pipeline (AST parses code semantically and embeds chunks)
        index_repository_rag(doc_id, dest_dir)
        
        # Chat is now ready! Update status in DB
        if not db_fallback:
            db.tutorials.update_one(
                {"_id": ObjectId(doc_id)},
                {"$set": {"chat_ready": True, "status": "generating"}}
            )
        else:
            db.tutorials.data[doc_id]["chat_ready"] = True
            db.tutorials.data[doc_id]["status"] = "generating"
            
        # 3. Run the actual PocketFlow tutorial generator pipeline
        from flow import create_tutorial_flow
        from main import DEFAULT_INCLUDE_PATTERNS, DEFAULT_EXCLUDE_PATTERNS
        
        # Initialize the shared dictionary
        shared_flow_data = {
            "repo_url": None, # Force crawling from local directory
            "local_dir": dest_dir, # Target the cloned directory
            "project_name": "sample-project", # Write to sample-project output folder
            "github_token": None,
            "output_dir": "output",

            "include_patterns": DEFAULT_INCLUDE_PATTERNS,
            "exclude_patterns": DEFAULT_EXCLUDE_PATTERNS,
            "max_file_size": 100000,
            "language": "english",
            "use_cache": True,
            "max_abstraction_num": 10,

            # Outputs populated by nodes
            "files": [],
            "abstractions": [],
            "relationships": {},
            "chapter_order": [],
            "chapters": [],
            "final_output_dir": None
        }
        
        tutorial_flow = create_tutorial_flow()
        tutorial_flow.run(shared_flow_data)
        
        output_dir = shared_flow_data.get("final_output_dir") or os.path.join("output", "sample-project")
        if not os.path.exists(output_dir):
            raise Exception(f"Tutorial source directory '{output_dir}' not found.")
            
        index_file = os.path.join(output_dir, "index.md")
        with open(index_file, "r", encoding="utf-8") as f:
            index_content = f.read()
            
        chapters = []
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
            
        graph_data = generate_repository_graph("sample-project", repo_url, dest_dir)
        
        # Complete tutorial generation
        if not db_fallback:
            db.tutorials.update_one(
                {"_id": ObjectId(doc_id)},
                {"$set": {
                    "status": "completed",
                    "index_content": index_content,
                    "chapters": chapters,
                    "graph": graph_data
                }}
            )
        else:
            db.tutorials.data[doc_id]["status"] = "completed"
            db.tutorials.data[doc_id]["index_content"] = index_content
            db.tutorials.data[doc_id]["chapters"] = chapters
            db.tutorials.data[doc_id]["graph"] = graph_data
            
    except Exception as e:
        print(f"Error in background pipeline: {e}")
        if not db_fallback:
            try:
                db.tutorials.update_one(
                    {"_id": ObjectId(doc_id)},
                    {"$set": {"status": "failed", "error": str(e)}}
                )
            except:
                pass
        else:
            db.tutorials.data[doc_id]["status"] = "failed"
            db.tutorials.data[doc_id]["error"] = str(e)

@app.post("/api/generate")
def generate_tutorial(request: GenerateRequest, background_tasks: BackgroundTasks):
    """
    Triggers parallel RAG indexing + tutorial generation pipeline in the background.
    Returns immediately with indexing status.
    """
    repo_url = request.repo_url.strip()
    username = request.username.strip().lower()
    
    if not repo_url:
        raise HTTPException(status_code=400, detail="Repository URL cannot be empty.")
    if not username:
        raise HTTPException(status_code=400, detail="User session not found. Please log in.")
        
    tutorial_doc = {
        "username": username,
        "repo_url": repo_url,
        "project_name": "sample-project",
        "status": "indexing",
        "chat_ready": False,
        "index_content": "",
        "chapters": [],
        "graph": None,
        "created_at": datetime.utcnow()
    }
    
    if not db_fallback:
        result = db.tutorials.insert_one(tutorial_doc)
        doc_id = str(result.inserted_id)
    else:
        import uuid
        doc_id = str(uuid.uuid4())
        tutorial_doc["_id"] = doc_id
        db.tutorials.data[doc_id] = tutorial_doc
        
    # Launch RAG indexing & pocketflow generation in parallel
    background_tasks.add_task(run_background_pipeline, doc_id, repo_url, username)
    
    return {
        "success": True,
        "id": doc_id,
        "project_name": "sample-project",
        "repo_url": repo_url,
        "status": "indexing",
        "chat_ready": False
    }

# --- RAG Chat Models and Route ---
class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    repo_id: str
    messages: list[ChatMessage]

@app.post("/api/chat/stream")
def chat_stream(request: ChatRequest):
    """
    Streaming repository-aware assistant chat endpoint querying MongoDB Atlas vector indices,
    applying hyrid overlap density rerankers, and prompting local Ollama Mistral model.
    """
    repo_id = request.repo_id
    messages = request.messages
    
    if not messages:
        raise HTTPException(status_code=400, detail="Conversation message list cannot be empty.")
        
    user_query = messages[-1].content
    
    # 1. Query vector store for top 25 chunks
    retrieved = retrieve_relevant_chunks(repo_id, user_query, limit=25)
    
    # 2. Rerank to top 6 chunks
    reranked = rerank_chunks(user_query, retrieved, top_k=6)
    
    # 3. Assemble prompt injection context
    context_str = ""
    for idx, c in enumerate(reranked):
        context_str += f"\n[File: {c['path']} | Node Type: {c['type']} | Lines: {c['metadata']['start_line']}-{c['metadata']['end_line']}]\n{c['content']}\n"
        
    system_prompt = f"""You are a repository-aware codebase assistant. You answer questions about the codebase structure using the following retrieved code context.
Ensure your answers are accurate and directly reference the retrieved files and line ranges.
Format your responses with clear bullet points and markdown code block highlighting.
If you cannot find the answer in the retrieved context, state that clearly.
Do NOT make up information.

Retrieved Code Context:
{context_str}
"""
    
    # 4. Build chat payloads for Ollama Mistral
    ollama_messages = [
        {"role": "system", "content": system_prompt}
    ]
    for msg in messages[:-1]:
        ollama_messages.append({"role": msg.role, "content": msg.content})
        
    ollama_messages.append({
        "role": "user",
        "content": f"Based on the code context, answer the following question: {user_query}"
    })
    
    def generate_response():
        provider = os.environ.get("LLM_PROVIDER")
        if not provider and (os.environ.get("GEMINI_PROJECT_ID") or os.environ.get("GEMINI_API_KEY")):
            provider = "GEMINI"

        if provider == "GEMINI":
            try:
                from google import genai
                if os.environ.get("GEMINI_PROJECT_ID"):
                    client = genai.Client(
                        vertexai=True,
                        project=os.environ.get("GEMINI_PROJECT_ID"),
                        location=os.environ.get("GEMINI_LOCATION", "us-central1")
                    )
                else:
                    client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))
                model = os.environ.get("GEMINI_MODEL", "gemini-2.5-pro-exp-03-25")
                
                contents = []
                contents.append(f"System Instructions:\n{system_prompt}\n")
                for msg in messages[:-1]:
                    contents.append(f"{msg.role}: {msg.content}")
                contents.append(f"Based on the code context, answer the following question: {user_query}")
                
                response_stream = client.models.generate_content_stream(
                    model=model,
                    contents=contents
                )
                for chunk in response_stream:
                    if chunk.text:
                        yield chunk.text
            except Exception as e:
                yield f"Error calling Gemini: {e}"

        elif provider:
            model_var = f"{provider}_MODEL"
            base_url_var = f"{provider}_BASE_URL"
            api_key_var = f"{provider}_API_KEY"

            model = os.environ.get(model_var)
            base_url = os.environ.get(base_url_var)
            api_key = os.environ.get(api_key_var, "")

            if not model or not base_url:
                yield f"Error: {model_var} or {base_url_var} is not set."
                return

            url = f"{base_url.rstrip('/')}/v1/chat/completions"
            headers = {
                "Content-Type": "application/json"
            }
            if api_key:
                headers["Authorization"] = f"Bearer {api_key}"

            openai_messages = [
                {"role": "system", "content": system_prompt}
            ]
            for msg in messages[:-1]:
                openai_messages.append({"role": msg.role, "content": msg.content})
            openai_messages.append({
                "role": "user",
                "content": f"Based on the code context, answer the following question: {user_query}"
            })

            payload = {
                "model": model,
                "messages": openai_messages,
                "temperature": 0.3,
                "stream": True
            }

            try:
                r = requests.post(url, headers=headers, json=payload, stream=True, timeout=90)
                if r.status_code != 200:
                    yield f"Error calling {provider} API (Status: {r.status_code}, Detail: {r.text})"
                    return
                
                for line in r.iter_lines():
                    if line:
                        decoded = line.decode('utf-8').strip()
                        if decoded.startswith("data: "):
                            data_str = decoded[6:]
                            if data_str == "[DONE]":
                                break
                            try:
                                data = json.loads(data_str)
                                token = data.get("choices", [{}])[0].get("delta", {}).get("content", "")
                                if token:
                                    yield token
                            except:
                                pass
            except Exception as e:
                yield f"Connection Error calling {provider}: {e}"
        else:
            ollama_url = os.environ.get("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
            if "localhost" in ollama_url:
                ollama_url = ollama_url.replace("localhost", "127.0.0.1")
            try:
                r = requests.post(f"{ollama_url}/api/chat", json={
                    "model": "mistral",
                    "messages": ollama_messages,
                    "stream": True
                }, stream=True, timeout=90)
                
                if r.status_code != 200:
                    yield f"Error calling Ollama (Status: {r.status_code})"
                    return
                    
                for line in r.iter_lines():
                    if line:
                        decoded = line.decode('utf-8')
                        try:
                            data = json.loads(decoded)
                            token = data.get("message", {}).get("content", "")
                            if token:
                                yield token
                            if data.get("done", False):
                                break
                        except:
                            pass
            except Exception as e:
                yield f"Connection Error: Could not connect to locally running Ollama Mistral model on {ollama_url}. Please ensure Ollama is running and has 'mistral' pulled."

    return StreamingResponse(generate_response(), media_type="text/event-stream")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="127.0.0.1", port=8000, reload=True, reload_excludes=[".temp_repos", ".temp_repos/*", "temp_repos", "temp_repos/*"])
