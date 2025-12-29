import re
import dspy
from agents.agents import coder_agent
from utils.vector_store import search_documents

class GetTaskContextTool(dspy.Tool):
    """
    Get comprehensive task context for a development task.
    
    This tool searches for relevant code AND analyzes project patterns to provide:
    - Existing implementations of similar features
    - Project-specific conventions (naming patterns, file structure)
    - Architecture patterns and coding standards
    """
    def __init__(self):
        super().__init__()
        self.name = "get_task_context"
        
    def __call__(self, task_description: str, namespace: str = ""):
        """
        Input:
            task_description: Description of the development task or feature to implement
            namespace: Optional namespace to search within (e.g. 'owner-repo')
        """
        try:
            results = search_documents(query=task_description, top_k=10, namespace=namespace)
            
            # Extract content and paths
            relevant_files = []
            all_content = []
            all_paths = []
            
            for res in results:
                content = res.data or ""
                path = res.metadata.get("path") or res.metadata.get("filePath") or "unknown"
                
                # Check file existence if possible (in vector store metadata) or basic filter
                relevant_files.append({
                    "filePath": path,
                    "content": content[:3000], # Truncate large files
                    "relevanceScore": res.score
                })
                all_content.append(content)
                all_paths.append(path)
            
            # Analyze patterns
            all_content_str = "\n".join(all_content)
            all_paths_str = "\n".join(all_paths)
            
            patterns = {
                "hasTypeScript": ".ts" in all_paths_str or ".tsx" in all_paths_str,
                "hasTailwind": "className=" in all_content_str or "tailwind" in all_content_str,
                "hasAppRouter": "/app/" in all_paths_str or "'use client'" in all_content_str,
                "componentNaming": self.detect_naming_convention(all_paths_str)
            }
            
            return {
                "relevantFiles": relevant_files,
                "projectPatterns": patterns
            }
            
        except Exception as e:
            return f"Error gathering context: {str(e)}"

    def detect_naming_convention(self, paths: str) -> str:
        if re.search(r'[A-Z][a-z]+[A-Z]', paths):
            return 'PascalCase'
        if re.search(r'[a-z]+-[a-z]+', paths):
            return 'kebab-case'
        return "unknown"


class CheckFileExistsTool(dspy.Tool):
    """
    Check if a specific file exists in the codebase.
    Useful for verifying imports and preventing duplicates.
    """
    def __init__(self):
        super().__init__()
        self.name = "check_file_exists"

    def __call__(self, file_path: str, namespace: str = ""):
        """
        Input:
            file_path: Path of the file to check
            namespace: Namespace to search
        """
        try:
            # We search for the exact path. Since vector store is semantic, 
            # we check if the top result looks like an exact path match or very close.
            # Ideally, we would list files from git, but vector store is our index.
            # We can use the 'filter' in upsert metadata if upstash supported metadata filtering in query efficiently.
            # Here we just search and check metadata.
            
            results = search_documents(query=file_path, top_k=5, namespace=namespace)
            
            exact_match = False
            possible_files = []
            
            for res in results:
                path = res.metadata.get("path") or res.metadata.get("filePath")
                if path == file_path:
                    exact_match = True
                possible_files.append({"filePath": path, "content": res.data[:200]})
                
            return {
                "fileExists": exact_match,
                "possibleFiles": possible_files if not exact_match else []
            }
            
        except Exception as e:
            return f"Error checking file: {str(e)}"
