"""
MCP Manager - Manages connections to MCP servers and converts tools to DSPy format.

This module provides a centralized way to connect to various MCP servers (including context7)
and convert their tools to DSPy-compatible format for use in agents.
"""

import os
import contextlib
import dspy
import asyncio
from typing import Dict, List, Any, Optional
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from mcp.client.sse import sse_client
from mcp.client.streamable_http import streamablehttp_client


class MCPManager:
    """
    Manages MCP server connections and tool conversion to DSPy format.
    
    This class handles:
    - Connecting to MCP servers (stdio, SSE, HTTP)
    - Converting MCP tools to DSPy tools
    - Managing tool lifecycle
    - Providing tools to agents
    """
    
    def __init__(self):
        self.dspy_tools: List[dspy.Tool] = []
        self.exit_stack = contextlib.AsyncExitStack()
        self.sessions: List[ClientSession] = []
        self._initialized = False
        self.loop: Optional[asyncio.AbstractEventLoop] = None

    async def _add_server_tools(self, session: ClientSession):
        """
        Helper to list tools from a session and convert them to DSPy tools.
        
        Args:
            session: MCP client session
        """
        response = await session.list_tools()
        for tool in response.tools:
            dspy_tool = dspy.Tool.from_mcp_tool(session, tool)
            self.dspy_tools.append(dspy_tool)
            print(f"✅ Added DSPy tool: {tool.name}")
    
    async def get_server_tool(self, tool_name: str) -> Optional[dspy.Tool]:
        """
        Get a specific tool by name.
        
        Args:
            tool_name: Name of the tool to retrieve
            
        Returns:
            The DSPy tool if found, None otherwise
        """
        for tool in self.dspy_tools:
            if tool.name == tool_name:
                return tool
        return None

    async def connect_stdio(
        self, 
        command: str, 
        args: List[str], 
        env: Dict[str, str] = None
    ):
        """
        Connect to an MCP server using stdio.
        
        Args:
            command: Command to execute (e.g., 'npx', 'python')
            args: Arguments to pass to the command
            env: Additional environment variables
        """
        params = StdioServerParameters(
            command=command,
            args=args,
            env={**os.environ, **(env or {})}
        )
        read, write = await self.exit_stack.enter_async_context(stdio_client(params))
        session = await self.exit_stack.enter_async_context(ClientSession(read, write))
        await session.initialize()
        self.sessions.append(session)
        await self._add_server_tools(session)

    async def connect_sse(self, url: str, headers: Dict[str, str] = None):
        """
        Connect to an MCP server using SSE (Server-Sent Events).
        
        Args:
            url: URL of the MCP server
            headers: HTTP headers to include in the request
        """
        # Ensure correct Accept header for SSE
        headers = headers or {}
        if "Accept" not in headers:
            headers["Accept"] = "text/event-stream"
            
        # Note: sse_client returns (read, write, session_id_provider) in latest MCP SDK
        read, write, _ = await self.exit_stack.enter_async_context(
            sse_client(url=url, headers=headers)
        )
        session = await self.exit_stack.enter_async_context(ClientSession(read, write))
        await session.initialize()
        self.sessions.append(session)
        await self._add_server_tools(session)

    async def connect_http(self, url: str, headers: Dict[str, str] = None):
        """
        Connect to an MCP server using HTTP.
        
        Args:
            url: URL of the MCP server
            headers: HTTP headers to include in the request
        """
        # Note: streamablehttp_client returns (read, write, session_id_provider)
        read, write, _ = await self.exit_stack.enter_async_context(
            streamablehttp_client(url=url, headers=headers)
        )
        session = await self.exit_stack.enter_async_context(ClientSession(read, write))
        await session.initialize()
        self.sessions.append(session)
        await self._add_server_tools(session)

    async def close(self):
        """Close all MCP connections and clean up resources."""
        await self.exit_stack.aclose()
        self.sessions.clear()
        self.dspy_tools.clear()
        self._initialized = False
        self.loop = None

    def get_all_tools(self) -> List[dspy.Tool]:
        """
        Get all available DSPy tools from connected MCP servers.
        
        Returns:
            List of all DSPy tools
        """
        return self.dspy_tools

    def is_initialized(self) -> bool:
        """
        Check if the MCP system has been initialized.
        
        Returns:
            True if initialized, False otherwise
        """
        return self._initialized

    def set_initialized(self, initialized: bool):
        """
        Set the initialization status.
        
        Args:
            initialized: Whether the system is initialized
        """
        self._initialized = initialized


# Global MCP manager instance
mcp_manager = MCPManager()


async def init_mcp_system():
    """
    Initializes all MCP servers and populates the dspy_tools list.
    
    This function connects to:
    - Context7 MCP server (stdio) for library documentation
    - Additional MCP servers can be added here as needed
    
    The tools are converted to DSPy format and made available to all agents.
    """
    if mcp_manager.is_initialized():
        print("ℹ️  MCP system already initialized, skipping...")
        return

    mcp_manager.loop = asyncio.get_running_loop()

    print("\n" + "="*60)
    print("🔧 INITIALIZING MCP SYSTEM")
    print("="*60)

    # 1. Context7 (stdio) - Library documentation
    print("\n📚 Connecting to Context7 MCP (stdio)...")
    try:
        await mcp_manager.connect_stdio(
            "npx",
            ["-y", "@upstash/context7-mcp"]
        )
        print("✅ Context7 MCP connected successfully")
    except Exception as e:
        print(f"⚠️  Failed to connect to Context7 (stdio): {e}")
        print("   The system will continue without Context7 tools")

    # 2. Additional MCP servers can be added here
    # Example:
    # print("\n🔍 Connecting to additional MCP server...")
    # try:
    #     await mcp_manager.connect_stdio("command", ["args"])
    # except Exception as e:
    #     print(f"⚠️  Failed to connect to additional MCP server: {e}")

    print(f"\n📊 Total DSPy tools loaded: {len(mcp_manager.get_all_tools())}")
    print("="*60 + "\n")
    
    mcp_manager.set_initialized(True)


async def get_mcp_tools() -> List[dspy.Tool]:
    """
    Get all available MCP tools as DSPy tools.
    
    Returns:
        List of DSPy tools from all connected MCP servers
        
    Raises:
        RuntimeError: If MCP system is not initialized
    """
    if not mcp_manager.is_initialized():
        raise RuntimeError(
            "MCP system not initialized. Call init_mcp_system() first."
        )
    return mcp_manager.get_all_tools()


async def get_mcp_tool(tool_name: str) -> Optional[dspy.Tool]:
    """
    Get a specific MCP tool by name.
    
    Args:
        tool_name: Name of the tool to retrieve
        
    Returns:
        The DSPy tool if found, None otherwise
        
    Raises:
        RuntimeError: If MCP system is not initialized
    """
    if not mcp_manager.is_initialized():
        raise RuntimeError(
            "MCP system not initialized. Call init_mcp_system() first."
        )
    return await mcp_manager.get_server_tool(tool_name)


async def shutdown_mcp_system():
    """
    Shutdown the MCP system and close all connections.
    
    This should be called when shutting down the application to clean up resources.
    """
    print("\n🔧 Shutting down MCP system...")
    await mcp_manager.close()
    print("✅ MCP system shutdown complete")
