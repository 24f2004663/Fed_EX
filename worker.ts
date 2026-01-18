import { allocationWorker, ingestionWorker } from './src/workers/python-worker';

console.log('🚀 Worker Service Started...');

allocationWorker.on('completed', (job: any) => {
    console.log(`✅ Allocation Job ${job.id} completed!`);
});

allocationWorker.on('failed', (job: any, err: any) => {
    console.error(`❌ Allocation Job ${job?.id} failed:`, err);
});

ingestionWorker.on('completed', (job: any) => {
    console.log(`✅ Ingestion Job ${job.id} completed!`);
});

// Keep process alive
process.stdin.resume();
