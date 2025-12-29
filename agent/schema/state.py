from typing import Annotated, List, Optional
from langgraph.graph.message import add_messages
from copilotkit import CopilotKitState
from pydantic import Field


class InitializeProjectState(CopilotKitState):
    """The state for the initialize project graph."""
    
    repository_name: str = Field(default="", validation_alias="repository_name")
    repository_description: str = Field(default="", validation_alias="repository_description")
    initial_prompt: str = Field(default="", validation_alias="initial_prompt")
    
    # Generated Documents
    generated_docs: List[dict] = Field(default=[], validation_alias="generated_docs")


class DevelopmentState(CopilotKitState):
    """State for the autonomous development workflow graph."""
    
    # Repository info
    repository_name: str = Field(default="", validation_alias="repository_name")
    owner: str = Field(default="", validation_alias="owner")
    repo_name: str = Field(default="", validation_alias="repo_name")
    namespace: str = Field(default="", validation_alias="namespace")  # owner-repo
    
    # Golden Context (from initialization)
    golden_context: str = Field(default="", validation_alias="golden_context")
    
    # Dynamic Planning
    current_objective: str = Field(default="", validation_alias="current_objective")
    completed_features: List[str] = Field(default=[], validation_alias="completed_features")
    
    # ReAct Loop State (per objective)
    attempt: int = Field(default=0, validation_alias="attempt")
    generated_files: List[dict] = Field(default=[], validation_alias="generated_files")
    commit_message: str = Field(default="", validation_alias="commit_message")
    critique_feedback: str = Field(default="", validation_alias="critique_feedback")
    approved: bool = Field(default=False, validation_alias="approved")
    
    # Metrics
    iterations: int = Field(default=0, validation_alias="iterations")
    max_iterations: int = Field(default=10, validation_alias="max_iterations")  # Safety limit
    completed_count: int = Field(default=0, validation_alias="completed_count")
    failed_count: int = Field(default=0, validation_alias="failed_count")
