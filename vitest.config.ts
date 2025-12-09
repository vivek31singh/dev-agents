// vitest.config.ts
import { defineConfig } from "vitest/config";
import { withScenario } from "@langwatch/scenario/integrations/vitest/config";
import path from "path";

export default withScenario(
    defineConfig({
        test: {
            testTimeout: 180_000, // 3 minutes for scenario tests
            globals: true,
            environment: "node",
            include: ["tests/**/*.test.ts"],
            setupFiles: ["./tests/setup.ts"],
        },
        resolve: {
            alias: {
                "@": path.resolve(__dirname, "./src"),
            },
        },
    })
);
