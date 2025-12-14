import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * Type definition for a subtask
 */
export interface Subtask {
    id: string;
    title: string;
    status: 'pending' | 'completed' | 'in-progress';
    completedAt?: string;
    notes?: string;
}

/**
 * Type definition for a task
 */
export interface Task {
    id: string | number;
    title: string;
    status: 'pending' | 'completed' | 'in-progress';
    subtasks?: Subtask[];
    createdAt?: string;
    updatedAt?: string;
    description?: string;
    dependencies?: (string | number)[];
    group?: 'core' | 'ui' | 'functionality';
    notes?: string;
}

/**
 * Type definition for the tasks.json structure
 */
export interface TasksData {
    tasks: Task[];
    lastUpdated?: string;
}

/**
 * Options for updating a subtask
 */
export interface UpdateSubtaskOptions {
    tasksPath?: string;
    subtaskId: string;
    completionTime?: string;
    notes?: string;
}

/**
 * Default path for the tasks.json file
 */
const DEFAULT_TASKS_PATH = './tasks.json';

/**
 * Updates a tasks.json file by marking a specific subtask as completed
 * 
 * @param options - Configuration options for updating the subtask
 * @returns The updated tasks data
 * @throws Error if file doesn't exist, subtask not found, or JSON is malformed
 */
export function updateSubtaskCompleted(options: UpdateSubtaskOptions): TasksData {
    const {
        tasksPath = DEFAULT_TASKS_PATH,
        subtaskId,
        completionTime = new Date().toISOString(),
        notes
    } = options;

    // Check if the tasks.json file exists
    if (!existsSync(tasksPath)) {
        throw new Error(`Tasks file not found at path: ${tasksPath}`);
    }

    let tasksData: TasksData;

    try {
        // Read and parse the existing tasks.json file
        const fileContent = readFileSync(tasksPath, 'utf-8');
        tasksData = JSON.parse(fileContent) as TasksData;
    } catch (error) {
        throw new Error(`Failed to parse tasks.json file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Validate the structure
    if (!tasksData.tasks || !Array.isArray(tasksData.tasks)) {
        throw new Error('Invalid tasks.json structure: missing or invalid tasks array');
    }

    // First, try to find a subtask with the matching ID
    let subtaskFound = false;
    const updatedTasks = tasksData.tasks.map(task => {
        // Check if this task has subtasks
        if (task.subtasks && task.subtasks.length > 0) {
            const updatedSubtasks = task.subtasks.map(subtask => {
                if (subtask.id === subtaskId) {
                    subtaskFound = true;
                    return {
                        ...subtask,
                        status: 'completed' as const,
                        completedAt: completionTime,
                        ...(notes && { notes })
                    };
                }
                return subtask;
            });

            // Check if the task status should be updated based on subtasks
            const allSubtasksCompleted = updatedSubtasks.every(st => st.status === 'completed');
            const anySubtaskInProgress = updatedSubtasks.some(st => st.status === 'in-progress');

            let newTaskStatus: 'pending' | 'completed' | 'in-progress' = task.status as 'pending' | 'completed' | 'in-progress';
            if (allSubtasksCompleted && task.status !== 'completed') {
                newTaskStatus = 'completed';
            } else if (anySubtaskInProgress && task.status === 'pending') {
                newTaskStatus = 'in-progress';
            }

            return {
                ...task,
                subtasks: updatedSubtasks,
                status: newTaskStatus,
                updatedAt: new Date().toISOString()
            };
        }

        // If this task itself matches the subtaskId, update the task directly
        if (task.id.toString() === subtaskId.toString()) {
            subtaskFound = true;
            return {
                ...task,
                status: 'completed' as const,
                updatedAt: new Date().toISOString(),
                ...(notes && {
                    // Add notes to the task if it doesn't have subtasks
                    ...(task.subtasks === undefined || task.subtasks.length === 0) && {
                        // Add a notes field if it doesn't exist, or append to existing notes
                        notes: task.notes ? `${task.notes}\n${notes}` : notes
                    }
                })
            };
        }

        return task;
    });

    if (!subtaskFound) {
        throw new Error(`Task or subtask with ID "${subtaskId}" not found`);
    }

    // Create the updated tasks data
    const updatedTasksData: TasksData = {
        ...tasksData,
        tasks: updatedTasks,
        lastUpdated: new Date().toISOString()
    };

    // Write the updated data back to the file
    try {
        writeFileSync(tasksPath, JSON.stringify(updatedTasksData, null, 2), 'utf-8');
    } catch (error) {
        throw new Error(`Failed to write updated tasks.json file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return updatedTasksData;
}

/**
 * Creates a new tasks.json file with the specified initial data
 * 
 * @param tasksPath - Path where to create the tasks.json file
 * @param initialData - Initial tasks data
 * @returns The created tasks data
 */
export function createTasksFile(
    tasksPath: string = DEFAULT_TASKS_PATH,
    initialData?: Partial<TasksData>
): TasksData {
    const tasksData: TasksData = {
        tasks: initialData?.tasks || [],
        lastUpdated: new Date().toISOString(),
        ...initialData
    };

    try {
        writeFileSync(tasksPath, JSON.stringify(tasksData, null, 2), 'utf-8');
    } catch (error) {
        throw new Error(`Failed to create tasks.json file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return tasksData;
}

/**
 * Reads and returns the tasks data from a tasks.json file
 * 
 * @param tasksPath - Path to the tasks.json file
 * @returns The tasks data
 * @throws Error if file doesn't exist or JSON is malformed
 */
export function readTasksFile(tasksPath: string = DEFAULT_TASKS_PATH): TasksData {
    if (!existsSync(tasksPath)) {
        throw new Error(`Tasks file not found at path: ${tasksPath}`);
    }

    try {
        const fileContent = readFileSync(tasksPath, 'utf-8');
        return JSON.parse(fileContent) as TasksData;
    } catch (error) {
        throw new Error(`Failed to read or parse tasks.json file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}