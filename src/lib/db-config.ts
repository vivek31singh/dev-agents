import { createClient } from "@libsql/client";
import fs from 'fs';
import path from 'path';

// Ensure database directory exists
const ensureDbDirectory = () => {
    const dbUrl = process.env.DATABASE_URL || "file:./data/mastra.db";
    if (dbUrl.startsWith('file:')) {
        const dbPath = dbUrl.replace('file:', '');
        const dbDir = path.dirname(dbPath);

        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
        }
    }
};

export const createDatabaseStore = () => {
    ensureDbDirectory();
    // return new LibSQLStore({
    //     url: process.env.DATABASE_URL || "file:./data/mastra.db",
    // });
    return null;
};

// Create a singleton instance
export const dbStore = createDatabaseStore();