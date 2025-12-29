"use client";

import { useState } from "react";
import FileExplorer from "../components/FileExplorer";
import { useCopilotAction } from "@copilotkit/react-core";

// Types
interface Project {
  id: string;
  name: string;
  description: string;
  status: "active" | "idle";
  runs: number;
  passed: number;
  failed: number;
  lastRun: string;
  repoUrl?: string;
}

interface Run {
  id: string;
  name: string;
  scenario: string;
  status: "passed" | "failed";
  duration: string;
  timestamp: string;
  criteria: number;
  criteriaTotal: number;
  steps?: ExecutionStep[];
}

interface ExecutionStep {
  id: string;
  name: string;
  description: string;
  status: "completed" | "failed" | "running" | "pending";
  duration: string;
}

// Mock data for projects
const mockProjects: Project[] = [
  {
    id: "1",
    name: "dev-agents",
    description: "Project Context Agent for codebase navigation and Q&A",
    status: "active",
    runs: 8,
    passed: 7,
    failed: 1,
    lastRun: "2 min ago",
    repoUrl: "github.com/user/dev-agents",
  },
  {
    id: "2",
    name: "api-gateway",
    description: "API gateway service with rate limiting and auth",
    status: "idle",
    runs: 23,
    passed: 21,
    failed: 2,
    lastRun: "1 hour ago",
  },
  {
    id: "3",
    name: "data-pipeline",
    description: "ETL pipeline for analytics data processing",
    status: "active",
    runs: 45,
    passed: 43,
    failed: 2,
    lastRun: "5 min ago",
  },
  {
    id: "4",
    name: "ml-inference",
    description: "Machine learning model inference service",
    status: "idle",
    runs: 12,
    passed: 10,
    failed: 2,
    lastRun: "3 hours ago",
  },
  {
    id: "5",
    name: "notification-service",
    description: "Push notifications and email delivery system",
    status: "active",
    runs: 67,
    passed: 65,
    failed: 2,
    lastRun: "10 min ago",
  },
];

const mockRuns: Run[] = [
  {
    id: "run-8",
    name: "Run #8",
    scenario: "Project Structure Query",
    status: "passed",
    duration: "14s",
    timestamp: "12/9/2025, 3:47 PM",
    criteria: 3,
    criteriaTotal: 3,
    steps: [
      { id: "1", name: "Initialize Agent", description: "Loading project context agent", status: "completed", duration: "1.2s" },
      { id: "2", name: "Process Input", description: "Parsing user query", status: "completed", duration: "0.3s" },
      { id: "3", name: "Generate Response", description: "Creating structured response", status: "completed", duration: "8.5s" },
      { id: "4", name: "Validate Output", description: "Checking response quality", status: "completed", duration: "2.1s" },
      { id: "5", name: "Judge Evaluation", description: "Evaluating against criteria", status: "completed", duration: "1.9s" },
    ],
  },
  {
    id: "run-7",
    name: "Run #7",
    scenario: "Code Navigation Test",
    status: "passed",
    duration: "28s",
    timestamp: "12/9/2025, 2:02 PM",
    criteria: 3,
    criteriaTotal: 3,
    steps: [
      { id: "1", name: "Initialize Agent", description: "Loading project context agent", status: "completed", duration: "1.1s" },
      { id: "2", name: "Process Input", description: "Parsing navigation request", status: "completed", duration: "0.4s" },
      { id: "3", name: "Search Codebase", description: "Scanning project files", status: "completed", duration: "15.2s" },
      { id: "4", name: "Generate Response", description: "Building file references", status: "completed", duration: "8.3s" },
      { id: "5", name: "Judge Evaluation", description: "Evaluating against criteria", status: "completed", duration: "3.0s" },
    ],
  },
  {
    id: "run-6",
    name: "Run #6",
    scenario: "Architecture Analysis",
    status: "passed",
    duration: "18s",
    timestamp: "12/9/2025, 2:01 PM",
    criteria: 3,
    criteriaTotal: 3,
    steps: [
      { id: "1", name: "Initialize Agent", description: "Loading project context agent", status: "completed", duration: "1.0s" },
      { id: "2", name: "Analyze Dependencies", description: "Reading package.json", status: "completed", duration: "2.3s" },
      { id: "3", name: "Map Architecture", description: "Building dependency graph", status: "completed", duration: "10.2s" },
      { id: "4", name: "Generate Report", description: "Creating architecture summary", status: "completed", duration: "4.5s" },
    ],
  },
  {
    id: "run-5",
    name: "Run #5",
    scenario: "Dependency Check",
    status: "failed",
    duration: "32s",
    timestamp: "12/9/2025, 1:42 PM",
    criteria: 2,
    criteriaTotal: 3,
    steps: [
      { id: "1", name: "Initialize Agent", description: "Loading project context agent", status: "completed", duration: "1.1s" },
      { id: "2", name: "Scan Dependencies", description: "Reading lock files", status: "completed", duration: "5.2s" },
      { id: "3", name: "Check Vulnerabilities", description: "Querying security database", status: "failed", duration: "20.1s" },
      { id: "4", name: "Generate Report", description: "Creating vulnerability report", status: "pending", duration: "-" },
    ],
  },
  {
    id: "run-4",
    name: "Run #4",
    scenario: "Integration Test",
    status: "passed",
    duration: "33s",
    timestamp: "12/8/2025, 1:38 PM",
    criteria: 3,
    criteriaTotal: 3,
    steps: [
      { id: "1", name: "Setup Environment", description: "Initializing test environment", status: "completed", duration: "3.2s" },
      { id: "2", name: "Run Tests", description: "Executing integration tests", status: "completed", duration: "25.1s" },
      { id: "3", name: "Collect Results", description: "Aggregating test results", status: "completed", duration: "2.7s" },
      { id: "4", name: "Cleanup", description: "Tearing down environment", status: "completed", duration: "2.0s" },
    ],
  },
];

// Icons as SVG components
const Icons = {
  Logo: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </svg>
  ),
  Menu: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  ),
  Close: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  Dashboard: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </svg>
  ),
  Projects: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  ),
  Runs: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  ),
  Scenarios: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  ),
  Prompts: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  Settings: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  Chat: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  ),
  Plus: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  Clock: () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  Check: () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  ChevronRight: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  ),
  ChevronLeft: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  ),
  GitHub: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  ),
  Code: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  ),
  X: () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
};

// Create Project Modal Component
function CreateProjectModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [formData, setFormData] = useState({
    projectName: "",
    repoName: "",
    description: "",
    initialPrompt: "",
    autoDeployEnabled: true,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Creating project:", formData);
    onClose();
  };

  return (
    <div className={`modal-overlay ${isOpen ? "visible" : ""}`} onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Create New Project</h2>
          <button className="modal-close" onClick={onClose}>
            <Icons.Close />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label className="form-label">Project Name</label>
              <input
                type="text"
                className="form-input"
                placeholder="my-awesome-project"
                value={formData.projectName}
                onChange={(e) => setFormData({ ...formData, projectName: e.target.value })}
              />
              <p className="form-hint">This will be the display name for your project</p>
            </div>

            <div className="form-group">
              <label className="form-label">Repository Name</label>
              <input
                type="text"
                className="form-input"
                placeholder="owner/repository-name"
                value={formData.repoName}
                onChange={(e) => setFormData({ ...formData, repoName: e.target.value })}
              />
              <p className="form-hint">github.com/{formData.repoName || "owner/repository-name"}</p>
            </div>

            <div className="form-group">
              <label className="form-label">Description</label>
              <textarea
                className="form-input form-textarea"
                placeholder="A brief description of your project..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Initial Prompt</label>
              <textarea
                className="form-input form-textarea"
                placeholder="Describe the frontend project you want to build...

Example: Build a modern e-commerce landing page with a hero section, product grid, testimonials, and a contact form. Use a minimalist design with dark mode support."
                value={formData.initialPrompt}
                onChange={(e) => setFormData({ ...formData, initialPrompt: e.target.value })}
                style={{ minHeight: "120px" }}
              />
              <p className="form-hint">This prompt will guide the AI agent to generate your initial project structure</p>
            </div>


            <div className="form-section">
              <h3 className="form-section-title">Deployment Options</h3>
              <label className="form-checkbox">
                <input
                  type="checkbox"
                  checked={formData.autoDeployEnabled}
                  onChange={(e) => setFormData({ ...formData, autoDeployEnabled: e.target.checked })}
                />
                <span className="form-checkbox-label">Enable auto-deploy to GitHub Pages</span>
              </label>
              <p className="form-hint" style={{ marginTop: "8px", paddingLeft: "26px" }}>
                Repository will be public • Branch auto-selected • README.md included
              </p>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              <Icons.GitHub /> Create Project
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Add Instructions Modal Component
function AddInstructionsModal({
  isOpen,
  onClose,
  projectName
}: {
  isOpen: boolean;
  onClose: () => void;
  projectName: string;
}) {
  const [instruction, setInstruction] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Adding instruction:", { projectName, instruction });
    setInstruction("");
    onClose();
  };

  return (
    <div className={`modal-overlay ${isOpen ? "visible" : ""}`} onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Add Instructions</h2>
          <button className="modal-close" onClick={onClose}>
            <Icons.Close />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "16px" }}>
              Add new instructions for <strong style={{ color: "var(--text-primary)" }}>{projectName}</strong>.
              The agent will add these to its todo list.
            </p>

            <div className="form-group">
              <label className="form-label">Instructions</label>
              <textarea
                className="form-input form-textarea"
                placeholder="Describe what you want the agent to work on...

Example: Add a dark mode toggle to the navigation bar. Make sure it persists the user's preference in localStorage."
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                style={{ minHeight: "120px" }}
                autoFocus
              />
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              <Icons.Plus /> Add to Todo
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


function RunDetailInline({ run }: { run: Run }) {
  const criteriaList = [
    "Agent should acknowledge the question about project structure",
    "Agent should provide a helpful response",
    "Response should be clear and informative",
  ];

  return (
    <div className="run-detail-inline">
      <div className="run-detail-body">
        <h4 style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "12px" }}>
          Execution Steps
        </h4>

        <div className="execution-steps">
          {run.steps?.map((step, index) => (
            <div key={step.id} className="execution-step">
              <div className={`step-indicator ${step.status}`}>
                {step.status === "completed" ? "✓" : step.status === "failed" ? "✗" : index + 1}
              </div>
              <div className="step-content">
                <div className="step-name">{step.name}</div>
                <div className="step-description">{step.description}</div>
              </div>
              <div className="step-time">{step.duration}</div>
            </div>
          ))}
        </div>

        <div className={`criteria-section ${run.status === "failed" ? "failed" : ""}`}>
          <div className="criteria-header">
            <Icons.Check /> Criteria ({run.criteria}/{run.criteriaTotal} met)
          </div>
          <ul className="criteria-list">
            {criteriaList.map((criteria, index) => (
              <li key={index} className="criteria-item">
                <span className={`criteria-icon ${index < run.criteria ? "pass" : "fail"}`}>
                  {index < run.criteria ? "✓" : "✗"}
                </span>
                {criteria}
              </li>
            ))}
          </ul>
        </div>

        <div className="execution-output">
          <div className="execution-output-title">Agent Response</div>
          <div className="execution-output-content">
            {`The project is a Dev Agents Dashboard built with:
• Next.js 14 with App Router
• TypeScript for type safety
• LangGraph framework for AI agents
• LangWatch for observability

Key directories:
├── src/app/          # Next.js pages
├── agent/            # LangGraph agent
├── prompts/          # LangWatch prompts
└── tests/            # Scenario tests`}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeNav, setActiveNav] = useState("projects");
  const [projectsExpanded, setProjectsExpanded] = useState(true);
  const [selectedProject, setSelectedProject] = useState(mockProjects[0]);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [instructionsModalOpen, setInstructionsModalOpen] = useState(false);
  const [selectedRun, setSelectedRun] = useState<Run | null>(null);

  // New state for view mode (Runs vs Files)
  const [viewMode, setViewMode] = useState<"runs" | "files">("runs");

  const handleNavClick = (nav: string) => {
    setActiveNav(nav);
    setSidebarOpen(false);
    setSelectedRun(null);
  };

  useCopilotAction({
    name: "navigateTo",
    description: "Navigate to a specific section of the dashboard",
    parameters: [
      {
        name: "section",
        type: "string",
        description: "The section to navigate to (dashboard, projects, prompts, settings, chat)",
        required: true,
      },
    ],
    handler: ({ section }) => {
      handleNavClick(section.toLowerCase());
    },
  });

  const handleProjectSelect = (project: Project) => {
    setSelectedProject(project);
    setActiveNav("projects");
    setSidebarOpen(false);
    setSelectedRun(null);
    setViewMode("runs");
  };

  const handleRunClick = (run: Run) => {
    // Toggle: if clicking same run, close it; otherwise open the clicked one
    setSelectedRun(selectedRun?.id === run.id ? null : run);
  };

  return (
    <div className="dashboard-layout">
      {/* Sidebar Overlay for mobile */}
      <div
        className={`sidebar-overlay ${sidebarOpen ? "visible" : ""}`}
        onClick={() => setSidebarOpen(false)}
      />

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <div className="sidebar-logo-icon">
              <Icons.Logo />
            </div>
            <span>Dev Agents</span>
          </div>
          <button className="sidebar-close" onClick={() => setSidebarOpen(false)}>
            <Icons.Close />
          </button>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section">
            <div className="nav-section-title">Overview</div>
            <div
              className={`nav-item ${activeNav === "dashboard" ? "active" : ""}`}
              onClick={() => handleNavClick("dashboard")}
            >
              <span className="nav-item-icon"><Icons.Dashboard /></span>
              Dashboard
            </div>

            {/* Projects Accordion */}
            <div className="nav-accordion">
              <div
                className={`nav-accordion-header ${activeNav === "projects" ? "active" : ""}`}
                onClick={() => setProjectsExpanded(!projectsExpanded)}
              >
                <div className="nav-accordion-left">
                  <span className="nav-item-icon"><Icons.Projects /></span>
                  Projects
                </div>
                <span className={`nav-accordion-arrow ${projectsExpanded ? "open" : ""}`}>
                  <Icons.ChevronRight />
                </span>
              </div>
              <div className={`nav-accordion-content ${projectsExpanded ? "open" : ""}`}>
                {mockProjects.map((project) => (
                  <div
                    key={project.id}
                    className={`project-nav-item ${selectedProject?.id === project.id && activeNav === "projects" ? "active" : ""}`}
                    onClick={() => handleProjectSelect(project)}
                  >
                    <span className={`project-status-dot ${project.status}`} />
                    {project.name}
                  </div>
                ))}
                <button
                  className="create-project-btn"
                  onClick={() => setCreateModalOpen(true)}
                >
                  <Icons.Plus /> New Project
                </button>
              </div>
            </div>
          </div>



          <div className="nav-section">
            <div className="nav-section-title">Configuration</div>
            <div
              className={`nav-item ${activeNav === "prompts" ? "active" : ""}`}
              onClick={() => handleNavClick("prompts")}
            >
              <span className="nav-item-icon"><Icons.Prompts /></span>
              Prompts
            </div>
            <div
              className={`nav-item ${activeNav === "settings" ? "active" : ""}`}
              onClick={() => handleNavClick("settings")}
            >
              <span className="nav-item-icon"><Icons.Settings /></span>
              Settings
            </div>
          </div>
        </nav>

        <div className="sidebar-footer">
          <div className="nav-item" onClick={() => handleNavClick("chat")}>
            <span className="nav-item-icon"><Icons.Chat /></span>
            Chat with Agent
          </div>
          <div className="nav-item" onClick={() => window.location.href = '/create-project'}>
            <span className="nav-item-icon"><Icons.Plus /></span>
            Create Project
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        {/* Mobile Header */}
        <div className="mobile-header">
          <button className="menu-btn" onClick={() => setSidebarOpen(true)}>
            <Icons.Menu />
          </button>
          <span className="mobile-title">
            {activeNav === "projects" && selectedProject ? selectedProject.name :
              activeNav.charAt(0).toUpperCase() + activeNav.slice(1)}
          </span>
          <div className="avatar" onClick={() => handleNavClick("settings")} style={{ cursor: "pointer" }}>VS</div>
        </div>

        {/* Desktop Header */}
        <header className="header">
          <div className="header-left">
            <h1 className="header-title">
              {activeNav === "projects" && selectedProject ? selectedProject.name : null}
              {activeNav === "dashboard" && "Dashboard"}
              {activeNav === "runs" && (selectedRun ? `${selectedRun.name} Details` : "Run History")}
              {activeNav === "scenarios" && "Scenarios"}
              {activeNav === "prompts" && "Prompts"}
              {activeNav === "settings" && "Settings"}
              {activeNav === "chat" && "Chat with Agent"}
            </h1>

            {activeNav === "projects" && selectedProject && (
              <></>
            )}
          </div>
          <div className="header-right">
            <div className="avatar" onClick={() => handleNavClick("settings")} style={{ cursor: "pointer" }}>VS</div>
          </div>
        </header>

        {/* Content Area */}
        <div className="content-area">
          {activeNav === "projects" && selectedProject && (
            <>
              {/* Selected Project Info */}
              <div className="project-header-display" style={{
                marginBottom: "24px",
                paddingBottom: "24px",
                borderBottom: "1px solid var(--border-subtle)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: "24px",
                flexWrap: "wrap"
              }}>
                <div className="project-info-primary" style={{ flex: "1 1 400px", minWidth: "300px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px", flexWrap: "wrap" }}>
                    <h2 style={{ fontSize: "24px", fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>{selectedProject.name}</h2>
                    <span className={`project-card-status ${selectedProject.status === "active" ? "status-active" : "status-idle"}`} style={{ fontSize: "12px", padding: "2px 8px" }}>
                      {selectedProject.status === "active" ? "● Active" : "○ Idle"}
                    </span>
                  </div>
                  <p style={{ fontSize: "14px", color: "var(--text-secondary)", lineHeight: "1.5", maxWidth: "600px", margin: "0 0 24px 0" }}>
                    {selectedProject.description}
                  </p>

                  <div className="project-actions" style={{ display: "flex", gap: "16px", alignItems: "center", flexWrap: "wrap" }}>
                    <button
                      onClick={() => setInstructionsModalOpen(true)}
                      style={{
                        background: "transparent",
                        border: "1px solid var(--border-color)",
                        color: "var(--text-muted)",
                        padding: "8px 16px",
                        borderRadius: "8px",
                        fontSize: "13px",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        fontWeight: 500,
                        transition: "all 0.15s ease",
                        height: "36px"
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent-primary)"; e.currentTarget.style.color = "var(--accent-primary)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border-color)"; e.currentTarget.style.color = "var(--text-muted)"; }}
                    >
                      <Icons.Plus /> Add Instructions
                    </button>

                    <div className="view-toggle" style={{ display: "flex", background: "var(--bg-tertiary)", padding: "4px", borderRadius: "8px" }}>
                      <button
                        onClick={() => setViewMode("runs")}
                        style={{
                          background: viewMode === "runs" ? "var(--accent-primary)" : "transparent",
                          color: viewMode === "runs" ? "white" : "var(--text-secondary)",
                          border: "none",
                          padding: "6px 16px",
                          borderRadius: "6px",
                          cursor: "pointer",
                          fontSize: "13px",
                          fontWeight: 500,
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          transition: "all 0.15s ease",
                          height: "28px"
                        }}
                      >
                        <Icons.Runs /> Runs
                      </button>
                      <button
                        onClick={() => setViewMode("files")}
                        style={{
                          background: viewMode === "files" ? "var(--accent-primary)" : "transparent",
                          color: viewMode === "files" ? "white" : "var(--text-secondary)",
                          border: "none",
                          padding: "6px 16px",
                          borderRadius: "6px",
                          cursor: "pointer",
                          fontSize: "13px",
                          fontWeight: 500,
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          transition: "all 0.15s ease",
                          height: "28px"
                        }}
                      >
                        <Icons.Code /> Files
                      </button>
                    </div>
                  </div>
                </div>

                <div className="project-stats-display" style={{
                  display: "flex",
                  gap: "32px",
                  background: "var(--bg-secondary)",
                  padding: "20px 28px",
                  borderRadius: "16px",
                  border: "1px solid var(--border-subtle)",
                  flex: "0 1 auto",
                  flexWrap: "wrap",
                  minWidth: "min-content"
                }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px", minWidth: "60px" }}>
                    <span style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--text-muted)", fontWeight: 600 }}>Total</span>
                    <span style={{ fontSize: "24px", fontWeight: 700, color: "var(--text-primary)" }}>{selectedProject.runs}</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px", minWidth: "60px" }}>
                    <span style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--text-muted)", fontWeight: 600 }}>Passed</span>
                    <span style={{ fontSize: "24px", fontWeight: 700, color: "var(--accent-success)" }}>{selectedProject.passed}</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px", minWidth: "60px" }}>
                    <span style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--text-muted)", fontWeight: 600 }}>Failed</span>
                    <span style={{ fontSize: "24px", fontWeight: 700, color: "var(--accent-error)" }}>{selectedProject.failed}</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px", borderLeft: "1px solid var(--border-subtle)", paddingLeft: "32px", minWidth: "100px" }}>
                    <span style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--text-muted)", fontWeight: 600 }}>Last Run</span>
                    <span style={{ fontSize: "14px", fontWeight: 500, color: "var(--text-secondary)", marginTop: "8px", whiteSpace: "nowrap" }}>{selectedProject.lastRun}</span>
                  </div>
                </div>
              </div>

              {viewMode === "runs" ? (
                <div className="run-history">
                  <div className="section-header">
                    <h2 className="section-title">Recent Runs</h2>
                  </div>

                  <div className="run-list">
                    {mockRuns.map((run) => (
                      <div key={run.id} className="run-accordion-item">
                        <div
                          className={`run-item ${selectedRun?.id === run.id ? "expanded" : ""}`}
                          onClick={() => handleRunClick(run)}
                        >
                          <div className="run-info">
                            <div className={`run-status-indicator ${run.status === "passed" ? "run-status-passed" : "run-status-failed"}`} />
                            <div className="run-details">
                              <span className="run-name">{run.name} • {run.scenario}</span>
                              <span className="run-meta">{run.timestamp}</span>
                            </div>
                          </div>
                          <div className="run-metrics">
                            <span className="metric">
                              <Icons.Clock /> {run.duration}
                            </span>
                            <span className="metric">
                              <Icons.Check /> {run.criteria}/{run.criteriaTotal}
                            </span>
                            <span className={`run-accordion-arrow ${selectedRun?.id === run.id ? "open" : ""}`}>
                              <Icons.ChevronRight />
                            </span>
                          </div>
                        </div>
                        {selectedRun?.id === run.id && (
                          <RunDetailInline run={run} />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: "20px" }}>
                  <FileExplorer projectId={selectedProject.id} />
                </div>
              )}
            </>
          )}

          {activeNav === "dashboard" && (
            <>
              <div className="projects-grid">
                {mockProjects.map((project) => (
                  <div
                    key={project.id}
                    className="project-card"
                    onClick={() => handleProjectSelect(project)}
                  >
                    <div className="project-card-header">
                      <div className="project-card-info">
                        <h3 className="project-card-title">{project.name}</h3>
                        <p className="project-card-description">{project.description}</p>
                      </div>
                      <span className={`project-card-status ${project.status === "active" ? "status-active" : "status-idle"}`}>
                        {project.status === "active" ? "●" : "○"}
                      </span>
                    </div>
                    <div className="project-card-stats">
                      <div className="stat-item">
                        <span className="stat-value">{project.runs}</span>
                        <span className="stat-label">Runs</span>
                      </div>
                      <div className="stat-item">
                        <span className="stat-value" style={{ color: "var(--accent-success)" }}>{project.passed}</span>
                        <span className="stat-label">Passed</span>
                      </div>
                      <div className="stat-item">
                        <span className="stat-value" style={{ color: "var(--accent-error)" }}>{project.failed}</span>
                        <span className="stat-label">Failed</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {(activeNav === "prompts" || activeNav === "settings" || activeNav === "chat") && (
            <div className="empty-state">
              <div className="empty-state-icon">
                {activeNav === "prompts" && <Icons.Prompts />}
                {activeNav === "settings" && <Icons.Settings />}
                {activeNav === "chat" && <Icons.Chat />}
              </div>
              <h3 className="empty-state-title">
                {activeNav === "prompts" && "Prompts"}
                {activeNav === "settings" && "Settings"}
                {activeNav === "chat" && "Agent Chat"}
              </h3>
              <p className="empty-state-description">
                This section is under development.
              </p>
            </div>
          )}
        </div>
      </main>

      {/* Create Project Modal */}
      <CreateProjectModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
      />

      {/* Add Instructions Modal */}
      <AddInstructionsModal
        isOpen={instructionsModalOpen}
        onClose={() => setInstructionsModalOpen(false)}
        projectName={selectedProject?.name || ""}
      />
    </div>
  );
}
