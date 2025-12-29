import asyncio
from langgraph.graph import StateGraph, START, END
from schema.state import InitializeProjectState
from utils.git import repositoryExists, createRepository, push_files, get_github_owner
from agents.agents import run_project_roadmap_analyser



async def CheckRepoExists (state: InitializeProjectState):
    print("=====================Checking if repo exists=====================")
    
    repository_name = state.get("repository_name")
    
    # We need to get the owner to check existence correctly if repo_name doesn't include it
    if "/" in repository_name:
        full_repo_name = repository_name
    else:
        repo_owner = await get_github_owner()
        full_repo_name = f"{repo_owner}/{repository_name}"
    
    repo_exists = await repositoryExists(full_repo_name)
    if repo_exists:
        print("Repository already exists")
        raise Exception(f"Repository {full_repo_name} already exists")
    else:
        print("Repository does not exist")
        return {"repo_checked": True}
    
    print("=====================Repo exists check completed=====================")



async def GenerateProjectRoadmap (state: InitializeProjectState):
    print("=====================Generating project roadmap=====================")
    
    initial_prompt = state.get("initial_prompt")
            
    print("Initial prompt: ", initial_prompt)
    
    roadmap_response = await asyncio.to_thread(run_project_roadmap_analyser, initial_prompt)

    def get_val(key, default="Not specified"):
        return getattr(roadmap_response, key, default) or default

    # 1. Project Brief
    project_brief_content = f"""# Project Brief: {state.get('project_name')}

## Project Type
{get_val('project_type')}

## Project Goals (Golden Context)
{get_val('project_goals')}

## Complexity
{get_val('project_complexity')}

## Tech Stack
{get_val('tech_stack')}
"""

    # 2. Technical Specification
    tech_spec_content = f"""# Technical Specification

## Architecture Patterns
{get_val('architecture_patterns')}

## Component Hierarchy
{get_val('component_hierarchy')}

## Data Models
{get_val('data_models')}

## API Design
{get_val('api_design')}
"""

    # 3. Implementation Plan
    impl_plan_content = f"""# Implementation Plan

## Core Features
{get_val('core_features')}

## User Stories
{get_val('user_stories')}

## Acceptance Criteria
{get_val('acceptance_criteria')}

## Implementation Steps
{get_val('implementation_plan')}
"""

    # 4. Coding Guidelines
    guidelines_content = f"""# Development Guidelines

## File Structure
{get_val('file_structure')}

## Naming Conventions
{get_val('naming_conventions')}

## Coding Standards
{get_val('coding_standards')}

## Testing Strategy
{get_val('testing_strategy')}

## Error Handling
{get_val('error_handling_patterns')}

## Dependencies
{get_val('required_dependencies')}

## Configuration
{get_val('configuration_files')}
"""

    generated_docs = [
        {"file_name": "project_brief.md", "content": project_brief_content},
        {"file_name": "technical_spec.md", "content": tech_spec_content},
        {"file_name": "implementation_plan.md", "content": impl_plan_content},
        {"file_name": "coding_guidelines.md", "content": guidelines_content}
    ]
    
    return {"generated_docs": generated_docs}

    print("=====================Project roadmap generation completed=====================")


async def InitializeRepository(state: InitializeProjectState):
    print("=====================Initializing Repository=====================")
    
    repository_name_input = state.get("repository_name")
    repository_description = state.get("repository_description")
    generated_docs = state.get("generated_docs")
    
    # Handle 'owner/repo' format
    if "/" in repository_name_input:
        owner, real_repo_name = repository_name_input.split("/")[:2]
    else:
        owner = await get_github_owner()
        real_repo_name = repository_name_input
        
    project_name = state.get("project_name", real_repo_name)
    
    # 1. Create Repository
    print(f"Creating repository: {real_repo_name}")

    repo_url = await createRepository(real_repo_name, repository_description)
    print(f"Repository created at: {repo_url}")
    
    # 2. Prepare README.md
    readme_content = f"""# {project_name}

**Automated project built via Dev Agents.**

This repository was initialized automatically.

## Context Files
The following documentation files contain the Golden Context for this project:
- project_brief.md
- technical_spec.md
- implementation_plan.md
- coding_guidelines.md

Please refer to them for details.
"""
    generated_docs.append({"file_name": "README.md", "content": readme_content})
    
    # 3. Push Files
    print("Pushing files...")
    
    commit_url = await push_files(
        owner=owner, 
        repo_name=real_repo_name, 
        files=generated_docs, 
        commit_message="feat: Initial commit with Golden Context"
    )
    
    print(f"Files pushed successfully. Commit URL: {commit_url}")
    return {"github_url": repo_url}


graph = StateGraph(InitializeProjectState)

graph.add_node("CheckRepoExists", CheckRepoExists)
graph.add_node("GenerateProjectRoadmap", GenerateProjectRoadmap)
graph.add_node("InitializeRepository", InitializeRepository)

graph.add_edge(START, "CheckRepoExists")
graph.add_edge("CheckRepoExists", "GenerateProjectRoadmap")
graph.add_edge("GenerateProjectRoadmap", "InitializeRepository")
graph.add_edge("InitializeRepository", END)

initialize_project_graph = graph.compile()