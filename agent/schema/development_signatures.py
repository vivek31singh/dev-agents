import dspy

class CoderSignature(dspy.Signature):
    """
    Implement a development task by generating the necessary code changes.
    
    USE AVAILABLE TOOLS:
    - resolve_library_id_tool: Resolve library names to get Context7 IDs
    - get_library_docs_tool: Fetch latest documentation for libraries
    - search_library_docs_tool: Search and fetch docs in one step
    
    Always check latest documentation for libraries/frameworks before generating code.
    """
    objective: str = dspy.InputField(desc="The specific development task to accomplish")
    golden_context: str = dspy.InputField(desc="Overall project context, tech stack, and guidelines")
    relevant_files: str = dspy.InputField(desc="Contents of existing relevant files from RAG")
    
    # Using dspy.Code without language hint - agent infers from golden_context
    # The golden_context includes tech_stack, so the agent knows what language to use
    file_changes: list[dict] = dspy.OutputField(desc="""Generate code changes as a list of file objects. Each file must have:
- path: Full file path with proper extension (.ts, .tsx, .js, .jsx, .py, .css, .json, .md, etc.)
- content: The complete file content

CRITICAL: Always include proper file extensions based on file type and tech stack. Never omit extensions.

EXAMPLES:
- React component: {"path": "src/components/Button.tsx", "content": "export const Button = () => <button>Click</button>;"}
- TypeScript utility: {"path": "src/utils/helpers.ts", "content": "export const formatDate = (date: Date) => date.toISOString();"}
- CSS file: {"path": "src/styles/main.css", "content": ".button { background: blue; }"}
- JSON config: {"path": "src/config/app.json", "content": "{\\"name\\": \\"My App\\"}"}
- Python module: {"path": "src/utils/helpers.py", "content": "def format_date(date): return date.isoformat()"}
- Markdown doc: {"path": "docs/api.md", "content": "# API Documentation"}

Return format: [{"path": "filepath.ext", "content": "file content"}, {"path": "filepath2.ext", "content": "file content 2"}]""")
    commit_message: str = dspy.OutputField(desc="Conventional commit message for these changes")
    
    # Note: Assertions will be added in the agent wrapper, not in signature
    # This keeps the signature clean and allows flexible assertion handling

class CriticSignature(dspy.Signature):
    """
    Review the code changes for correctness, best practices, and alignment with context.
    
    USE AVAILABLE TOOLS:
    - resolve_library_id_tool: Resolve library names to get Context7 IDs
    - get_library_docs_tool: Fetch latest documentation for libraries
    - search_library_docs_tool: Search and fetch docs in one step
    
    Always verify code against latest documentation using these tools before approving.
    """
    goal: str = dspy.InputField(desc="The original task")
    file_changes: str = dspy.InputField(desc="The proposed code changes")
    golden_context: str = dspy.InputField(desc="Project context and guidelines")
    
    # Structured feedback for decision nodes
    score: float = dspy.OutputField(desc="Quality score from 0.0 to 10.0")
    issues: str = dspy.OutputField(desc="List of specific issues found, or 'None' if approved")
    is_approved: bool = dspy.OutputField(desc="True if the code is ready to be committed, False otherwise")
    documentation_references: str = dspy.OutputField(
        desc="Documentation references used during review (library names, topics, and key findings)"
    )
