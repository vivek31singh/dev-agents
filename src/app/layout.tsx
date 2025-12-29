import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DevAgents Dashboard",
  description: "Monitor and manage your AI agent projects",
};

import { CopilotKit } from "@copilotkit/react-core";
import { CopilotPopup } from "@copilotkit/react-ui";
import "@copilotkit/react-ui/styles.css";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <CopilotKit runtimeUrl="/api/copilotkit" agent="initialize_project" publicApiKey={process.env.NEXT_PUBLIC_COPILOTKIT_PUBLIC_API_KEY} publicLicenseKey={process.env.NEXT_PUBLIC_COPILOTKIT_PUBLIC_LICENSE_KEY}>
          {children}
          <CopilotPopup
            className="copilot-popup"
            instructions="You are a helpful assistant for the Dev Agents Dashboard. You can help manage projects, explain runs, and answer questions about the codebase."
            defaultOpen={false}
            labels={{
              title: "Dev Agent Assistant",
              initial: "How can I help you today?",
            }}
          />
        </CopilotKit>
      </body>
    </html>
  );
}
