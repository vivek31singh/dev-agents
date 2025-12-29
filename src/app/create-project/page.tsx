"use client";

import { useState } from "react";

export default function CreateProjectPage() {
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleCreateProject = async () => {
    if (!prompt.trim()) {
      setError("Please enter a project description");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    try {
      // const workflow = mastra.getWorkflow("createProjectWorkflow");
      // const workflowResult = await workflow.createRunAsync();
      // const executionResult = await workflowResult.start({
      //   inputData: { prompt }
      // });
      // setResult(executionResult);
      setError("Project creation via workflow is currently disabled. Use LangGraph agent instead.");
    } catch (err: any) {
      setError(err.message || "Failed to create project");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <h1 className="text-3xl font-bold mb-6">Create Next.js Project</h1>

      <div className="mb-6">
        <label htmlFor="prompt" className="block text-sm font-medium mb-2">
          Project Description
        </label>
        <textarea
          id="prompt"
          className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          rows={4}
          placeholder="Describe the Next.js project you want to create..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
          {error}
        </div>
      )}

      <button
        onClick={handleCreateProject}
        disabled={loading}
        className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
      >
        {loading ? "Creating Project..." : "Create Project"}
      </button>

      {result && (
        <div className="mt-8">
          <h2 className="text-2xl font-semibold mb-4">Project Plan</h2>

          {Array.isArray(result) && (
            <div className="space-y-3">
              <h3 className="font-medium mb-2">Project Subtasks</h3>
              {result.map((subtask: any) => (
                <div key={subtask.id} className="p-3 border border-gray-200 rounded">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium">Task {subtask.id}:</span>
                    <span className="text-blue-600">{subtask.title}</span>
                  </div>
                  <p className="text-sm text-gray-600">{subtask.description}</p>
                  {subtask.dependencies && subtask.dependencies.length > 0 && (
                    <div className="mt-2 text-xs text-gray-500">
                      Dependencies: {subtask.dependencies.join(", ")}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

        </div>
      )}
    </div>
  );
}