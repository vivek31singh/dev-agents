"use client";

import { useState } from "react";

// Types
export interface FileSystemItem {
    id: string;
    name: string;
    type: "file" | "folder";
    children?: FileSystemItem[];
    content?: string;
    language?: string;
}

// Icons
const Icons = {
    Folder: ({ color = "#E8B868" }: { color?: string }) => (
        <svg width="16" height="16" viewBox="0 0 24 24" fill={color} stroke="none">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
    ),
    FolderOpen: ({ color = "#E8B868" }: { color?: string }) => (
        <svg width="16" height="16" viewBox="0 0 24 24" fill={color} stroke="none">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            <path d="M2 19l2.5-9h15l-2.5 9H2z" fillOpacity="0.3" fill="#FFF" />
        </svg>
    ),
    File: ({ color = "#94a3b8" }: { color?: string }) => (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
            <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
            <polyline points="13 2 13 9 20 9" />
        </svg>
    ),
    TypeScript: () => (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3178C6" strokeWidth="2">
            <path d="M4 2h16a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" />
            <path d="M8 18h2v-6h-2" strokeWidth="2.5" />
            <path d="M14 18h2c1 0 1-1 1-1.5s-.5-1.5-1.5-1.5h-1v-3" strokeWidth="2.5" />
        </svg>
    ),
    Json: () => (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F1E05A" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M10 12h4" />
            <path d="M10 16h4" />
        </svg>
    ),
    ChevronRight: () => (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="9 18 15 12 9 6" />
        </svg>
    ),
    ChevronDown: () => (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="6 9 12 15 18 9" />
        </svg>
    ),
};

// Helper to determine icon based on file name
const getFileIcon = (fileName: string) => {
    if (fileName.endsWith('.ts') || fileName.endsWith('.tsx')) return <Icons.TypeScript />;
    if (fileName.endsWith('.json')) return <Icons.Json />;
    return <Icons.File />;
};

// Mock File System Data
const mockFileSystem: FileSystemItem[] = [
    {
        id: "root",
        name: "src",
        type: "folder",
        children: [
            {
                id: "app",
                name: "app",
                type: "folder",
                children: [
                    {
                        id: "page",
                        name: "page.tsx",
                        type: "file",
                        language: "typescript",
                        content: `export default function Page() {
  return (
    <main>
      <h1>Hello World</h1>
    </main>
  );
}`
                    },
                    {
                        id: "layout",
                        name: "layout.tsx",
                        type: "file",
                        language: "typescript",
                        content: `export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}`
                    },
                    {
                        id: "globals",
                        name: "globals.css",
                        type: "file",
                        language: "css",
                        content: `body {
  background: #000;
  color: #fff;
}`
                    }
                ]
            },
            {
                id: "components",
                name: "components",
                type: "folder",
                children: [
                    {
                        id: "header",
                        name: "Header.tsx",
                        type: "file",
                        language: "typescript",
                        content: `export function Header() {
  return <header>Logo</header>;
}`
                    },
                    {
                        id: "sidebar",
                        name: "Sidebar.tsx",
                        type: "file",
                        language: "typescript",
                        content: `export function Sidebar() {
  return <aside>Nav</aside>;
}`
                    }
                ]
            },
            {
                id: "utils",
                name: "utils.ts",
                type: "file",
                language: "typescript",
                content: `export const cn = (...inputs: ClassValue[]) => {
  return twMerge(clsx(inputs));
}`
            }
        ]
    },
    {
        id: "package",
        name: "package.json",
        type: "file",
        language: "json",
        content: `{
  "name": "my-app",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  }
}`
    },
    {
        id: "config",
        name: "next.config.ts",
        type: "file",
        language: "typescript",
        content: `const nextConfig = {
  /* config options here */
};

export default nextConfig;`
    }
];

// File Tree Item Component
const FileTreeItem = ({
    item,
    depth = 0,
    activeFileId,
    onFileSelect
}: {
    item: FileSystemItem;
    depth?: number;
    activeFileId?: string | null;
    onFileSelect: (file: FileSystemItem) => void;
}) => {
    const [isOpen, setIsOpen] = useState(depth === 0);

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (item.type === "folder") {
            setIsOpen(!isOpen);
        } else {
            onFileSelect(item);
        }
    };

    return (
        <>
            <div
                className={`flex items-center file-row ${activeFileId === item.id ? "active" : ""} ${item.type === "folder" ? "folder" : "file"}`}
                onClick={handleClick}
                style={{ paddingLeft: `${depth * 14 + 10}px` }}
            >
                <span className="icon-type">
                    {item.type === "folder" ? (
                        isOpen ? <Icons.FolderOpen /> : <Icons.Folder />
                    ) : (
                        getFileIcon(item.name)
                    )}
                </span>


                <span className="file-name">{item.name}</span>
                <span className="icon-state">
                    {item.type === "folder" && (
                        <span className="chevron-icon">
                            {isOpen ? <Icons.ChevronDown /> : <Icons.ChevronRight />}
                        </span>
                    )}
                </span>
            </div>

            {item.type === "folder" && isOpen && item.children && (
                <div className="file-children">
                    {item.children.map((child) => (
                        <FileTreeItem
                            key={child.id}
                            item={child}
                            depth={depth + 1}
                            activeFileId={activeFileId}
                            onFileSelect={onFileSelect}
                        />
                    ))}
                </div>
            )}
        </>
    );
};

export default function FileExplorer({ projectId }: { projectId: string }) {
    const [activeFile, setActiveFile] = useState<FileSystemItem | null>(null);

    return (
        <div className="explorer-container">
            <div className="explorer-sidebar">
                <div className="explorer-header">
                    <span>EXPLORER</span>
                </div>
                <div className="explorer-tree">
                    {mockFileSystem.map((item) => (
                        <FileTreeItem
                            key={item.id}
                            item={item}
                            activeFileId={activeFile?.id}
                            onFileSelect={setActiveFile}
                        />
                    ))}
                </div>
            </div>

            <div className="explorer-content">
                {activeFile ? (
                    <div className="editor">
                        <div className="editor-tabs">
                            <div className="editor-tab active">
                                <span className="tab-icon">{getFileIcon(activeFile.name)}</span>
                                <span className="tab-name">{activeFile.name}</span>
                                <span className="tab-close">×</span>
                            </div>
                        </div>
                        <div className="editor-code-container">
                            <div className="line-numbers">
                                {activeFile.content?.split('\n').map((_, i) => (
                                    <div key={i} className="line-number">{i + 1}</div>
                                ))}
                            </div>
                            <pre className="code-content">
                                <code>{activeFile.content || "// Binary or empty file"}</code>
                            </pre>
                        </div>
                    </div>
                ) : (
                    <div className="empty-state">
                        <div className="empty-icon"><Icons.File /></div>
                        <p>Select a file to view contents</p>
                    </div>
                )}
            </div>

            <style jsx>{`
        .explorer-container {
          display: flex;
          height: 600px;
          background: #1e1e1e;
          border: 1px solid #333;
          border-radius: 8px;
          overflow: hidden;
          font-family: 'Segoe UI', sans-serif;
          color: #ccc;
        }

        /* Sidebar */
        .explorer-sidebar {
          width: 260px;
          background: #252526;
          display: flex;
          flex-direction: column;
          border-right: 1px solid #1e1e1e;
          flex-shrink: 0;
        }

        .explorer-header {
          padding: 10px 20px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 1px;
          color: #bbb;
          text-transform: uppercase;
        }

        .explorer-tree {
          flex: 1;
          overflow-y: auto;
          overflow-x: hidden;
        }

        /* File Row */
        .file-row {
          display: flex;
          align-items: center;
          height: 24px;
          cursor: pointer;
          transition: background 0.1s;
          white-space: nowrap;
          padding-right: 10px;
        }

        .file-row:hover {
          background: #2a2d2e;
        }

        .file-row.active {
          background: #37373d;
          color: #fff;
        }

        .icon-state {
          width: 20px;
          display: flex;
          justify-content: center;
          align-items: center;
          flex-shrink: 0;
          margin-right: 4px;
        }

        .chevron-icon {
          display: flex;
          align-items: center;
          color: #cccccc;
          opacity: 1;
        }

        .chevron-icon svg {
          width: 16px;
          height: 16px;
        }

        .icon-type {
          width: 22px;
          display: flex;
          justify-content: center;
          align-items: center;
          flex-shrink: 0;
        }

        .file-name {
          font-size: 13px;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        /* Content Area */
        .explorer-content {
          flex: 1;
          background: #1e1e1e;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .editor {
          display: flex;
          flex-direction: column;
          height: 100%;
        }

        .editor-tabs {
          display: flex;
          background: #252526;
          height: 35px;
          overflow-x: auto;
        }

        .editor-tab {
          display: flex;
          align-items: center;
          padding: 0 10px;
          background: #1e1e1e;
          border-right: 1px solid #252526;
          border-top: 1px solid #252526;
          color: #fff;
          font-size: 13px;
          cursor: pointer;
          min-width: 120px;
          max-width: 200px;
          gap: 6px;
        }

        .editor-tab.active {
          background: #1e1e1e;
          border-top: 1px solid #007acc;
        }

        .tab-icon {
          display: flex;
          align-items: center;
          opacity: 0.8;
        }
        
        .tab-name {
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .tab-close {
          opacity: 0;
          font-size: 16px;
          padding: 2px;
          border-radius: 4px;
        }

        .editor-tab:hover .tab-close {
          opacity: 1;
        }
        
        .tab-close:hover {
          background: #333;
        }

        .editor-code-container {
          flex: 1;
          display: flex;
          overflow: auto;
          padding-top: 4px;
        }

        .line-numbers {
          padding: 10px 0;
          text-align: right;
          color: #858585;
          font-family: Consolas, 'Courier New', monospace;
          font-size: 14px;
          line-height: 1.5;
          user-select: none;
          min-width: 40px;
          padding-right: 15px;
        }

        .line-number {
          padding: 0 5px;
        }

        .code-content {
          flex: 1;
          margin: 0;
          padding: 10px;
          font-family: Consolas, 'Courier New', monospace;
          font-size: 14px;
          line-height: 1.5;
          color: #d4d4d4;
          tab-size: 2;
        }

        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: #555;
        }

        .empty-icon {
          font-size: 48px;
          opacity: 0.2;
          margin-bottom: 10px;
        }
        
        .empty-icon svg {
          width: 48px;
          height: 48px;
        }
      `}</style>
        </div>
    );
}
