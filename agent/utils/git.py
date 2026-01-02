import asyncio
import httpx
from utils.settings import settings
from utils.vector_store import upsert_document

async def get_github_owner() -> str:
    """Fetch the authenticated user's login (owner name) from GitHub."""
    token = settings.github_token
    async with httpx.AsyncClient() as client:
        response = await client.get(
            "https://api.github.com/user",
            headers={"Authorization": f"token {token}"}
        )
        if response.status_code == 200:
            return response.json()["login"]
        else:
            raise Exception(f"Failed to fetch user. Status: {response.status_code}")

async def sync_repository_to_vector_store(owner: str, repo: str) -> str:
    """
    Fetches all text files from the repository, chunks them, and syncs to Upstash Vector Store.
    Returns a summary string of the operation.
    """
    from utils.chunking import chunk_text, should_skip_file
    
    token = settings.github_token
    headers = {"Authorization": f"token {token}"}
    namespace = f"{owner}-{repo}"
    
    # 1. Get Tree Recursive
    async with httpx.AsyncClient() as client:
        # Get default branch sha first to be safe, or just recursive tree from 'main'
        tree_url = f"https://api.github.com/repos/{owner}/{repo}/git/trees/main?recursive=1"
        response = await client.get(tree_url, headers=headers)
        
        if response.status_code != 200:
             # Try master if main fails
             tree_url = f"https://api.github.com/repos/{owner}/{repo}/git/trees/master?recursive=1"
             response = await client.get(tree_url, headers=headers)
             if response.status_code != 200:
                # Add better error logging
                error_msg = f"Failed to fetch repository tree for {owner}/{repo}. Status: {response.status_code}"
                try:
                    error_detail = response.json()
                    error_msg += f", Detail: {error_detail.get('message', 'Unknown error')}"
                except:
                    pass
                print(f"ERROR: {error_msg}")
                raise Exception(error_msg)

        tree_data = response.json()
        
        # 2. Filter & Fetch Files with Chunking
        synced_count = 0
        chunk_count = 0
        skipped_count = 0
        
        for item in tree_data.get("tree", []):
            if item["type"] == "blob":
                path = item["path"]
                
                # Fetch content first to check if we should skip
                blob_url = item["url"] # API url for blob
                blob_resp = await client.get(blob_url, headers=headers)
                if blob_resp.status_code == 200:
                    import base64
                    try:
                        content_b64 = blob_resp.json()["content"]
                        content = base64.b64decode(content_b64).decode("utf-8")
                        
                        # Check if we should skip this file
                        if should_skip_file(path, content):
                            skipped_count += 1
                            continue
                        
                        # Chunk the content
                        chunks = chunk_text(content)
                        
                        # Upsert each chunk to Vector Store
                        for i, chunk in enumerate(chunks):
                            chunk_id = f"{path}-chunk-{i}"
                            metadata = {
                                "repository": f"{owner}/{repo}", 
                                "path": path,
                                "chunk_index": i,
                                "total_chunks": len(chunks)
                            }
                            await asyncio.to_thread(
                                upsert_document,
                                doc_id=chunk_id, 
                                content=chunk, 
                                metadata=metadata, 
                                namespace=namespace
                            )
                            chunk_count += 1
                        
                        synced_count += 1
                    except Exception as e:
                        print(f"Failed to parse/sync {path}: {e}")
                        skipped_count += 1
                        
        return f"Synced {synced_count} files ({chunk_count} chunks) to vector store. Skipped {skipped_count}."


async def sync_changed_files_to_vector(owner: str, repo: str, files: list[dict]) -> str:
    """
    Sync only specific changed files to vector store (incremental update).
    
    Args:
        owner: Repository owner
        repo: Repository name
        files: List of file dicts with 'path' and 'content' keys
    
    Returns:
        Summary string
    """
    from utils.chunking import chunk_text, should_skip_file
    
    namespace = f"{owner}-{repo}"
    synced_count = 0
    chunk_count = 0
    
    for file in files:
        path = file.get("path") or file.get("file_name")
        content = file.get("content", "")
        
        # Skip if needed
        if should_skip_file(path, content):
            continue
        
        # Chunk and upsert
        chunks = chunk_text(content)
        for i, chunk in enumerate(chunks):
            chunk_id = f"{path}-chunk-{i}"
            metadata = {
                "repository": f"{owner}/{repo}",
                "path": path,
                "chunk_index": i,
                "total_chunks": len(chunks)
            }
            upsert_document(
                doc_id=chunk_id,
                content=chunk,
                metadata=metadata,
                namespace=namespace
            )
            chunk_count += 1
        
        synced_count += 1
    
    return f"Incrementally synced {synced_count} files ({chunk_count} chunks)"


async def repositoryExists(repository_name: str) -> bool:
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"https://api.github.com/repos/{repository_name}",
                headers={"Authorization": f"token {settings.github_token}"}
            )
            if response.status_code == 200:
                return True
            elif response.status_code == 404:
                return False
            else:
                raise Exception(f"Error checking repository existence: {response.status_code}")
    except Exception as e:
        raise e

async def get_branch_sha(owner: str, repo: str, branch: str, token: str, client: httpx.AsyncClient) -> str:
    response = await client.get(
        f"https://api.github.com/repos/{owner}/{repo}/git/refs/heads/{branch}",
        headers={"Authorization": f"token {token}"}
    )
    if response.status_code != 200:
        raise Exception(f"Failed to get branch SHA for {branch}: {response.status_code} - {response.text}")
    return response.json()["object"]["sha"]

async def get_commit_tree_sha(owner: str, repo: str, commit_sha: str, token: str, client: httpx.AsyncClient) -> str:
    response = await client.get(
        f"https://api.github.com/repos/{owner}/{repo}/git/commits/{commit_sha}",
        headers={"Authorization": f"token {token}"}
    )
    if response.status_code != 200:
        raise Exception(f"Failed to get commit tree SHA: {response.status_code} - {response.text}")
    return response.json()["tree"]["sha"]

async def create_blob(owner: str, repo: str, content: str, token: str, client: httpx.AsyncClient) -> str:
    response = await client.post(
        f"https://api.github.com/repos/{owner}/{repo}/git/blobs",
        headers={"Authorization": f"token {token}"},
        json={"content": content, "encoding": "utf-8"}
    )
    if response.status_code != 201:
         raise Exception(f"Failed to create blob: {response.status_code} - {response.text}")
    return response.json()["sha"]

async def create_tree(owner: str, repo: str, base_tree_sha: str, files: list, token: str, client: httpx.AsyncClient) -> str:
    tree_items = []
    for file in files:
        blob_sha = await create_blob(owner, repo, file["content"], token, client)
        # Handle both 'path' (from development workflow) and 'file_name' (from initialize_project)
        file_path = file.get("path") or file.get("file_name")
        tree_items.append({
            "path": file_path,
            "mode": "100644",
            "type": "blob",
            "sha": blob_sha
        })
    
    response = await client.post(
        f"https://api.github.com/repos/{owner}/{repo}/git/trees",
        headers={"Authorization": f"token {token}"},
        json={"base_tree": base_tree_sha, "tree": tree_items}
    )
    if response.status_code != 201:
        raise Exception(f"Failed to create tree: {response.status_code} - {response.text}")
    return response.json()["sha"]

async def create_commit(owner: str, repo: str, parent_sha: str, tree_sha: str, message: str, token: str, client: httpx.AsyncClient) -> str:
    response = await client.post(
        f"https://api.github.com/repos/{owner}/{repo}/git/commits",
        headers={"Authorization": f"token {token}"},
        json={
            "message": message,
            "parents": [parent_sha],
            "tree": tree_sha
        },
    )
    if response.status_code != 201:
        raise Exception(f"Failed to create commit: {response.status_code} - {response.text}")
    return response.json()["sha"]

async def update_branch(owner: str, repo: str, branch: str, commit_sha: str, token: str, client: httpx.AsyncClient):
    response = await client.patch(
        f"https://api.github.com/repos/{owner}/{repo}/git/refs/heads/{branch}",
        headers={"Authorization": f"token {token}"},
        json={"sha": commit_sha, "force": True}
    )
    if response.status_code != 200:
        raise Exception(f"Failed to update branch: {response.status_code} - {response.text}")

async def createRepository(repo_name: str, description: str, private: bool = False) -> str:
    """Creates a new GitHub repository."""
    token = settings.github_token
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.github.com/user/repos",
                headers={
                    "Authorization": f"token {token}",
                    "Accept": "application/vnd.github.v3+json"
                },
                json={
                    "name": repo_name,
                    "description": description,
                    "private": private,
                    "auto_init": True 
                }
            )
            
            if response.status_code in (200, 201):
                return response.json()["html_url"]
            else:
                raise Exception(f"Failed to create repository: {response.status_code} - {response.text}")
    except Exception as e:
        raise Exception(f"Error creating repository: {str(e)}")

async def push_files(owner: str, repo_name: str, files: list, commit_message: str):
    """
    Orchestrates the git push mechanism using low-level Git Data API.
    Replicates logic from src/lib/git.ts.
    """
    token = settings.github_token
    
    async with httpx.AsyncClient() as client:
        # 1. Get Base SHA (assuming main)
        # Note: New repos created with auto_init will have a 'main' branch
        base_sha = await get_branch_sha(owner, repo_name, "main", token, client)
        
        # 2. Get Base Tree SHA
        base_tree_sha = await get_commit_tree_sha(owner, repo_name, base_sha, token, client)
        
        # 3. Create New Tree (Blobs + Tree)
        new_tree_sha = await create_tree(owner, repo_name, base_tree_sha, files, token, client)
        
        # 4. Create Commit
        new_commit_sha = await create_commit(owner, repo_name, base_sha, new_tree_sha, commit_message, token, client)
        
        # 5. Update Branch Ref
        await update_branch(owner, repo_name, "main", new_commit_sha, token, client)
        
        return f"https://github.com/{owner}/{repo_name}"


async def fetch_golden_context(owner: str, repo: str) -> str:
    """
    Fetch golden context files (brief, specs, etc) from GitHub.
    Returns a consolidated string or empty string if no files found.
    """
    token = settings.github_token
    headers = {"Authorization": f"token {token}"}
    
    context_files = [
        "project_brief.md",
        "technical_spec.md",
        "implementation_plan.md",
        "coding_guidelines.md",
        "README.md"
    ]
    
    golden_context_parts = []
    async with httpx.AsyncClient() as client:
        for filename in context_files:
            try:
                url = f"https://api.github.com/repos/{owner}/{repo}/contents/{filename}"
                response = await client.get(url, headers=headers)
                
                if response.status_code == 200:
                    import base64
                    content_b64 = response.json()["content"]
                    content = base64.b64decode(content_b64).decode("utf-8")
                    golden_context_parts.append(f"# {filename}\n\n{content}")
            except Exception:
                # Silently skip missing/failed files
                pass
    
    if not golden_context_parts:
        return ""
        
    return "\n\n---\n\n".join(golden_context_parts)