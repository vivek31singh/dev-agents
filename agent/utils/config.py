import dspy
import asyncio
from .settings import settings
from .mcp_manager import init_mcp_system

class DSPyConfig:
    def __init__(self):
        # Configuration is now centrally managed in settings.py with standardized names
        model_name = settings.lm_model
        api_key = settings.lm_api_key
        api_base = settings.lm_api_base

        if not api_key:
            print("Warning: LM_API_KEY not found in settings/environment.")

        self.lm = dspy.LM(
            model_name,
            api_key=api_key,
            api_base=api_base,
        )
        
        dspy.configure(lm=self.lm)
        self.dspy = dspy
        self._mcp_initialized = False

    def get_dspy(self):
        return self.dspy
    
    async def init_mcp(self):
        """
        Initialize the MCP system (including context7).
        This should be called before agents need access to MCP tools.
        
        Example:
            await dspy_config.init_mcp()
        """
        if not self._mcp_initialized:
            await init_mcp_system()
            self._mcp_initialized = True
        else:
            print("ℹ️  MCP already initialized, skipping...")
    
    def is_mcp_initialized(self):
        """
        Check if MCP system has been initialized.
        
        Returns:
            True if MCP is initialized, False otherwise
        """
        return self._mcp_initialized

# Singleton instance
dspy_config = DSPyConfig()
