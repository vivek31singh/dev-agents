import dspy

class ProjectRoadmapSignature(dspy.Signature):
    """Generate a comprehensive implementation roadmap and plan for the given project"""

    initial_prompt: str = dspy.InputField(desc="The initial prompt describing the project requirements")
    
    # 1. Project Analysis
    project_type: str = dspy.OutputField(desc="Type of project (e.g., web app, mobile app, API, etc.)")
    project_goals: str = dspy.OutputField(desc="High-level project goals and objectives (Golden Context)")
    tech_stack: str = dspy.OutputField(desc="Recommended technology stack for the project")
    project_complexity: str = dspy.OutputField(desc="Complexity assessment (e.g., simple, moderate, complex) with justification")
    
    # 2. Implementation Plan with Detailed Elements
    implementation_plan: str = dspy.OutputField(desc="Step-by-step implementation plan with clear phases and tasks")
    core_features: str = dspy.OutputField(desc="Detailed breakdown of core features to be implemented")
    user_stories: str = dspy.OutputField(desc="User stories that capture functional requirements from user perspective")
    acceptance_criteria: str = dspy.OutputField(desc="Specific criteria that must be met for each feature/user story")
    
    # 3. Technical Architecture for Golden Context
    architecture_patterns: str = dspy.OutputField(desc="Architecture patterns to be used (e.g., MVC, microservices, etc.)")
    component_hierarchy: str = dspy.OutputField(desc="Hierarchical structure of components and their relationships")
    data_models: str = dspy.OutputField(desc="Data models and schemas required for the project")
    api_design: str = dspy.OutputField(desc="API design specifications including endpoints, request/response formats")
    
    # 4. Project Structure and Organization
    file_structure: str = dspy.OutputField(desc="Recommended project file structure")
    naming_conventions: str = dspy.OutputField(desc="Naming conventions for files, classes, functions, variables, etc.")
    
    # 5. Development Guidelines for Coding Agents
    coding_standards: str = dspy.OutputField(desc="Coding standards and best practices to follow")
    testing_strategy: str = dspy.OutputField(desc="Testing approach including unit, integration, and end-to-end testing")
    error_handling_patterns: str = dspy.OutputField(desc="Standardized error handling patterns and practices")
    
    # 6. Dependencies and Configuration
    required_dependencies: str = dspy.OutputField(desc="List of required dependencies with installation commands")
    configuration_files: str = dspy.OutputField(desc="Configuration files needed and their settings")
    
    # 7. Development Workflow
    development_phases: str = dspy.OutputField(desc="Development phases and their sequence")
    code_organization: str = dspy.OutputField(desc="How code should be organized across modules and packages")
    
    # 8. Timeline and Milestones
    # 8. Timeline and Milestones
    key_milestones: str = dspy.OutputField(desc="Key milestones and deliverables throughout the project")


class PlanningSignature(dspy.Signature):
    """Decide the next feature/component to build based on project goals and current state."""
    
    golden_context: str = dspy.InputField(desc="Project goals, architecture, and technical specifications")
    current_state: str = dspy.InputField(desc="Summary of what's been built so far (from RAG)")
    completed_features: str = dspy.InputField(desc="List of completed work")
    
    next_objective: str = dspy.OutputField(desc="Next logical feature/component to implement")
    reasoning: str = dspy.OutputField(desc="Why this is the right next step")
    dependencies: str = dspy.OutputField(desc="What this depends on (if anything)")
    priority: str = dspy.OutputField(desc="Priority level: critical, high, medium, low")


class ReflectionSignature(dspy.Signature):
    """Assess progress and determine if project goals are complete."""
    
    golden_context: str = dspy.InputField(desc="Original project goals and requirements")
    completed_features: str = dspy.InputField(desc="What's been built so far")
    current_codebase: str = dspy.InputField(desc="Summary of current codebase state from RAG")
    
    progress_percentage: float = dspy.OutputField(desc="Estimated completion percentage (0-100)")
    is_complete: bool = dspy.OutputField(desc="Are all project goals met?")
    next_priority: str = dspy.OutputField(desc="What to focus on next (if not complete)")
    missing_features: str = dspy.OutputField(desc="Features still needed to complete the project")
    quality_assessment: str = dspy.OutputField(desc="Assessment of code quality and architecture")