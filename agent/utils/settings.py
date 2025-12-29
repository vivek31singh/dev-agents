import os
from pathlib import Path
from typing import Optional
from dotenv import load_dotenv

# Base directory of the agent (where pyproject.toml is)
AGENT_DIR = Path(__file__).resolve().parent.parent
# Root directory of the project (where .env is)
ROOT_DIR = AGENT_DIR.parent

# Load .env file explicitly from the root directory
ENV_PATH = ROOT_DIR / ".env"
if ENV_PATH.exists():
    load_dotenv(dotenv_path=ENV_PATH)

def get_required_env(name: str) -> str:
    """Read an environment variable or raise an error if not found."""
    value = os.environ.get(name)
    if not value:
        raise ValueError(f"CRITICAL ERROR: Missing required environment variable '{name}'. "
                         f"Please check your .env file at {ENV_PATH}")
    return value

class Settings:
    """
    Centralized settings that reads from os.environ and validates requirements.
    No default values are provided; everything must be in the environment.
    """
    def __init__(self):
        # Primary Language Model Configuration (e.g., DSPy/Zhipu/OpenAI)
        self.lm_api_key = get_required_env("LM_API_KEY")
        self.lm_model = get_required_env("LM_MODEL")
        self.lm_api_base = get_required_env("LM_API_BASE")


        # LangSmith
        self.langsmith_api_key = get_required_env("LANGSMITH_API_KEY")

        # App
        self.debug = get_required_env("DEBUG").lower() == "true"
        self.github_token = get_required_env("GITHUB_TOKEN")
        
        # Upstash Vector
        self.upstash_vector_rest_url = get_required_env("UPSTASH_VECTOR_URL")
        self.upstash_vector_rest_token = get_required_env("UPSTASH_VECTOR_TOKEN")

# Singleton instance
try:
    settings = Settings()
except ValueError as e:
    # Print clear error if settings fail to initialize
    print(f"\n[Settings Error] {e}\n")
    raise
