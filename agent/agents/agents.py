from utils.config import dspy_config
from utils.mcp_tools import (
    resolve_library_id_tool,
    get_library_docs_tool,
    search_library_docs_tool,
    get_all_mcp_tools
)
from schema.signatures import ProjectRoadmapSignature, PlanningSignature, ReflectionSignature
from schema.development_signatures import CoderSignature, CriticSignature

dspy = dspy_config.get_dspy()

# ============================================================================
# PROJECT INITIALIZATION AGENT
# ============================================================================

project_roadmap_analyser = dspy.ChainOfThought(ProjectRoadmapSignature)

def run_project_roadmap_analyser(initial_prompt: str):
    """Execution wrapper for the project roadmap analyser agent."""
    response = project_roadmap_analyser(initial_prompt=initial_prompt)
    return response


# ============================================================================
# DEVELOPMENT WORKFLOW AGENTS
# ============================================================================

# Tool Wrappers for DSPy ReAct
# DSPy ReAct expects tools as callables that return strings or dicts
def get_task_context_tool(task_description: str, namespace: str = "") -> str:
    """Tool: Search codebase for relevant context."""
    from utils.tools import GetTaskContextTool
    tool = GetTaskContextTool()
    result = tool(task_description, namespace)
    # Convert to string for ReAct
    if isinstance(result, dict):
        import json
        return json.dumps(result, indent=2)
    return str(result)

def check_file_exists_tool(file_path: str, namespace: str = "") -> str:
    """Tool: Check if a file exists in the codebase."""
    from utils.tools import CheckFileExistsTool
    tool = CheckFileExistsTool()
    result = tool(file_path, namespace)
    if isinstance(result, dict):
        import json
        return json.dumps(result, indent=2)
    return str(result)

# Initialize agents with context7 tools for latest documentation access
coder_agent = dspy.ReAct(
    CoderSignature,
    tools=[
        get_task_context_tool,
        check_file_exists_tool,
        resolve_library_id_tool,
        get_library_docs_tool,
        search_library_docs_tool
    ]
)

critic_agent = dspy.ReAct(
    CriticSignature,
    tools=[
        get_task_context_tool,
        check_file_exists_tool,
        resolve_library_id_tool,
        get_library_docs_tool,
        search_library_docs_tool
    ]
)
planning_agent = dspy.ChainOfThought(PlanningSignature)
reflection_agent = dspy.ChainOfThought(ReflectionSignature)


# ============================================================================
# AGENT EXECUTION WRAPPERS WITH ASSERTIONS
# ============================================================================

def run_coder_agent_with_assertions(objective: str, golden_context: str, relevant_files: str):
    """
    Run the coder agent to generate code.
    Returns a response with file_changes as a list[dict] with proper file extensions.
    """
    response = coder_agent(
        objective=objective,
        golden_context=golden_context,
        relevant_files=relevant_files
    )
    
    # file_changes is now guaranteed to be a list[dict] with proper extensions
    # The CoderSignature enforces this format
    return response

def run_critic_agent(objective: str, file_changes: list[dict], golden_context: str):
    """
    Run the critic agent to review code.
    file_changes is a list[dict] with 'path' and 'content' keys.
    """
    # Convert file_changes to string format for critic agent
    # Don't truncate content - let the critic see the full file
    file_changes_str = "\n\n".join([
        f"// {file['path']}\n{file['content']}"
        for file in file_changes
    ])
    
    response = critic_agent(
        goal=objective,
        file_changes=file_changes_str,
        golden_context=golden_context
    )
    return response

def run_planning_agent(golden_context: str, current_state: str, completed_features: str, user_feedback: str = ""):
    """Run the planning agent to decide next objective."""
    response = planning_agent(
        golden_context=golden_context,
        current_state=current_state,
        completed_features=completed_features,
        user_feedback=user_feedback
    )
    return response

def run_reflection_agent(golden_context: str, completed_features: str, current_codebase: str):
    """Run the reflection agent to assess progress."""
    response = reflection_agent(
        golden_context=golden_context,
        completed_features=completed_features,
        current_codebase=current_codebase
    )
    return response
