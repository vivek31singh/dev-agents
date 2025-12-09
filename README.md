# Dev Agents 🤖

Autonomous AI agents that build frontend projects from natural language — from code generation to GitHub deployment.

![Next.js](https://img.shields.io/badge/Next.js-15-black?style=flat-square&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?style=flat-square&logo=typescript)
![Mastra](https://img.shields.io/badge/Mastra-AI_Framework-purple?style=flat-square)

## Overview

Dev Agents is an autonomous AI agent system that transforms your project ideas into fully deployed frontend applications. Describe what you want to build in plain English, and the AI agents handle everything — code generation, file structure, commits, and deployment to GitHub Pages.

**No more boilerplate. No more manual setup. Just describe and deploy.**

## 🧠 How It Works

1. **You describe** your project in natural language
2. **AI agents analyze** your requirements and plan the implementation
3. **Agents generate** the code, structure, and configuration
4. **Auto-deploy** to GitHub Pages with a single click

## ✨ Features

- **🤖 Autonomous Agents** — AI agents that understand, plan, and execute development tasks
- **💬 Natural Language** — Describe your project like you're talking to a developer
- **📝 Instruction Queue** — Add follow-up tasks and the agents work through them
- **🔄 Auto-Deploy** — Push to GitHub and deploy to Pages automatically
- **📊 Execution Tracking** — Monitor agent progress with detailed step-by-step logs
- **📱 Mobile-First** — Manage your agents from any device

## 🛠️ Tech Stack

- **Frontend**: Next.js 15, React 19, TypeScript
- **AI Framework**: [Mastra](https://mastra.ai/) — Agent orchestration
- **Observability**: [LangWatch](https://langwatch.ai/) — LLM monitoring & prompt management
- **Styling**: Vanilla CSS with CSS Variables
- **Testing**: Vitest with LangWatch Scenarios

## 📁 Project Structure

```
dev-agents/
├── src/
│   ├── app/                 # Next.js App Router
│   │   ├── page.tsx         # Dashboard interface
│   │   ├── layout.tsx       # Root layout
│   │   └── globals.css      # Global styles
│   └── mastra/              # Mastra AI configuration
│       ├── agents/          # Agent definitions
│       └── index.ts         # Mastra instance
├── prompts/                 # LangWatch prompt templates
├── tests/
│   ├── scenarios/           # Scenario-based agent tests
│   └── setup.ts             # Test configuration
└── package.json
```

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- pnpm (recommended) or npm
- OpenAI API key

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/dev-agents.git
   cd dev-agents
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Add your API keys:
   ```env
   OPENAI_API_KEY=your_openai_key
   LANGWATCH_API_KEY=your_langwatch_key
   ```

4. **Run the development server**
   ```bash
   pnpm dev
   ```

5. **Open in browser**
   
   Navigate to [http://localhost:3000](http://localhost:3000)

## 📖 Usage

### Creating a New Project

1. Click **"New Project"** in the sidebar
2. Enter project details:
   - **Project Name** — Display name for your project
   - **Repository Name** — GitHub repo name
   - **Description** — Brief project description
   - **Initial Prompt** — Describe what you want to build in detail
3. Toggle auto-deploy if desired
4. Click **"Create Project"**

The agent will:
- Create the GitHub repository
- Generate the initial codebase
- Set up the project structure
- Deploy to GitHub Pages (if enabled)

### Adding Instructions

Have a new feature or change in mind?

1. Select a project from the sidebar
2. Click on the project card
3. Describe what you want the agent to do
4. Click **"Add to Todo"**

The agent will pick up your instructions and work through them autonomously.

### Monitoring Execution

Track what the agent is doing:

1. Navigate to a project
2. View the **Recent Runs** section
3. Click any run to see detailed execution steps
4. Review agent responses and criteria evaluation

## 🧪 Testing

Run the test suite:

```bash
pnpm test
```

Run tests in watch mode:

```bash
pnpm test:watch
```

## 🔧 Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start development server |
| `pnpm build` | Build for production |
| `pnpm start` | Start production server |
| `pnpm test` | Run tests |
| `pnpm lint` | Run ESLint |

## 🗺️ Roadmap

- [ ] Multi-agent collaboration
- [ ] Custom agent configurations
- [ ] Support for backend projects
- [ ] Integration with more deployment platforms
- [ ] Agent scheduling and frequency control

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Mastra](https://mastra.ai/) — AI agent framework
- [LangWatch](https://langwatch.ai/) — LLM observability and prompt management
- [Next.js](https://nextjs.org/) — React framework
- [OpenAI](https://openai.com/) — Language models

---

<p align="center">
  <strong>Turn ideas into deployed apps with AI agents</strong>
</p>