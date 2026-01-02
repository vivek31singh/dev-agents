"""
Autonomous Development Workflow Graph

This graph implements a RAG-driven, self-directed development process:
1. Initializes MCP system (context7 for latest documentation)
2. Syncs repository to vector store
3. Plans next objective based on golden context
4. Implements objective using ReAct pattern with self-correction
5. Commits changes and updates vector store
6. Reflects on progress
7. Repeats until project is complete or max iterations reached
"""

import asyncio
import json
import base64
from langgraph.graph import StateGraph, START, END
from schema.state import DevelopmentState
from utils.git import sync_repository_to_vector_store, push_files, get_github_owner, fetch_golden_context
from utils.vector_store import search_documents, upsert_document
from utils.chunking import chunk_text
from utils.config import dspy_config
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

async def InitializeMCPSystem(state: DevelopmentState):
    """
    Initialize the MCP system (including context7 for latest documentation).
    This should be called before any agents need access to MCP tools.
    """
    print("=" * 60)
    print("INITIALIZING MCP SYSTEM")
    print("=" * 60)
    
    try:
        await dspy_config.init_mcp()
        print("✅ MCP system initialized successfully")
        return {}
    except Exception as e:
        print(f"⚠️  Failed to initialize MCP system: {e}")
        print("   Agents will continue without MCP tools")
        return {}


async def InitializeFromRepository(state: DevelopmentState):
    """
    Initialize the development workflow from just a repository name.
    Fetches golden context from the repo's markdown files.
    """
    print("=" * 60)
    print("INITIALIZING FROM REPOSITORY")
    print("=" * 60)
    
    repository_name = state.get("repository_name")
    
    # Check if repository_name is None or empty
    if repository_name is None or repository_name == "":
        raise ValueError("repository_name is required but was not provided in the state")
    
    # Parse owner/repo
    if "/" in repository_name:
        owner, repo_name = repository_name.split("/", 1)
    else:
        owner = await get_github_owner()
        repo_name = repository_name
    
    namespace = f"{owner}-{repo_name}"
    
    print(f"📦 Repository: {owner}/{repo_name}")
    print(f"🔖 Namespace: {namespace}")
    
    # Fetch golden context from repository using utility
    print("📚 Attempting to fetch golden context from repository...")
    golden_context = await fetch_golden_context(owner, repo_name)
    
    if not golden_context:
        print("⚠️  No golden context found in repository. Agent will attempt to bootstrap context autonomously.")
    else:
        print(f"✅ Loaded context ({len(golden_context)} chars)")
    
    # 2. Check for existing progress/checkpoints
    print("🏁 Checking for existing progress...")
    completed_features = []
    try:
        url = f"https://api.github.com/repos/{owner}/{repo_name}/contents/.agent/progress.json"
        response = await client.get(url, headers=headers)
        if response.status_code == 200:
            import base64
            import json
            content_b64 = response.json()["content"]
            progress_data = json.loads(base64.b64decode(content_b64).decode("utf-8"))
            completed_features = progress_data.get("completed_features", [])
            print(f"  ✓ Found existing progress: {len(completed_features)} features completed")
    except Exception as e:
        print(f"  ⚠️  Failed to load progress: {e}")

    print(f"✅ Loaded context ({len(golden_context)} chars)")
    
    return {
        "owner": owner,
        "repo_name": repo_name,
        "namespace": namespace,
        "golden_context": golden_context,
        "completed_features": completed_features
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
    
    owner = state.get("owner")
    repo_name = state.get("repo_name")
    golden_context = state.get("golden_context")
    
    # Re-fetch context if missing (Autonomous safety & Bootstrapping)
    if not golden_context:
        print("🔗 Context missing from state, checking repository...")
        golden_context = await fetch_golden_context(owner, repo_name)
        
    # Check if we are in bootstrapping mode (no context at all)
    is_bootstrapping = not golden_context
    if is_bootstrapping:
        print("🚀 BOOTSTRAP MODE: No project documentation found. Planning initialization task.")
        
    # Get current codebase state from RAG
    current_state = await get_codebase_summary(state.get("namespace"))
    
    # Get completed features list
    completed_features = state.get("completed_features", [])
    
    # Filter out failed objectives for display
    successful_features = [f for f in completed_features if not f.startswith("[FAILED]")]
    failed_features = [f for f in completed_features if f.startswith("[FAILED]")]
    
    completed_features_str = "\n".join(f"- {f}" for f in successful_features) if successful_features else "None yet"
    failed_features_str = "\n".join(f"- {f}" for f in failed_features) if failed_features else ""
    
    if failed_features_str:
        print(f"⚠️  Previously failed objectives:\n{failed_features_str}")
    
    # If bootstrapping, we provide a modified prompt to the planning agent
    print(f"🤔 Planning agent deciding next objective...")
    
    context_for_agent = golden_context
    if is_bootstrapping:
        context_for_agent = "SYSTEM: The repository is EMPTY or missing documentation. The first goal MUST be to generate a project_brief.md, technical_spec.md, and implementation_plan.md based on the user's requirements."

    plan_response = await asyncio.to_thread(
        run_planning_agent,
        golden_context=context_for_agent,
        current_state=current_state,
        completed_features=completed_features_str,
        user_feedback=state.get("user_feedback", "")
    )
    
    next_objective = plan_response.next_objective
    reasoning = plan_response.reasoning
    
    # Check if this objective was previously failed
    if any(next_objective in failed for failed in failed_features):
        print(f"\n⚠️  WARNING: This objective was previously failed!")
        print("  Planning agent should avoid repeating failed objectives.")
        # You might want to add logic here to request a different objective
    
    print(f"\n📋 Next Objective: {next_objective}")
    print(f"💡 Reasoning: {reasoning}")
    
    return {
        "golden_context": golden_context, # Update in state if we re-fetched
        "current_objective": next_objective,
        "attempt": 0,  # Reset attempt counter
        "approved": False,  # Reset approval
        "critique_feedback": "",  # Clear feedback
        "user_feedback": ""  # Clear after use
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
    
    # Add the failed objective to completed_features to prevent retry
    completed_features = state.get("completed_features", [])
    failed_objective = f"[FAILED] {objective}"
    
    return {
        "approved": False,
        "failed_count": state.get("failed_count", 0) + 1,
        "completed_features": completed_features + [failed_objective]
    }


async def CommitChanges(state: DevelopmentState):
    """Commit approved changes to repository."""
    print("\n" + "=" * 60)
    print("COMMITTING CHANGES")
    print("=" * 60)
    
    owner = state.get("owner")
    repo_name = state.get("repo_name")
    files = state.get("generated_files", [])
    commit_message = state.get("commit_message")
    
    # Update completed features list
    completed_features = state.get("completed_features", []) + [state.get("current_objective")]
    
    # Create/Update .agent/progress.json checkpoint
    import json
    progress_file = {
        "path": ".agent/progress.json",
        "content": json.dumps({
            "repository": f"{owner}/{repo_name}",
            "completed_features": completed_features,
            "last_commit": commit_message
        }, indent=2)
    }
    
    # Add progress file to the commit
    files_to_push = files + [progress_file]
    
    try:
        commit_url = await push_files(
            owner=owner,
            repo_name=repo_name,
            files=files_to_push,
            commit_message=commit_message
        )
        print(f"✅ Committed: {commit_url}")
        
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
        # Track consecutive failures for the same objective
        failed_count = state.get("failed_count", 0)
        if failed_count >= 3:  # Skip objective after 3 failed attempts
            print(f"\n⚠️  Objective failed {failed_count} times. Skipping and moving to next.")
            # Add to completed_features with a failure marker
            completed_features = state.get("completed_features", [])
            failed_objective = f"[FAILED] {state.get('current_objective')}"
            # Update state directly instead of returning a dict
            state["completed_features"] = completed_features + [failed_objective]
            return "plan"
        print(f"\n⚠️  Objective failed (attempt {failed_count + 1}). Moving to next.")
        return "plan"
    
    # Check if we just completed an objective
    if state.get("approved", False):
        return "commit"
    
    # Otherwise, continue planning
    return "plan"


def check_completion(state: DevelopmentState) -> str:
    """Check if project is complete after reflection."""
    # Check max iterations first
    if state.get("iterations", 0) >= state.get("max_iterations", 10):
        return "end"
    
    # Check if we've reached the commit limit for this run
    if state.get("completed_count", 0) >= state.get("max_commits", 3):
        print(f"\n✅ Max commits ({state.get('max_commits', 3)}) reached for this run. Stopping for review.")
        return "end"
    
    # Check if we've exceeded failure threshold
    if state.get("failed_count", 0) >= 5:  # Stop after 5 failed objectives
        print(f"\n⚠️  Too many failures ({state.get('failed_count', 0)}). Stopping to prevent infinite loop.")
        return "end"
    
    # Continue planning
    return "plan"


# ============================================================================
# GRAPH CONSTRUCTION
# ============================================================================

graph = StateGraph(DevelopmentState)

# Add nodes
graph.add_node("InitializeMCPSystem", InitializeMCPSystem)
graph.add_node("InitializeFromRepository", InitializeFromRepository)
graph.add_node("SyncRepository", SyncRepository)
graph.add_node("PlanNextObjective", PlanNextObjective)
graph.add_node("ProcessObjective", ProcessObjective)
graph.add_node("CommitChanges", CommitChanges)
graph.add_node("SyncChangedFiles", SyncChangedFiles)
graph.add_node("ReflectOnProgress", ReflectOnProgress)

# Define edges
graph.add_edge(START, "InitializeMCPSystem")
graph.add_edge("InitializeMCPSystem", "InitializeFromRepository")
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

# Compile the graph with interrupts for human-in-the-loop
# This allows the user to review commits and provide feedback before the next objective
development_graph = graph.compile(interrupt_after=["CommitChanges"])
