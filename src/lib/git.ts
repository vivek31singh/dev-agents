import axios from 'axios';

export async function repositoryExists(owner: string, repo: string, token: string): Promise<boolean> {
    console.log(`[git.ts] Checking if repository exists: ${owner}/${repo}`);
    try {
        await axios.get(
            `https://api.github.com/repos/${owner}/${repo}`,
            {
                headers: { Authorization: `token ${token}` }
            }
        );
        return true;
    } catch (error: any) {
        if (error.response?.status === 404) {
            console.log(`[git.ts] Repository ${owner}/${repo} not found (404).`);
            return false;
        }
        console.error(`[git.ts] Error checking repository existence: ${error.message} Status: ${error.response?.status}`);
        throw error;
    }
}

/**
 * Configuration options for fetching repository content
 */
interface FetchRepositoryConfig {
    /** File extensions to include (if not specified, includes all files) */
    includeExtensions?: string[];
    /** File paths or patterns to exclude */
    excludePatterns?: string[];
    /** Maximum file size in bytes (default: 1MB) */
    maxFileSize?: number;
    /** Whether to include binary files (default: false) */
    includeBinary?: boolean;
    /** Custom function to filter files */
    customFilter?: (path: string, content: string) => boolean;
}

/**
 * Fetch all files from a repository with their full paths and content
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param token - GitHub personal access token
 * @param branch - Branch name (default: 'main')
 * @param config - Configuration options for filtering files
 * @returns Array of files with path and content
 */
export async function fetchAllRepositoryFiles(
    owner: string,
    repo: string,
    token: string,
    branch: string = 'main',
    config?: FetchRepositoryConfig
): Promise<{ path: string; content: string }[]> {
    console.log(`[git.ts] Fetching all files from ${owner}/${repo}/${branch}`);

    // Set default configuration values
    const {
        includeExtensions,
        excludePatterns,
        maxFileSize = 1024 * 1024, // 1MB default
        includeBinary = false,
        customFilter
    } = config || {};

    try {
        // Get the repository tree recursively
        const res = await axios.get(
            `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
            {
                headers: { Authorization: `token ${token}` }
            }
        );

        const tree = res.data.tree;
        const files: { path: string; content: string }[] = [];
        let skippedCount = 0;

        // Process each item in the tree
        for (const item of tree) {
            // Only process files (not directories or submodules)
            if (item.type === 'blob') {
                try {
                    // Check if file should be excluded based on patterns
                    if (excludePatterns && excludePatterns.some(pattern => {
                        // Convert glob patterns to regex
                        const regex = new RegExp(
                            pattern.replace(/\*/g, '.*').replace(/\?/g, '.')
                        );
                        return regex.test(item.path);
                    })) {
                        console.log(`[git.ts] Skipping excluded file: ${item.path}`);
                        skippedCount++;
                        continue;
                    }

                    // Check file extension if includeExtensions is specified
                    if (includeExtensions && includeExtensions.length > 0) {
                        const fileExtension = item.path.split('.').pop()?.toLowerCase();
                        if (!fileExtension || !includeExtensions.includes(fileExtension)) {
                            console.log(`[git.ts] Skipping file with non-matching extension: ${item.path}`);
                            skippedCount++;
                            continue;
                        }
                    }

                    // Fetch the content of each file
                    const contentRes = await axios.get(
                        item.url,
                        {
                            headers: { Authorization: `token ${token}` }
                        }
                    );

                    // Check file size
                    if (contentRes.data.size > maxFileSize) {
                        console.log(`[git.ts] Skipping large file (${contentRes.data.size} bytes): ${item.path}`);
                        skippedCount++;
                        continue;
                    }

                    // Decode base64 content
                    let content: string;
                    try {
                        content = Buffer.from(contentRes.data.content, 'base64').toString('utf-8');
                    } catch (error) {
                        if (!includeBinary) {
                            console.log(`[git.ts] Skipping binary file: ${item.path}`);
                            skippedCount++;
                            continue;
                        }
                        // For binary files, keep the base64 content
                        content = contentRes.data.content;
                    }

                    // Apply custom filter if provided
                    if (customFilter && !customFilter(item.path, content)) {
                        console.log(`[git.ts] Skipping file due to custom filter: ${item.path}`);
                        skippedCount++;
                        continue;
                    }

                    files.push({
                        path: item.path,
                        content
                    });

                    console.log(`[git.ts] Fetched file: ${item.path}`);
                } catch (error: any) {
                    console.error(`[git.ts] Error fetching file ${item.path}:`, error.message);
                    skippedCount++;
                    // Continue with other files even if one fails
                }
            }
        }

        console.log(`[git.ts] Successfully fetched ${files.length} files from ${owner}/${repo}. Skipped ${skippedCount} files.`);
        return files;
    } catch (error: any) {
        console.error(`[git.ts] Error fetching repository files: ${error.message}`);
        if (error.response?.status === 404) {
            throw new Error(`Repository ${owner}/${repo} or branch ${branch} not found`);
        } else if (error.response?.status === 409) {
            throw new Error(`Repository ${owner}/${repo} is empty`);
        }
        throw error;
    }
}

/**
 * Convenience function to fetch only source code files
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param token - GitHub personal access token
 * @param branch - Branch name (default: 'main')
 * @returns Array of source code files with path and content
 */
export async function fetchSourceCodeFiles(
    owner: string,
    repo: string,
    token: string,
    branch: string = 'main'
): Promise<{ path: string; content: string }[]> {
    const sourceExtensions = [
        'js', 'jsx', 'ts', 'tsx', 'vue', 'svelte',
        'py', 'java', 'cpp', 'c', 'h', 'hpp',
        'cs', 'php', 'rb', 'go', 'rs', 'swift',
        'kt', 'scala', 'clj', 'hs', 'ml', 'sh',
        'sql', 'html', 'css', 'scss', 'less', 'sass',
        'json', 'xml', 'yaml', 'yml', 'toml', 'ini',
        'md', 'txt', 'dockerfile', 'gitignore'
    ];

    return fetchAllRepositoryFiles(owner, repo, token, branch, {
        includeExtensions: sourceExtensions,
        excludePatterns: [
            'node_modules/*',
            'dist/*',
            'build/*',
            '*.min.js',
            '*.min.css',
            'package-lock.json',
            'yarn.lock'
        ]
    });
}



export async function getBranchSHA(owner: string, repo: string, branch: string, token: string) {
    const res = await axios.get(
        `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${branch}`,
        {
            headers: { Authorization: `token ${token}` }
        }
    );

    return res.data.object.sha;
}

export async function getCommitTreeSHA(owner: string, repo: string, commitSHA: string, token: string) {
    const res = await axios.get(
        `https://api.github.com/repos/${owner}/${repo}/git/commits/${commitSHA}`,
        {
            headers: { Authorization: `token ${token}` }
        }
    );
    return res.data.tree.sha;
}

export async function commitFilesToBranch(
    owner: string,
    repo: string,
    branch: string,
    files: { path: string; content: string }[],
    message: string,
    token: string
) {
    // 1. Get Tip
    const baseSHA = await getBranchSHA(owner, repo, branch, token);

    // 2. Get Tree
    const baseTreeSHA = await getCommitTreeSHA(owner, repo, baseSHA, token);

    // 3. Create New Tree
    const newTreeSHA = await createTree(owner, repo, baseTreeSHA, files, token);

    // 4. Create Commit
    const commitSHA = await createCommit(owner, repo, baseSHA, newTreeSHA, message, token);

    // 5. Update Ref
    await updateBranch(owner, repo, branch, commitSHA, token);

    return commitSHA;
}

export async function createBlob(owner: string, repo: string, content: string, token: string) {
    const res = await axios.post(
        `https://api.github.com/repos/${owner}/${repo}/git/blobs`,
        {
            content,
            encoding: "utf-8"
        },
        {
            headers: { Authorization: `token ${token}` }
        }
    );

    return res.data.sha;
}

export async function createTree(owner: string, repo: string, baseTreeSHA: string, files: { path: string; content: string }[], token: string) {
    const tree = [];

    for (const file of files) {
        const blobSHA = await createBlob(owner, repo, file.content, token);

        tree.push({
            path: file.path,
            mode: "100644",
            type: "blob",
            sha: blobSHA
        });
    }

    const res = await axios.post(
        `https://api.github.com/repos/${owner}/${repo}/git/trees`,
        {
            base_tree: baseTreeSHA,
            tree
        },
        {
            headers: { Authorization: `token ${token}` }
        }
    );

    return res.data.sha;
}

export async function createCommit(owner: string, repo: string, parentSHA: string, treeSHA: string, message: string, token: string) {
    const res = await axios.post(
        `https://api.github.com/repos/${owner}/${repo}/git/commits`,
        {
            message,
            parents: [parentSHA],
            tree: treeSHA
        },
        { headers: { Authorization: `token ${token}` } }
    );

    return res.data.sha;
}

export async function updateBranch(owner: string, repo: string, branch: string, commitSHA: string, token: string) {
    await axios.patch(
        `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${branch}`,
        {
            sha: commitSHA,
            force: true
        },
        {
            headers: { Authorization: `token ${token}` }
        }
    );
}

export async function createBranch(owner: string, repo: string, newBranch: string, baseSHA: string, token: string) {
    console.log(`[git.ts] Creating branch ${newBranch} from ${baseSHA} in ${owner}/${repo}`);
    try {
        await axios.post(
            `https://api.github.com/repos/${owner}/${repo}/git/refs`,
            {
                ref: `refs/heads/${newBranch}`,
                sha: baseSHA
            },
            {
                headers: { Authorization: `token ${token}` }
            }
        );
    } catch (error: any) {
        // If branch already exists (422), ignore the error
        if (error.response?.status === 422) {
            console.log(`Branch ${newBranch} already exists. Skipping creation.`);
            return;
        }
        throw error;
    }
}

/**
 * Create a new GitHub repository
 * @param name - Repository name
 * @param isPrivate - Whether the repository should be private (default: true)
 * @param description - Repository description (optional)
 * @param token - GitHub personal access token
 * @param org - Organization name (optional, creates under user if not provided)
 * @returns Repository data including full_name, html_url, clone_url, etc.
 */
export async function createRepository(
    name: string,
    isPrivate: boolean,
    description: string | undefined,
    token: string,
    org?: string
) {
    const endpoint = org
        ? `https://api.github.com/orgs/${org}/repos`
        : 'https://api.github.com/user/repos';


    try {

        const res = await axios.post(
            endpoint,
            {
                name,
                description,
                private: isPrivate,
                auto_init: true, // Initialize with README to enable Git Data API
            },
            {
                headers: { Authorization: `token ${token}` }
            }
        );

        return {
            name: res.data.name,
            fullName: res.data.full_name,
            htmlUrl: res.data.html_url,
            cloneUrl: res.data.clone_url,
            owner: res.data.owner.login,
        };
    } catch (error) {
        console.log(error);
        throw error;
    }
}

/**
 * Check if a repository exists
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param token - GitHub personal access token
 * @returns True if repository exists, false otherwise
 */


/**
 * Verify token permissions and owner
 * @param token - GitHub personal access token
 * @returns Object containing login and scopes
 */
export async function verifyToken(token: string) {
    console.log(`[git.ts] Verifying token permissions...`);
    try {
        const res = await axios.get('https://api.github.com/user', {
            headers: { Authorization: `token ${token}` }
        });

        const scopes = res.headers['x-oauth-scopes'] || '';
        console.log(`[git.ts] Token verified. User: ${res.data.login}, Scopes: ${scopes}`);

        return {
            login: res.data.login,
            scopes: scopes.split(',').map((s: string) => s.trim())
        };
    } catch (error: any) {
        console.error(`[git.ts] Token verification failed: ${error.message}`);
        if (error.response) {
            console.error(`[git.ts] Status: ${error.response.status}`);
            console.error(`[git.ts] Body: ${JSON.stringify(error.response.data)}`);
        }
        throw new Error(`GitHub token verification failed: ${error.message}`);
    }
}

export async function getGithubOwner(): Promise<string> {    
    const token = process.env.GITHUB_TOKEN;

    if(!token) {
        throw new Error('GITHUB_TOKEN is not set');
    }

    try {
        const { login } = await verifyToken(token);
        return login;
    } catch (error: any) {
        console.error(`[git.ts] Error fetching GitHub owner: ${error.message}`);
        throw error;
    }
}

export async function pushFilesAsCommit({
    owner,
    repo,
    baseBranch,
    newBranch,
    files,
    commitMessage,
    token,
    repoDescription
}: {
    owner: string;
    repo: string;
    baseBranch: string;
    newBranch: string;
    files: { path: string; content: string }[];
    commitMessage: string;
    token: string;
    repoDescription?: string;
}) {
    console.log(`[git.ts] pushFilesAsCommit called for ${owner}/${repo}`);
    const tokenMasked = token ? `${token.substring(0, 7)}...${token.substring(token.length - 4)}` : 'undefined';
    console.log(`[git.ts] Token present: ${!!token}, length: ${token?.length}, value: ${tokenMasked}`);

    try {
        // 0. Verify token first
        const tokenInfo = await verifyToken(token);

        // Check if token owner matches requested owner (unless it's an org, which is harder to check without more calls)
        // But logging it is enough for debugging
        if (tokenInfo.login.toLowerCase() !== owner.toLowerCase()) {
            console.warn(`[git.ts] WARNING: Token owner (${tokenInfo.login}) does not match requested owner (${owner}). This might be intended if pushing to an organization.`);
        }

        // Check for required scopes
        const requiredScopes = ['repo']; // 'repo' covers everything for private repos. 'public_repo' for public.
        const hasRepoScope = tokenInfo.scopes.includes('repo');
        const hasPublicRepoScope = tokenInfo.scopes.includes('public_repo');

        if (!hasRepoScope && !hasPublicRepoScope) {
            console.warn(`[git.ts] WARNING: Token seems to be missing 'repo' or 'public_repo' scope. Scopes found: ${tokenInfo.scopes.join(', ')}`);
        }

        // 1. Check if repository exists, create if not
        const exists = await repositoryExists(owner, repo, token);

        if (!exists) {
            console.log(`Repository ${owner}/${repo} does not exist. Creating...`);
            const newRepo = await createRepository(
                repo,
                false, // public repository to match token scope
                repoDescription || `Generated repository from v0`,
                token
            );
            console.log(`Repository created: ${newRepo.htmlUrl}`);

            // Wait a moment for GitHub to fully initialize the repository
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        // 2. Get base branch SHA
        console.log(`[git.ts] Getting SHA for branch ${baseBranch}...`);
        const baseSHA = await getBranchSHA(owner, repo, baseBranch, token);

        // If creating a new branch
        if (newBranch) {
            await createBranch(owner, repo, newBranch, baseSHA, token);
            baseBranch = newBranch;
        }

        // 3. Get tree SHA of base branch
        console.log(`[git.ts] Getting tree SHA for commit ${baseSHA}...`);
        const res = await axios.get(
            `https://api.github.com/repos/${owner}/${repo}/git/commits/${baseSHA}`,
            {
                headers: { Authorization: `token ${token}` }
            }
        );
        const baseTreeSHA = res.data.tree.sha;

        // Validate and sanitize files before creating tree
        console.log(`[git.ts] Validating ${files.length} files before creating tree...`);
        const validatedFiles = files
            .filter(file => {
                // Filter out files with empty or invalid content
                if (!file.content || file.content.trim().length === 0) {
                    console.warn(`[git.ts] Skipping empty file: ${file.path}`);
                    return false;
                }

                // Filter out files with invalid paths
                if (!file.path || file.path.trim().length === 0) {
                    console.warn(`[git.ts] Skipping file with empty path`);
                    return false;
                }

                // GitHub doesn't allow certain characters in file paths
                const invalidChars = /[<>:"|?*\x00-\x1F]/;
                if (invalidChars.test(file.path)) {
                    console.warn(`[git.ts] Skipping file with invalid characters in path: ${file.path}`);
                    return false;
                }

                return true;
            })
            .map(file => ({
                // Normalize path separators to forward slashes
                path: file.path.replace(/\\/g, '/').trim(),
                content: file.content
            }));

        if (validatedFiles.length === 0) {
            throw new Error('No valid files to commit after validation');
        }

        console.log(`[git.ts] ${validatedFiles.length} files passed validation`);
        if (validatedFiles.length < files.length) {
            console.warn(`[git.ts] ${files.length - validatedFiles.length} files were filtered out`);
        }

        // Log file paths for debugging
        console.log(`[git.ts] File paths to be committed:`, validatedFiles.map(f => f.path).join(', '));

        // 4. Create new tree
        console.log(`[git.ts] Creating new tree with ${validatedFiles.length} files...`);
        const newTreeSHA = await createTree(
            owner,
            repo,
            baseTreeSHA,
            validatedFiles,
            token
        );

        // 5. Create commit
        console.log(`[git.ts] Creating commit...`);
        const commitSHA = await createCommit(
            owner,
            repo,
            baseSHA,
            newTreeSHA,
            commitMessage,
            token
        );

        // 6. Update branch
        console.log(`[git.ts] Updating branch ${baseBranch} to ${commitSHA}...`);
        await updateBranch(owner, repo, baseBranch, commitSHA, token);

        return {
            commitSHA,
            repoUrl: `https://github.com/${owner}/${repo}`,
            branchUrl: `https://github.com/${owner}/${repo}/tree/${baseBranch}`,
        };
    } catch (error: any) {
        console.error("Error in pushFilesAsCommit:", error.response?.data || error.message);
        console.error("Failed Request URL:", error.config?.url);
        console.error("Failed Request Method:", error.config?.method);
        console.error("Status Code:", error.response?.status);

        // Log full response for 422 errors
        if (error.response?.status === 422) {
            console.error("422 Validation Error Details:");
            console.error("Response Body:", JSON.stringify(error.response?.data, null, 2));
            console.error("Request Body:", JSON.stringify(error.config?.data, null, 2));

            // Create user-friendly error message
            const errorMsg = error.response?.data?.message || 'Validation failed';
            const errors = error.response?.data?.errors || [];
            let detailedError = `GitHub API validation error: ${errorMsg}`;

            if (errors.length > 0) {
                detailedError += '\nDetails: ' + errors.map((e: any) =>
                    `${e.resource || 'unknown'}: ${e.message || e.code || JSON.stringify(e)}`
                ).join(', ');
            }

            throw new Error(detailedError);
        }

        // Provide helpful message for common errors
        if (error.response?.status === 409) {
            console.error("409 Conflict - This usually means the repository or branch already exists.");
            console.error("Repository:", `${owner}/${repo}`);
        }

        throw error;
    }
}