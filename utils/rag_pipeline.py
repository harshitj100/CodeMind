import os
import re
import git
import shutil
import requests
import numpy as np
import tree_sitter_languages
from tree_sitter import Parser
from pymongo import MongoClient

# Initialize MongoDB client connection helper
def get_db_client():
    mongo_uri = os.environ.get("MONGODB_URI", "mongodb://localhost:27017/")
    client = MongoClient(mongo_uri)
    db_name = os.environ.get("MONGODB_DB", "codebase_tutorial_builder")
    return client[db_name]

# Step 1: Clone repository locally with shallow depth
def clone_repository(repo_url: str, dest_dir: str):
    if os.path.exists(dest_dir):
        try:
            shutil.rmtree(dest_dir)
        except Exception as e:
            print(f"Error removing existing repo directory: {e}")
    
    print(f"Cloning {repo_url} into {dest_dir}...")
    git.Repo.clone_from(repo_url, dest_dir, depth=1)
    print("Cloning complete.")

# Map file extensions to Tree-sitter language keys
ext_to_lang = {
    '.py': 'python',
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.go': 'go',
    '.java': 'java',
    '.c': 'c',
    '.cpp': 'cpp',
    '.cc': 'cpp',
    '.h': 'c'
}

# Step 2 & 3: Parse repository using Tree-sitter and create semantic chunks
def chunk_file_tree_sitter(content: str, path: str) -> list:
    ext = os.path.splitext(path)[1].lower()
    lang_name = ext_to_lang.get(ext)
    
    chunks = []
    
    # If language is supported, try Tree-sitter parsing
    if lang_name:
        try:
            language = tree_sitter_languages.get_language(lang_name)
            parser = Parser()
            parser.set_language(language)
            
            encoded_content = content.encode('utf-8')
            tree = parser.parse(encoded_content)
            
            # Traversal walker to find logical boundaries (classes, functions, methods)
            def traverse(node):
                if node.type in [
                    'class_definition', 'function_definition', 'method_definition',
                    'class_declaration', 'function_declaration', 'method_declaration',
                    'arrow_function', 'function_expression'
                ]:
                    start_byte = node.start_byte
                    end_byte = node.end_byte
                    node_content = encoded_content[start_byte:end_byte].decode('utf-8', errors='ignore')
                    
                    # Extract name
                    name = "anonymous"
                    for child in node.children:
                        if child.type in ['identifier', 'property_identifier', 'name']:
                            name = encoded_content[child.start_byte:child.end_byte].decode('utf-8', errors='ignore')
                            break
                    
                    chunk_type = "class" if "class" in node.type else "function"
                    
                    # Keep chunk if it has a minimum size (avoid tiny chunks)
                    if len(node_content.strip()) > 40:
                        chunks.append({
                            "type": chunk_type,
                            "name": name,
                            "content": node_content,
                            "start_line": node.start_point[0] + 1,
                            "end_line": node.end_point[0] + 1
                        })
                
                for child in node.children:
                    traverse(child)
            
            traverse(tree.root_node)
        except Exception as e:
            print(f"Tree-sitter parser failed for {path}: {e}. Falling back to regex splitter.")
            chunks = chunk_file_regex(content, path)
    else:
        # Fallback to regex splitting for unsupported extensions
        chunks = chunk_file_regex(content, path)
        
    # If no structural chunks found, chunk the file as a single file block
    if not chunks:
        chunks.append({
            "type": "file",
            "name": os.path.basename(path),
            "content": content,
            "start_line": 1,
            "end_line": len(content.splitlines())
        })
        
    return chunks

# Simple Regex-based parser fallback
def chunk_file_regex(content: str, path: str) -> list:
    chunks = []
    lines = content.splitlines()
    
    current_chunk = []
    chunk_type = "file"
    chunk_name = os.path.basename(path)
    start_line = 1
    
    for idx, line in enumerate(lines):
        # Match python class / function headers or JS functions
        if line.strip().startswith("class ") or line.strip().startswith("def ") or line.strip().startswith("function ") or "const " in line and "=>" in line:
            if current_chunk and len("\n".join(current_chunk).strip()) > 40:
                chunks.append({
                    "type": chunk_type,
                    "name": chunk_name,
                    "content": "\n".join(current_chunk),
                    "start_line": start_line,
                    "end_line": idx
                })
            current_chunk = [line]
            chunk_type = "class" if "class " in line else "function"
            
            # Simple name parser
            match = re.search(r'(?:class|def|function)\s+(\w+)', line)
            chunk_name = match.group(1) if match else os.path.basename(path)
            start_line = idx + 1
        else:
            current_chunk.append(line)
            
    if current_chunk and len("\n".join(current_chunk).strip()) > 40:
        chunks.append({
            "type": chunk_type,
            "name": chunk_name,
            "content": "\n".join(current_chunk),
            "start_line": start_line,
            "end_line": len(lines)
        })
        
    return chunks

# Caching check state variables for Ollama status
_ollama_check_done = False
_ollama_available = False
_ollama_active_model = None
_ollama_endpoint_type = None

def check_ollama_setup():
    global _ollama_check_done, _ollama_available, _ollama_active_model, _ollama_endpoint_type
    if _ollama_check_done:
        return _ollama_available, _ollama_active_model, _ollama_endpoint_type
        
    ollama_url = os.environ.get("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
    if "localhost" in ollama_url:
        ollama_url = ollama_url.replace("localhost", "127.0.0.1")
        
    try:
        # Check /api/tags to see if Ollama is running and has models
        r = requests.get(f"{ollama_url}/api/tags", timeout=1.5)
        if r.status_code == 200:
            data = r.json()
            pulled_models = [m.get("name") for m in data.get("models", [])]
            # Normalize model names to list
            model_names = []
            for m in pulled_models:
                model_names.append(m)
                if ":" in m:
                    model_names.append(m.split(":")[0])
            
            preferred_models = ["nomic-embed-text", "mistral", "all-minilm"]
            active_model = None
            for pm in preferred_models:
                if pm in model_names:
                    active_model = next((m for m in pulled_models if m.startswith(pm)), pm)
                    break
            
            if active_model:
                # Test which endpoint works
                # Try /api/embed first
                try:
                    test_r = requests.post(f"{ollama_url}/api/embed", json={
                        "model": active_model,
                        "input": ["test"]
                    }, timeout=1.5)
                    if test_r.status_code == 200:
                        _ollama_endpoint_type = "/api/embed"
                except:
                    pass
                
                if not _ollama_endpoint_type:
                    # Try /api/embeddings
                    try:
                        test_r = requests.post(f"{ollama_url}/api/embeddings", json={
                            "model": active_model,
                            "prompt": "test"
                        }, timeout=1.5)
                        if test_r.status_code == 200:
                            _ollama_endpoint_type = "/api/embeddings"
                    except:
                        pass
                
                if _ollama_endpoint_type:
                    _ollama_active_model = active_model
                    _ollama_available = True
    except Exception as e:
        print(f"Ollama connection check failed: {e}")
        
    _ollama_check_done = True
    return _ollama_available, _ollama_active_model, _ollama_endpoint_type

# Step 4: Generate Embeddings using Ollama API (with hash-fallback)
def get_embedding(text: str) -> list:
    # 1. Try Gemini Embeddings if configured
    try:
        from utils.call_llm import get_llm_provider
        provider = get_llm_provider()
    except ImportError:
        provider = os.getenv("LLM_PROVIDER")
        if not provider and (os.getenv("GEMINI_PROJECT_ID") or os.getenv("GEMINI_API_KEY")):
            provider = "GEMINI"
            
    if provider == "GEMINI" and (os.getenv("GEMINI_API_KEY") or os.getenv("GEMINI_PROJECT_ID")):
        try:
            from google import genai
            if os.getenv("GEMINI_PROJECT_ID"):
                client = genai.Client(
                    vertexai=True,
                    project=os.getenv("GEMINI_PROJECT_ID"),
                    location=os.getenv("GEMINI_LOCATION", "us-central1")
                )
            else:
                client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
                
            r = client.models.embed_content(
                model="text-embedding-004",
                contents=text
            )
            if r.embeddings:
                return r.embeddings[0].values
        except Exception as e:
            print(f"Gemini embedding failed: {e}")
            
    # 2. Try Ollama (using cached check result)
    ollama_available, active_model, endpoint_type = check_ollama_setup()
    if ollama_available:
        ollama_url = os.environ.get("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
        if "localhost" in ollama_url:
            ollama_url = ollama_url.replace("localhost", "127.0.0.1")
            
        try:
            if endpoint_type == "/api/embed":
                r = requests.post(f"{ollama_url}/api/embed", json={
                    "model": active_model,
                    "input": [text]
                }, timeout=4)
                if r.status_code == 200:
                    vecs = r.json().get("embeddings")
                    if vecs:
                        return vecs[0]
            elif endpoint_type == "/api/embeddings":
                r = requests.post(f"{ollama_url}/api/embeddings", json={
                    "model": active_model,
                    "prompt": text
                }, timeout=4)
                if r.status_code == 200:
                    vec = r.json().get("embedding")
                    if vec:
                        return vec
        except Exception as e:
            print(f"Ollama embedding request failed for model {active_model}: {e}")
            
    # 3. Fast fallback: Hashed vector
    import hashlib
    h = hashlib.sha256(text.encode('utf-8')).digest()
    np.random.seed(int.from_bytes(h[:4], 'big'))
    return np.random.uniform(-1, 1, 384).tolist()

# Step 5: Store every chunk inside MongoDB Atlas Vector Search
def index_repository_rag(repo_id: str, local_path: str):
    db = get_db_client()
    
    # Clean previous chunks for this repository to avoid duplicates
    db.chunks.delete_many({"repo_id": repo_id})
    
    file_list = []
    for root, dirs, files in os.walk(local_path):
        # Exclude build and virtual env assets
        dirs[:] = [d for d in dirs if d not in ['venv', '.venv', 'node_modules', '.git', '__pycache__', 'dist', 'build']]
        for file in files:
            ext = os.path.splitext(file)[1].lower()
            if ext in ext_to_lang or ext in ['.md', '.txt', '.json', '.yaml', '.yml']:
                rel_path = os.path.relpath(os.path.join(root, file), local_path).replace("\\", "/")
                file_list.append((rel_path, os.path.join(root, file)))
                
    chunk_docs = []
    chunk_counter = 0
    
    for rel_path, abs_path in file_list:
        try:
            with open(abs_path, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()
        except:
            continue
            
        if not content.strip():
            continue
            
        # Chunk file semantically
        chunks = chunk_file_tree_sitter(content, rel_path)
        
        for c in chunks:
            vector = get_embedding(c["content"])
            
            chunk_docs.append({
                "repo_id": repo_id,
                "chunk_id": f"{repo_id}-chunk-{chunk_counter}",
                "path": rel_path,
                "language": os.path.splitext(rel_path)[1].replace(".", ""),
                "type": c["type"],
                "content": c["content"],
                "embedding": vector,
                "metadata": {
                    "name": c["name"],
                    "start_line": c["start_line"],
                    "end_line": c["end_line"]
                }
            })
            chunk_counter += 1
            
    # Insert chunks in batches
    if chunk_docs:
        db.chunks.insert_many(chunk_docs)
    print(f"Successfully indexed {len(chunk_docs)} semantic code chunks for Repo ID {repo_id}.")

# Vector Search Retrieval (Atlas Vector Search + Memory Fallback)
def retrieve_relevant_chunks(repo_id: str, query: str, limit: int = 30) -> list:
    db = get_db_client()
    query_vector = get_embedding(query)
    
    # Try MongoDB Atlas Vector Search
    try:
        pipeline = [
            {
                "$vectorSearch": {
                    "index": "vector_index",
                    "path": "embedding",
                    "queryVector": query_vector,
                    "numCandidates": 100,
                    "limit": limit,
                    "filter": { "repo_id": repo_id }
                }
            }
        ]
        results = list(db.chunks.aggregate(pipeline))
        if results:
            # Map score fields
            for r in results:
                r["score"] = r.get("score", 0.5)
            return results
    except Exception as e:
        print(f"Atlas search inactive or missing vector_index: {e}. Falling back to in-memory cosine search.")
        
    # Memory fallback: Cosine Similarity
    try:
        chunks = list(db.chunks.find({"repo_id": repo_id}))
        if not chunks:
            return []
            
        q_vec = np.array(query_vector)
        q_norm = np.linalg.norm(q_vec)
        if q_norm == 0:
            return chunks[:limit]
            
        scored = []
        for c in chunks:
            c_vec = np.array(c.get("embedding", []))
            if len(c_vec) != len(q_vec):
                score = 0
            else:
                c_norm = np.linalg.norm(c_vec)
                if c_norm == 0:
                    score = 0
                else:
                    score = np.dot(q_vec, c_vec) / (q_norm * c_norm)
                    
            c["score"] = float(score)
            scored.append(c)
            
        scored.sort(key=lambda x: x["score"], reverse=True)
        return scored[:limit]
    except Exception as ex:
        print(f"Fallback cosine search failed: {ex}")
        return list(db.chunks.find({"repo_id": repo_id})[:limit])

# Hybrid TF-IDF overlap Reranker
def rerank_chunks(query: str, retrieved_chunks: list, top_k: int = 6) -> list:
    query_words = set(re.findall(r"\w+", query.lower()))
    if not query_words:
        return retrieved_chunks[:top_k]
        
    reranked = []
    for c in retrieved_chunks:
        content = c.get("content", "").lower()
        content_words = set(re.findall(r"\w+", content))
        
        # Calculate term overlap density
        overlap = len(query_words.intersection(content_words))
        keyword_score = overlap / len(query_words) if query_words else 0
        
        # Combined Score (60% Vector Semantic, 40% Keyword overlap density)
        semantic_score = c.get("score", 0.5)
        combined_score = (semantic_score * 0.6) + (keyword_score * 0.4)
        
        c["combined_score"] = combined_score
        reranked.append(c)
        
    reranked.sort(key=lambda x: x["combined_score"], reverse=True)
    return reranked[:top_k]
