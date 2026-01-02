"""
MCP Tools - DSPy-compatible tools for MCP server integration.

This module provides DSPy-compatible wrapper functions for accessing MCP tools,
particularly the context7 MCP server for library documentation.
"""

import json
import asyncio
import threading
from typing import Dict, Any, Optional
from utils.mcp_manager import mcp_manager


def _run_async_tool(coro):
    """
    Helper to run an async tool call from either sync or async context,
    even if running in a background thread.
    """
    if mcp_manager.loop is None:
        raise RuntimeError("MCP system loop not initialized")

    # If we are in a different thread than the MCP loop, use run_coroutine_threadsafe
    try:
        current_loop = asyncio.get_running_loop()
        if current_loop is mcp_manager.loop:
            # We are in the same loop, but we are a sync function, so we can't await.
            # This shouldn't normally happen if we're called via to_thread.
            pass
    except RuntimeError:
        # No loop in this thread, correct for to_thread threads
        pass

    # Schedule the coroutine on the main loop and wait for result
    future = asyncio.run_coroutine_threadsafe(coro, mcp_manager.loop)
    return future.result()


def resolve_library_id_tool(library_name: str) -> str:
    """
    DSPy Tool: Resolve a library/package name to a Context7-compatible library ID.
    
    This tool searches for a library and returns a Context7-compatible ID that
    can be used to fetch documentation.
    
    Args:
        library_name: The name of the library/package to search for
                      (e.g., "react", "next.js", "python-requests")
    
    Returns:
        JSON string with the resolved library ID and metadata
        
    Example:
        Input: "react"
        Output: {
            "library_id": "/facebook/react",
            "name": "React",
            "description": "A JavaScript library for building user interfaces",
            "selected_reason": "Most relevant match based on name similarity"
        }
    """
    try:
        async def _resolve():
            tool = await mcp_manager.get_server_tool("resolve-library-id")
            if tool is None:
                return {
                    "error": "resolve-library-id tool not found",
                    "message": "Context7 MCP server may not be connected"
                }
            
            return await tool.acall(libraryName=library_name)
        
        result = _run_async_tool(_resolve())
        return json.dumps(result, indent=2)
        
    except Exception as e:
        return json.dumps({
            "error": str(e),
            "message": f"Failed to resolve library ID for '{library_name}'"
        }, indent=2)


def get_library_docs_tool(
    context7_library_id: str,
    topic: str = "",
    mode: str = "code",
    page: int = 1
) -> str:
    """
    DSPy Tool: Fetch up-to-date documentation for a library.
    
    This tool retrieves documentation for a specific library using its
    Context7-compatible ID. Use 'code' mode for API references and code examples,
    or 'info' mode for conceptual guides and architectural information.
    
    Args:
        context7_library_id: Exact Context7-compatible library ID
                             (e.g., '/facebook/react', '/vercel/next.js')
                             Must be obtained from resolve_library_id_tool first
        topic: Topic to focus documentation on (e.g., 'hooks', 'routing', 'authentication')
               Leave empty for general documentation
        mode: Documentation mode:
              - 'code': API references and code examples (default)
              - 'info': Conceptual guides, narrative information, architectural questions
        page: Page number for pagination (start: 1, default: 1)
              Use page=2, page=3, etc. if first page doesn't have enough context
    
    Returns:
        JSON string with documentation content and metadata
        
    Example:
        Input: {
            "context7_library_id": "/facebook/react",
            "topic": "hooks",
            "mode": "code",
            "page": 1
        }
        Output: {
            "library_id": "/facebook/react",
            "topic": "hooks",
            "mode": "code",
            "page": 1,
            "documentation": "React Hooks are functions that let you...",
            "code_examples": ["const [count, setCount] = useState(0);"],
            "metadata": {...}
        }
    """
    try:
        async def _get_docs():
            tool = await mcp_manager.get_server_tool("get-library-docs")
            if tool is None:
                return {
                    "error": "get-library-docs tool not found",
                    "message": "Context7 MCP server may not be connected"
                }
            
            return await tool.acall(
                context7CompatibleLibraryID=context7_library_id,
                mode=mode,
                topic=topic,
                page=page
            )
        
        result = _run_async_tool(_get_docs())
        return json.dumps(result, indent=2)
        
    except Exception as e:
        return json.dumps({
            "error": str(e),
            "message": f"Failed to fetch documentation for '{context7_library_id}'"
        }, indent=2)


def search_library_docs_tool(
    library_name: str,
    topic: str = "",
    mode: str = "code",
    page: int = 1
) -> str:
    """
    DSPy Tool: Search and fetch library documentation in one step.
    
    This is a convenience tool that combines resolve_library_id and get_library_docs
    into a single operation. It first resolves the library ID, then fetches the
    documentation.
    
    Args:
        library_name: The name of the library/package to search for
                      (e.g., "react", "next.js", "python-requests")
        topic: Topic to focus documentation on (e.g., 'hooks', 'routing', 'authentication')
               Leave empty for general documentation
        mode: Documentation mode:
              - 'code': API references and code examples (default)
              - 'info': Conceptual guides, narrative information, architectural questions
        page: Page number for pagination (start: 1, default: 1)
    
    Returns:
        JSON string with resolved library ID and documentation
        
    Example:
        Input: {
            "library_name": "react",
            "topic": "hooks",
            "mode": "code"
        }
        Output: {
            "library_id": "/facebook/react",
            "library_name": "React",
            "topic": "hooks",
            "documentation": "React Hooks are functions that let you...",
            "code_examples": [...]
        }
    """
    try:
        # First resolve the library ID
        resolve_result = json.loads(resolve_library_id_tool(library_name))
        
        if "error" in resolve_result:
            return json.dumps({
                "error": resolve_result["error"],
                "message": f"Failed to resolve library '{library_name}'"
            }, indent=2)
        
        library_id = resolve_result.get("library_id")
        if not library_id:
            return json.dumps({
                "error": "No library ID found",
                "message": f"Could not resolve library ID for '{library_name}'"
            }, indent=2)
        
        # Then fetch the documentation
        docs_result = json.loads(get_library_docs_tool(
            context7_library_id=library_id,
            topic=topic,
            mode=mode,
            page=page
        ))
        
        # Combine results
        combined_result = {
            "library_id": library_id,
            "library_name": resolve_result.get("name", library_name),
            "description": resolve_result.get("description", ""),
            "selected_reason": resolve_result.get("selected_reason", ""),
            "topic": topic,
            "mode": mode,
            "page": page,
            "documentation": docs_result.get("documentation", ""),
            "code_examples": docs_result.get("code_examples", []),
            "metadata": docs_result.get("metadata", {})
        }
        
        return json.dumps(combined_result, indent=2)
        
    except Exception as e:
        return json.dumps({
            "error": str(e),
            "message": f"Failed to search documentation for '{library_name}'"
        }, indent=2)


def get_all_mcp_tools() -> str:
    """
    DSPy Tool: Get a list of all available MCP tools.
    
    This tool returns information about all tools that are available from
    connected MCP servers. This is useful for discovering what tools are
    available for agents to use.
    
    Returns:
        JSON string with list of available tools and their descriptions
        
    Example:
        Output: {
            "tools": [
                {
                    "name": "resolve-library-id",
                    "description": "Resolves a package/product name to a Context7-compatible library ID",
                    "server": "context7"
                },
                {
                    "name": "get-library-docs",
                    "description": "Fetches up-to-date documentation for a library",
                    "server": "context7"
                }
            ],
            "total": 2
        }
    """
    try:
        tools = mcp_manager.get_all_tools()
        
        tools_info = []
        for tool in tools:
            tools_info.append({
                "name": tool.name,
                "description": getattr(tool, 'description', 'No description available'),
                "server": "MCP"
            })
        
        return json.dumps({
            "tools": tools_info,
            "total": len(tools_info)
        }, indent=2)
        
    except Exception as e:
        return json.dumps({
            "error": str(e),
            "message": "Failed to get available MCP tools"
        }, indent=2)


# List of all context7-aware tools for easy import
CONTEXT7_TOOLS = [
    resolve_library_id_tool,
    get_library_docs_tool,
    search_library_docs_tool,
    get_all_mcp_tools
]


def get_context7_tools():
    """
    Get all context7-aware DSPy tools.
    
    Returns:
        List of context7 tool functions that can be passed to DSPy agents
    """
    return CONTEXT7_TOOLS
