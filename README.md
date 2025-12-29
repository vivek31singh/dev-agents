# Dev Agents - Autonomous Development System

An AI-powered autonomous development system that uses LangGraph and DSPy to build complete software projects from natural language descriptions. The system can initialize new projects, generate comprehensive documentation, and autonomously implement features through iterative development cycles.

## 🏗️ Architecture Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Frontend (Next.js)                        │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │         CopilotKit UI Integration                    │  │
│  │  - Project Creation Interface                         │  │
│  │  - Development Progress Tracking                      │  │
│  │  - Real-time Agent Communication                     │  │
│  └────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                            │
                            │ HTTP/WebSocket
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│              Backend (LangGraph API)                         │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │              LangGraph Runtime Engine              │  │
│  │                                                      │  │
│  │  ┌──────────────────────────────────────────────────┐  │  │
│  │  │  Initialize Project Graph                     │  │  │
│  │  │  - Check Repository Exists                    │  │  │
│  │  │  - Generate Project Roadmap                 │  │  │
│  │  │  - Initialize Repository                     │  │  │
│  │  └──────────────────────────────────────────────────┘  │  │
│  │                                                      │  │
│  │  ┌──────────────────────────────────────────────────┐  │  │
│  │  │  Development Graph (Iterative)               │  │  │
│  │  │  - Initialize from Repository                │  │  │
│  │  │  - Sync to Vector Store                     │  │  │
│  │  │  - Plan Next Objective                    │  │  │
│  │  │  - Process Objective (ReAct Loop)          │  │  │
│  │  │  - Commit Changes                         │  │  │
│  │  │  - Sync Changed Files                     │  │  │
│  │  │  - Reflect on Progress                    │  │  │
│  │  └──────────────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │              DSPy Agent System                        │  │
│  │                                                      │  │
│  │  ┌──────────────────────────────────────────────────┐  │  │
│  │  │  Planning Agent                              │  │  │
│  │  │  - Analyzes current state                   │  │  │
│  │  │  - Determines next objective                 │  │  │
│  │  └──────────────────────────────────────────────────┘  │  │
│  │                                                      │  │
│  │  ┌──────────────────────────────────────────────────┐  │  │
│  │  │  Coder Agent (ReAct)                       │  │  │
│  │  │  - Generates code changes                   │  │  │
│  │  │  - Uses tools for context                   │  │  │
│  │  │  - Self-corrects with feedback             │  │  │
│  │  └──────────────────────────────────────────────────┘  │  │
│  │                                                      │  │
│  │  ┌──────────────────────────────────────────────────┐  │  │
│  │  │  Critic Agent                               │  │  │
│  │  │  - Reviews code quality                      │  │  │
│  │  │  - Provides feedback                        │  │  │
│  │  │  - Approves/rejects changes               │  │  │
│  │  └──────────────────────────────────────────────────┘  │  │
│  │                                                      │  │
│  │  ┌──────────────────────────────────────────────────┐  │  │
│  │  │  Reflection Agent                           │  │  │
│  │  │  - Assesses overall progress               │  │  │
│  │  │  - Determines completion                  │  │  │
│  │  └──────────────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │              External Services                          │  │
│  │                                                      │  │
│  │  ┌──────────────────────────────────────────────────┐  │  │
│  │  │  GitHub API                                 │  │  │
│  │  │  - Repository operations                    │  │  │
│  │  │  - File commits                            │  │  │
│  │  └──────────────────────────────────────────────────┘  │  │
│  │                                                      │  │
│  │  ┌──────────────────────────────────────────────────┐  │  │
│  │  │  Upstash Vector Store                       │  │  │
│  │  │  - Semantic search (RAG)                   │  │  │
│  │  │  - Namespace isolation                      │  │  │
│  │  │  - Context retrieval                       │  │  │
│  │  └──────────────────────────────────────────────────┘  │  │
│  │                                                      │  │
│  │  ┌──────────────────────────────────────────────────┐  │  │
│  │  │  OpenAI API                                │  │  │
│  │  │  - LLM inference                          │  │  │
│  │  │  - Code generation                        │  │  │
│  │  └──────────────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## 📁 Project Structure

```
dev-agents-v0.2/
├── agent/                          # Python backend (LangGraph)
│   ├── agents/                     # DSPy agent definitions
│   │   └── agents.py             # Agent execution wrappers
│   ├── graphs/                     # LangGraph workflow definitions
│   │   ├── initialize_project.py   # Project initialization graph
│   │   └── development.py         # Autonomous development graph
│   ├── schema/                     # Pydantic state and signature definitions
│   │   ├── state.py              # Graph state schemas
│   │   ├── signatures.py         # DSPy signatures for agents
│   │   └── development_signatures.py  # Development-specific signatures
│   ├── utils/                      # Utility functions
│   │   ├── config.py             # DSPy configuration
│   │   ├── git.py                # GitHub API operations
│   │   ├── settings.py           # Environment settings
│   │   ├── tools.py             # RAG-based tools
│   │   ├── vector_store.py       # Upstash vector operations
│   │   └── chunking.py          # Text chunking for embeddings
│   ├── langgraph.json             # LangGraph configuration
│   └── pyproject.toml           # Python dependencies
│
├── src/                          # Next.js frontend
│   ├── app/                      # Next.js app directory
│   │   ├── api/                 # API routes
│   │   │   └── copilotkit/     # CopilotKit integration
│   │   ├── create-project/       # Project creation page
│   │   ├── layout.tsx           # Root layout
│   │   └── page.tsx            # Home page
│   ├── components/               # React components
│   └── lib/                     # Utility libraries
│
├── public/                       # Static assets
├── package.json                  # Node.js dependencies
├── tsconfig.json                # TypeScript configuration
└── README.md                    # This file
```

## 🔑 Core Components

### 1. Initialize Project Graph

**Purpose:** Creates a new GitHub repository with comprehensive project documentation.

**Workflow:**
```
CheckRepoExists → GenerateProjectRoadmap → InitializeRepository
```

**Key Functions:**
- `CheckRepoExists`: Validates repository doesn't already exist
- `GenerateProjectRoadmap`: Creates 4 golden context documents:
  - `project_brief.md` - Project goals, complexity, tech stack
  - `technical_spec.md` - Architecture, components, API design
  - `implementation_plan.md` - Features, user stories, acceptance criteria
  - `coding_guidelines.md` - File structure, naming conventions, standards
- `InitializeRepository`: Creates GitHub repo and pushes documentation

**Output:** New GitHub repository with golden context documentation

### 2. Development Graph

**Purpose:** Iteratively implements project features using autonomous development.

**Workflow:**
```
InitializeFromRepository → SyncRepository → PlanNextObjective
                                                          ↓
                                                    ProcessObjective
                                                          ↓
                                               (approved?) → CommitChanges → SyncChangedFiles → ReflectOnProgress
                                                          ↓
                                                    (not approved?)
                                                          ↓
                                                    PlanNextObjective (loop)
```

**Key Functions:**

#### InitializeFromRepository
- Fetches golden context from repository markdown files
- Sets up namespace for vector store isolation
- Loads project documentation for context

#### SyncRepository
- **Cleans up old namespace vectors** to prevent context contamination
- Fetches all files from GitHub repository
- Chunks and embeds files into Upstash Vector Store
- Enables semantic search (RAG) for codebase context

#### PlanNextObjective
- Uses Planning Agent to analyze current state
- Determines next development objective
- Considers completed features and current codebase

#### ProcessObjective (ReAct Loop)
- **3-attempt iteration with self-correction**
- For each attempt:
  1. Retrieves relevant context from vector store (RAG)
  2. Uses Coder Agent to generate code changes
  3. Uses Critic Agent to review code quality
  4. If approved → proceed to commit
  5. If rejected → use feedback and retry
- **Fallback approval** on 3rd attempt if score ≥ 6 and no critical issues

#### CommitChanges
- Pushes approved files to GitHub
- Updates completed features list
- Generates conventional commit messages

#### SyncChangedFiles
- Incrementally syncs only changed files to vector store
- Chunks new files and upserts to namespace
- Maintains up-to-date RAG context

#### ReflectOnProgress
- Uses Reflection Agent to assess overall progress
- Determines if project is complete
- Calculates progress percentage
- Identifies next priority features

### 3. DSPy Agent System

#### Planning Agent
**Signature:** `PlanningSignature`
- Input: `golden_context`, `current_state`, `completed_features`
- Output: `next_objective`, `reasoning`
- Role: Decides what to build next based on project state

#### Coder Agent
**Signature:** `CoderSignature`
- Input: `objective`, `golden_context`, `relevant_files`
- Output: `file_changes` (list[dict]), `commit_message`
- Tools: `get_task_context_tool`, `check_file_exists_tool`
- Role: Generates structured code changes with proper file extensions
- **Critical:** Outputs `list[dict]` format with `path` and `content` keys

#### Critic Agent
**Signature:** `CriticSignature`
- Input: `goal`, `file_changes`, `golden_context`
- Output: `score` (0-10), `issues`, `is_approved`
- Role: Reviews code quality and provides feedback

#### Reflection Agent
**Signature:** `ReflectionSignature`
- Input: `golden_context`, `completed_features`, `current_codebase`
- Output: `is_complete`, `progress_percentage`, `next_priority`
- Role: Assesses overall project completion

### 4. Vector Store & RAG

**Upstash Vector Store** provides semantic search capabilities:

**Functions:**
- `upsert_document()`: Store embedded document chunks
- `search_documents()`: Semantic search for relevant context
- `delete_document()`: Remove specific document
- `delete_namespace()`: **Clean all vectors in namespace** (prevents hallucination)

**Namespace Isolation:**
- Each repository gets unique namespace: `{owner}-{repo_name}`
- Prevents context contamination between projects
- Enables multi-project development

**RAG Workflow:**
1. Query: "project structure files components"
2. Retrieve: Top-k semantically similar chunks
3. Context: Pass retrieved files to Coder Agent
4. Generate: AI generates code with relevant context

### 5. GitHub Integration

**Functions:**
- `repositoryExists()`: Check if repository exists
- `createRepository()`: Create new GitHub repository
- `push_files()`: Commit and push files to repository
- `sync_repository_to_vector_store()`: Fetch and embed all repo files

**Operations:**
- Uses GitHub REST API
- Supports both `owner/repo` and `repo` formats
- Automatic owner detection from GITHUB_TOKEN

## 🔄 Development Workflow

### Phase 1: Project Initialization

```
User Input (Project Description)
         ↓
Initialize Project Graph
         ↓
CheckRepoExists
         ↓
GenerateProjectRoadmap
         ↓
InitializeRepository
         ↓
New GitHub Repo with Golden Context
```

### Phase 2: Autonomous Development

```
For each iteration (max 10):
┌─────────────────────────────────────────┐
│ 1. Sync Repository to Vector Store  │
│    - Clean old namespace vectors      │
│    - Fetch & embed all files        │
└─────────────────────────────────────────┘
                ↓
┌─────────────────────────────────────────┐
│ 2. Plan Next Objective            │
│    - Analyze current state         │
│    - Determine next feature         │
└─────────────────────────────────────────┘
                ↓
┌─────────────────────────────────────────┐
│ 3. Process Objective (ReAct)       │
│    For attempt in 1..3:           │
│      - Retrieve relevant context      │
│      - Generate code changes        │
│      - Review code quality         │
│      - If approved: break         │
│      - Else: retry with feedback  │
└─────────────────────────────────────────┘
                ↓ (if approved)
┌─────────────────────────────────────────┐
│ 4. Commit Changes                 │
│    - Push files to GitHub         │
│    - Update completed features     │
└─────────────────────────────────────────┘
                ↓
┌─────────────────────────────────────────┐
│ 5. Sync Changed Files             │
│    - Embed new files              │
│    - Update vector store          │
└─────────────────────────────────────────┘
                ↓
┌─────────────────────────────────────────┐
│ 6. Reflect on Progress            │
│    - Assess completion            │
│    - Calculate progress %          │
│    - Identify next priority       │
└─────────────────────────────────────────┘
                ↓
         (continue if not complete)
```

## 🔧 Technical Stack

### Backend (Python)
- **LangGraph 1.0.5**: State graph framework for agent workflows
- **DSPy 3.0.4**: Declarative LLM programming with assertions
- **LangChain 1.2.0**: LLM orchestration
- **OpenAI 1.68.2**: LLM inference
- **Upstash Vector 0.6.0**: Semantic search and embeddings
- **FastAPI 0.115.5**: Async web framework
- **Pydantic Settings 2.0.0**: Configuration management

### Frontend (TypeScript/Next.js)
- **Next.js**: React framework with App Router
- **CopilotKit**: AI agent UI integration
- **TypeScript**: Type-safe development

### Infrastructure
- **GitHub API**: Version control and repository operations
- **Upstash Vector**: Vector database for RAG
- **OpenAI API**: LLM inference

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- Python 3.12+
- GitHub Token with repo permissions
- OpenAI API Key
- Upstash Vector credentials

### Installation

1. **Clone repository:**
```bash
git clone <repository-url>
cd dev-agents-v0.2
```

2. **Install frontend dependencies:**
```bash
npm install
```

3. **Install Python dependencies:**
```bash
cd agent
uv sync
```

4. **Configure environment:**
```bash
# Create .env file in agent directory
cat > agent/.env << EOF
OPENAI_API_KEY=your-openai-api-key
GITHUB_TOKEN=your-github-token
UPSTASH_VECTOR_REST_URL=your-upstash-url
UPSTASH_VECTOR_REST_TOKEN=your-upstash-token
EOF
```

5. **Start development servers:**
```bash
# From project root
npm run dev
```

This starts:
- Next.js UI on `http://localhost:3000`
- LangGraph API on `http://127.0.0.1:2024`

## 📝 Usage

### Creating a New Project

1. Navigate to `http://localhost:3000/create-project`
2. Enter project description
3. Click "Initialize Project"
4. System will:
   - Create GitHub repository
   - Generate golden context documentation
   - Initialize development workflow

### Autonomous Development

After initialization, the system will:
1. Analyze project requirements
2. Plan next objective
3. Generate code with proper file extensions
4. Review code quality
5. Commit changes to GitHub
6. Repeat until project complete

## 🔐 Configuration

### Environment Variables

| Variable | Description | Required |
|-----------|-------------|------------|
| `OPENAI_API_KEY` | OpenAI API key for LLM inference | Yes |
| `GITHUB_TOKEN` | GitHub personal access token | Yes |
| `UPSTASH_VECTOR_REST_URL` | Upstash Vector REST URL | Yes |
| `UPSTASH_VECTOR_REST_TOKEN` | Upstash Vector REST token | Yes |

### Graph Configuration

Edit `agent/langgraph.json` to configure:
- Graph names and entry points
- Python version
- Environment file location

## 🐛 Troubleshooting

### Common Issues

**Issue:** "Namespace vector contamination causing hallucinations"
- **Solution:** The system now automatically cleans up old namespace vectors before syncing new repositories. Check logs for "✓ Cleaned up namespace" message.

**Issue:** "File paths without extensions"
- **Solution:** CoderSignature now enforces structured output with concrete examples. Ensure DSPy is properly configured.

**Issue:** "Workflow hanging at SyncRepository"
- **Solution:** Fixed by wrapping `delete_namespace()` in `asyncio.to_thread()`. Verify async operations are properly handled.

**Issue:** "NameError: name 'file_changes' is not defined"
- **Solution:** Fixed variable reference in ProcessObjective. Ensure latest code is deployed.

### Debug Mode

Enable debug logging:
```bash
npm run dev:debug
```

## 📚 Documentation

- [LangGraph Documentation](https://langchain-ai.github.io/langgraph/)
- [DSPy Documentation](https://dspy-docs.vercel.app/)
- [CopilotKit Documentation](https://docs.copilotkit.ai)
- [Upstash Vector Documentation](https://upstash.com/docs/vector)

## 🤝 Contributing

Contributions are welcome! Areas for improvement:
- Additional agent types (testing, deployment, documentation)
- Enhanced RAG strategies
- Support for more Git providers
- Improved error handling and recovery

## 📄 License

MIT License - see LICENSE file for details.

## 🎯 Key Features

✅ **Autonomous Development** - Self-directed iterative development
✅ **RAG-Powered** - Semantic search for relevant context
✅ **Namespace Isolation** - Prevents context contamination
✅ **ReAct Pattern** - Self-correcting code generation
✅ **Quality Gates** - Critic agent ensures code quality
✅ **Structured Output** - Enforces proper file extensions
✅ **Progress Tracking** - Reflection agent assesses completion
✅ **GitHub Integration** - Full repository lifecycle management
