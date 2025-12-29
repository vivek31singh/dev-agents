from upstash_vector import Index
from utils.settings import settings

def get_vector_index():
    """Initialize and return the Upstash Vector Index client."""
    return Index(
        url=settings.upstash_vector_rest_url,
        token=settings.upstash_vector_rest_token
    )

def upsert_document(doc_id: str, content: str, metadata: dict = None, namespace: str = ""):
    """
    Upsert a document into the specified namespace.
    """
    index = get_vector_index()
    # Using 'data' field for raw text that Upstash will embed
    index.upsert(
        vectors=[
            (doc_id, content, metadata or {})
        ],
        namespace=namespace
    )

def search_documents(query: str, top_k: int = 5, namespace: str = ""):
    """
    Search the vector store for semantic matches within a namespace.
    """
    index = get_vector_index()
    results = index.query(
        data=query, 
        top_k=top_k, 
        include_metadata=True,
        include_data=True,
        namespace=namespace
    )
    return results

def delete_document(doc_id: str, namespace: str = ""):
    """Delete a document by ID."""
    index = get_vector_index()
    index.delete(ids=[doc_id], namespace=namespace)

def delete_namespace(namespace: str):
    """Delete all vectors in a namespace."""
    index = get_vector_index()
    try:
        # Upstash Vector doesn't support delete_all, so we need to query and delete all vectors
        # First, query to get all vectors in the namespace
        results = index.query(
            data="*",  # Query all
            top_k=1000,  # Get up to 1000 vectors
            namespace=namespace,
            include_metadata=False
        )
        
        if results and len(results) > 0:
            # Extract vector IDs and delete them
            vector_ids = [res.id for res in results]
            index.delete(ids=vector_ids, namespace=namespace)
            print(f"Deleted {len(vector_ids)} vectors from namespace {namespace}")
        else:
            print(f"No vectors found in namespace {namespace}")
    except Exception as e:
        print(f"Error deleting namespace {namespace}: {e}")
