import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { exec } from 'child_process';
import util from 'util';
import path from 'path';
import { EventEmitter } from 'events';

const execAsync = util.promisify(exec);

const JOB_QUEUES = {
    ALLOCATION: 'allocation-queue',
    INGESTION: 'ingestion-queue',
};

// --- REDIS CONNECTION LOGIC ---
const redisUrl = process.env.REDIS_URL;
const redisHost = process.env.REDIS_HOST;
const redisPort = process.env.REDIS_PORT;

// Only connect if explicit config is present
const isRedisConfigured = !!redisUrl || !!redisHost;

let connection: any;
if (isRedisConfigured) {
    if (redisUrl) {
        // Render / Production URL style
        connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
    } else {
        // Local / Env var style
        connection = {
            host: redisHost || 'localhost',
            port: parseInt(redisPort || '6379'),
        };
    }
} else {
    console.warn('[Worker] No Redis configuration found (REDIS_URL or REDIS_HOST). Workers will be disabled.');
}

async function executePythonScript(scriptName: string, args: string[] = []) {
    try {
        const scriptPath = path.resolve(process.cwd(), scriptName);
        const pythonCommand = process.platform === 'win32' ? 'python' : 'python3';

        // Construct args string safely
        const argsStr = args.map(a => `"${a}"`).join(' ');

        console.log(`Starting background job: ${scriptName} [${argsStr}]`);

        const { stdout, stderr } = await execAsync(`${pythonCommand} "${scriptPath}" ${argsStr}`, {
            env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL || "postgresql://admin:adminpassword@localhost:5432/fedex_recovery" }
        });

        if (stderr) {
            console.warn(`Script stderr: ${stderr}`);
        }

        console.log(`Job completed: ${scriptName}`);
        return stdout;
    } catch (error) {
        console.error(`Job failed: ${scriptName}`, error);
        throw error;
    }
}

// Ensure we don't crash if Redis is missing
function createWorker(queueName: string, processor: (job: Job) => Promise<any>): any {
    if (!isRedisConfigured) {
        return new EventEmitter(); // Return dummy emitter to satisfy listeners in worker.ts
    }
    return new Worker(queueName, processor, { connection });
}

// Worker for Allocation Jobs
export const allocationWorker = createWorker(
    JOB_QUEUES.ALLOCATION,
    async (job: Job) => {
        console.log(`Processing Allocation Job ${job.id}`);
        // Extract args from job
        const args = job.data.args || [];
        await executePythonScript('Allocation.py', args);
        return { status: 'completed' };
    }
);

// Worker for Ingestion Jobs
export const ingestionWorker = createWorker(
    JOB_QUEUES.INGESTION,
    async (job: Job) => {
        console.log(`Processing Ingestion Job ${job.id}`);
        const args = job.data.args || [];
        // Ingestion also maps to Allocation.py --mode ingest for this project
        await executePythonScript('Allocation.py', args);
        return { status: 'ingested' };
    }
);
