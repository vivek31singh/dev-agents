"""
Text chunking utilities for vector store operations.
Splits large files into semantic chunks while preserving context.
"""

def chunk_text(text: str, max_chars: int = 3000) -> list[str]:
    """
    Chunk text into smaller pieces while preserving line boundaries.
    
    Args:
        text: The text content to chunk
        max_chars: Maximum characters per chunk (default: 3000)
    
    Returns:
        List of text chunks
    
    Strategy:
        - Split by lines to preserve code structure
        - Accumulate lines until max_chars is reached
        - Start new chunk when limit is hit
        - Ensures no chunk is empty
    """
    chunks = []
    current_chunk = ""
    
    for line in text.split('\n'):
        # Check if adding this line would exceed the limit
        if current_chunk and len(current_chunk) + len(line) + 1 > max_chars:
            # Save current chunk and start new one
            if current_chunk.strip():
                chunks.append(current_chunk.strip())
            current_chunk = line
        else:
            # Add line to current chunk
            if current_chunk:
                current_chunk += '\n' + line
            else:
                current_chunk = line
    
    # Don't forget the last chunk
    if current_chunk.strip():
        chunks.append(current_chunk.strip())
    
    return chunks


def should_skip_file(file_path: str, content: str, max_file_size: int = 50000) -> bool:
    """
    Determine if a file should be skipped from vector indexing.
    
    Args:
        file_path: Path of the file
        content: File content
        max_file_size: Maximum file size in bytes
    
    Returns:
        True if file should be skipped, False otherwise
    """
    # Skip patterns (case-insensitive)
    skip_patterns = [
        'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', '.lock',
        '.svg', '.png', '.jpg', '.jpeg', '.gif', '.ico', 
        '.woff', '.woff2', '.ttf',
        '.mp4', '.mp3', '.webm', '.pdf', '.zip', '.tar', '.gz',
        'node_modules/', '.next/', 'dist/', '.git/', 
        'tasks.json'  # We don't index tasks.json since we're not using it
    ]
    
    # Check if path matches any skip pattern
    path_lower = file_path.lower()
    if any(pattern.lower() in path_lower for pattern in skip_patterns):
        return True
    
    # Check file size
    if len(content) > max_file_size:
        return True
    
    return False
