"""
Autonomous Development Workflow Graph

This graph implements a RAG-driven, self-directed development process:
1. Syncs repository to vector store
2. Plans next objective based on golden context
3. Implements objective using ReAct pattern with self-correction
4. Commits changes and updates vector store
5. Reflects on progress
6. Repeats until project is complete or max iterations reached
"""

import asyncio
import json
import base64
from langgraph.graph import StateGraph, START, END
from schema.state import DevelopmentState
from utils.git import sync_repository_to_vector_store, push_files, get_github_owner
from utils.vector_store import search_documents, upsert_document
from utils.chunking import chunk_text
from agents.agents import (
    run_planning_agent,
    run_coder_agent_with_assertions,
    run_critic_agent,
    run_reflection_agent
)


async def get_codebase_summary(namespace: str, top_k: int = 20) -> str:
    """Get a summary of the current codebase from vector store."""
    try:
        # Wrap blocking call in asyncio.to_thread
        results = await asyncio.to_thread(
            search_documents,
            query="project structure files components",
            top_k=top_k,
            namespace=namespace
        )
        
        file_paths = set()
        for res in results:
            path = res.metadata.get("path", "unknown")
            file_paths.add(path)
        
        summary = f"Current codebase contains {len(file_paths)} files: {', '.join(sorted(file_paths)[:15])}"
        return summary
    except Exception as e:
        return "Codebase summary unavailable"


# ============================================================================
# GRAPH NODES
# ============================================================================

async def InitializeFromRepository(state: DevelopmentState):
    """
    Initialize the development workflow from just a repository name.
    Fetches golden context from the repo's markdown files.
    """
    print("=" * 60)
    print("INITIALIZING FROM REPOSITORY")
    print("=" * 60)
    
    repository_name = state.get("repository_name")
    
    # Parse owner/repo
    if "/" in repository_name:
        owner, repo_name = repository_name.split("/", 1)
    else:
        owner = await get_github_owner()
        repo_name = repository_name
    
    namespace = f"{owner}-{repo_name}"
    
    print(f"📦 Repository: {owner}/{repo_name}")
    print(f"🔖 Namespace: {namespace}")
    
    # Fetch golden context from repo markdown files
    print("📚 Fetching golden context from repository...")
    
    import httpx
    from utils.settings import settings
    
    token = settings.github_token
    headers = {"Authorization": f"token {token}"}
    
    golden_context_parts = []
    
    # Files to fetch for golden context
    context_files = [
        "project_brief.md",
        "technical_spec.md",
        "implementation_plan.md",
        "coding_guidelines.md"
    ]
    
    async with httpx.AsyncClient() as client:
        for filename in context_files:
            try:
                url = f"https://api.github.com/repos/{owner}/{repo_name}/contents/{filename}"
                response = await client.get(url, headers=headers)
                
                if response.status_code == 200:
                    import base64
                    content_b64 = response.json()["content"]
                    content = base64.b64decode(content_b64).decode("utf-8")
                    golden_context_parts.append(f"# {filename}\n\n{content}")
                    print(f"  ✓ Loaded {filename}")
                else:
                    print(f"  ⚠️  {filename} not found (skipping)")
            except Exception as e:
                print(f"  ⚠️  Failed to load {filename}: {e}")
    
    if not golden_context_parts:
        raise Exception("No golden context files found in repository. Please ensure project_brief.md and technical_spec.md exist.")
    
    golden_context = "\n\n---\n\n".join(golden_context_parts)
    
    print(f"✅ Loaded {len(golden_context_parts)} context files ({len(golden_context)} chars)")
    
    return {
        "owner": owner,
        "repo_name": repo_name,
        "namespace": namespace,
        "golden_context": golden_context
    }


async def SyncRepository(state: DevelopmentState):
    """Initial sync of repository to vector store."""
    print("\n" + "=" * 60)
    print("SYNCING REPOSITORY TO VECTOR STORE")
    print("=" * 60)
    
    owner = state.get("owner")
    repo_name = state.get("repo_name")
    namespace = state.get("namespace")
    
    # Clean up existing namespace vectors to prevent hallucination
    from utils.vector_store import delete_namespace
    try:
        await asyncio.to_thread(delete_namespace, namespace)
        print(f"✓ Cleaned up namespace: {namespace}")
    except Exception as e:
        print(f"⚠️  Failed to cleanup namespace {namespace}: {e}")
    
    sync_result = await sync_repository_to_vector_store(owner, repo_name)
    print(f"✓ {sync_result}")
    
    return {"iterations": 1}


async def PlanNextObjective(state: DevelopmentState):
    """Use planning agent to decide what to build next."""
    print("\n" + "=" * 60)
    print(f"PLANNING (Iteration {state.get('iterations', 0)})")
    print("=" * 60)
    
    # Get current codebase state from RAG
    current_state = await get_codebase_summary(state.get("namespace"))
    
    # Get completed features list
    completed_features = state.get("completed_features", [])
    completed_features_str = "\n".join(f"- {f}" for f in completed_features) if completed_features else "None yet"
    
    # Run planning agent
    print("🤔 Planning agent deciding next objective...")
    plan_response = await asyncio.to_thread(
        run_planning_agent,
        golden_context=state.get("golden_context"),
        current_state=current_state,
        completed_features=completed_features_str
    )
    
    next_objective = plan_response.next_objective
    reasoning = plan_response.reasoning
    
    print(f"\n📋 Next Objective: {next_objective}")
    print(f"💡 Reasoning: {reasoning}")
    
    return {
        "current_objective": next_objective,
        "attempt": 0,  # Reset attempt counter
        "approved": False,  # Reset approval
        "critique_feedback": ""  # Clear feedback
    }


async def ProcessObjective(state: DevelopmentState):
    """
    Implement the current objective using ReAct loop with self-correction.
    Up to 3 attempts with critic feedback.
    """
    print("\n" + "=" * 60)
    print(f"PROCESSING: {state.get('current_objective')}")
    print("=" * 60)
    
    objective = state.get("current_objective")
    golden_context = state.get("golden_context")
    namespace = state.get("namespace")
    
    # ReAct Loop: 3 attempts
    for attempt in range(1, 4):
        print(f"\n🔄 Attempt {attempt}/3")
        
        # Get relevant context from RAG
        print("  📚 Searching for relevant context...")
        context_results = await asyncio.to_thread(
            search_documents,
            query=objective,
            top_k=10,
            namespace=namespace
        )
        
        relevant_files = "\n\n".join([
            f"// {res.metadata.get('path', 'unknown')}\n{res.data[:500]}"
            for res in context_results[:5]
        ])
        
        # Generate code
        print("  💻 Generating code...")
        code_response = await asyncio.to_thread(
            run_coder_agent_with_assertions,
            objective=objective + (f"\n\nFeedback from previous attempt:\n{state.get('critique_feedback', '')}" if attempt > 1 else ""),
            golden_context=golden_context,
            relevant_files=relevant_files
        )
        
        # file_changes is now guaranteed to be a list[dict] with proper extensions
        files = code_response.file_changes
        commit_message = code_response.commit_message
        
        print(f"  📝 Generated {len(files)} files")
        
        # Critique code
        print("  🔍 Reviewing code...")
        critic_response = await asyncio.to_thread(
            run_critic_agent,
            objective=objective,
            file_changes=files,
            golden_context=golden_context
        )
        
        is_approved = critic_response.is_approved
        score = critic_response.score
        issues = critic_response.issues
        
        if is_approved:
            print(f"  ✅ APPROVED (Score: {score}/10)")
            return {
                "approved": True,
                "generated_files": files,
                "commit_message": commit_message,
                "attempt": attempt
            }
        else:
            print(f"  ❌ REJECTED (Score: {score}/10)")
            print(f"  Issues: {issues}")
            
            # Check fallback condition (attempt 3, score >= 6, no critical issues)
            if attempt == 3 and score >= 6 and "critical" not in issues.lower():
                print(f"  ⚠️  FALLBACK APPROVAL (Good enough after 3 attempts)")
                return {
                    "approved": True,
                    "generated_files": files,
                    "commit_message": commit_message,
                    "attempt": attempt
                }
            
            # Continue loop with feedback
            critique_feedback = issues
            if attempt < 3:
                continue
    
    # All attempts exhausted
    print("  ❌ All attempts exhausted, objective failed")
    return {"approved": False, "failed_count": state.get("failed_count", 0) + 1}


async def CommitChanges(state: DevelopmentState):
    """Commit approved changes to repository."""
    print("\n" + "=" * 60)
    print("COMMITTING CHANGES")
    print("=" * 60)
    
    owner = state.get("owner")
    repo_name = state.get("repo_name")
    files = state.get("generated_files", [])
    commit_message = state.get("commit_message")
    
    print(f"📤 Committing {len(files)} files...")
    print(f"💬 Message: {commit_message}")
    
    try:
        commit_url = await push_files(
            owner=owner,
            repo_name=repo_name,
            files=files,
            commit_message=commit_message
        )
        print(f"✅ Committed: {commit_url}")
        
        # Update completed features
        completed_features = state.get("completed_features", []) + [state.get("current_objective")]
        
        return {
            "completed_features": completed_features,
            "completed_count": state.get("completed_count", 0) + 1
        }
    except Exception as e:
        print(f"❌ Commit failed: {e}")
        return {"failed_count": state.get("failed_count", 0) + 1}


async def SyncChangedFiles(state: DevelopmentState):
    """Incrementally sync only the changed files to vector store."""
    print("\n" + "=" * 60)
    print("SYNCING CHANGED FILES TO VECTOR STORE")
    print("=" * 60)
    
    namespace = state.get("namespace")
    files = state.get("generated_files", [])
    
    chunk_count = 0
    for file in files:
        path = file["path"]
        content = file["content"]
        
        # Chunk the file
        chunks = chunk_text(content)
        
        # Upsert each chunk
        for i, chunk in enumerate(chunks):
            chunk_id = f"{path}-chunk-{i}"
            metadata = {
                "repository": f"{state.get('owner')}/{state.get('repo_name')}",
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
    
    print(f"✅ Synced {len(files)} files ({chunk_count} chunks)")
    return {}


async def ReflectOnProgress(state: DevelopmentState):
    """Assess progress and determine if project is complete."""
    print("\n" + "=" * 60)
    print("REFLECTING ON PROGRESS")
    print("=" * 60)
    
    # Get current codebase summary
    current_codebase = await get_codebase_summary(state.get("namespace"), top_k=30)
    
    # Get completed features
    completed_features = state.get("completed_features", [])
    completed_features_str = "\n".join(f"- {f}" for f in completed_features)
    
    # Run reflection agent
    print("🤔 Reflection agent assessing progress...")
    reflection_response = await asyncio.to_thread(
        run_reflection_agent,
        golden_context=state.get("golden_context"),
        completed_features=completed_features_str,
        current_codebase=current_codebase
    )
    
    is_complete = reflection_response.is_complete
    progress = reflection_response.progress_percentage
    next_priority = reflection_response.next_priority
    
    print(f"\n📊 Progress: {progress}%")
    print(f"✅ Complete: {is_complete}")
    if not is_complete:
        print(f"🎯 Next Priority: {next_priority}")
    
    # Increment iterations
    new_iterations = state.get("iterations", 0) + 1
    
    return {
        "iterations": new_iterations,
        "current_objective": ""  # Clear for next planning
    }


def should_continue(state: DevelopmentState) -> str:
    """Decide whether to continue development or end."""
    # Check max iterations (safety)
    if state.get("iterations", 0) >= state.get("max_iterations", 10):
        print(f"\n⚠️  Max iterations ({state.get('max_iterations', 10)}) reached. Stopping.")
        return "end"
    
    # Check if we have a current objective that failed
    if not state.get("approved", False) and state.get("current_objective"):
        print(f"\n⚠️  Objective failed. Moving to next.")
        return "plan"
    
    # Check if we just completed an objective
    if state.get("approved", False):
        return "commit"
    
    # Otherwise, continue planning
    return "plan"


def check_completion(state: DevelopmentState) -> str:
    """Check if project is complete after reflection."""
    # This would ideally check the reflection agent's output
    # For now, we'll use iterations as a proxy
    # In a real implementation, you'd check reflection_response.is_complete
    
    if state.get("iterations", 0) >= state.get("max_iterations", 10):
        return "end"
    
    return "plan"


# ============================================================================
# GRAPH CONSTRUCTION
# ============================================================================

graph = StateGraph(DevelopmentState)

# Add nodes
graph.add_node("InitializeFromRepository", InitializeFromRepository)
graph.add_node("SyncRepository", SyncRepository)
graph.add_node("PlanNextObjective", PlanNextObjective)
graph.add_node("ProcessObjective", ProcessObjective)
graph.add_node("CommitChanges", CommitChanges)
graph.add_node("SyncChangedFiles", SyncChangedFiles)
graph.add_node("ReflectOnProgress", ReflectOnProgress)

# Define edges
graph.add_edge(START, "InitializeFromRepository")
graph.add_edge("InitializeFromRepository", "SyncRepository")
graph.add_edge("SyncRepository", "PlanNextObjective")
graph.add_edge("PlanNextObjective", "ProcessObjective")

# Conditional after ProcessObjective
graph.add_conditional_edges(
    "ProcessObjective",
    should_continue,
    {
        "commit": "CommitChanges",
        "plan": "PlanNextObjective",
        "end": END
    }
)

graph.add_edge("CommitChanges", "SyncChangedFiles")
graph.add_edge("SyncChangedFiles", "ReflectOnProgress")

# Conditional after Reflection
graph.add_conditional_edges(
    "ReflectOnProgress",
    check_completion,
    {
        "plan": "PlanNextObjective",
        "end": END
    }
)

# Compile
development_graph = graph.compile()
