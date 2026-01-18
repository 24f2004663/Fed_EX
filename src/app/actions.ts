"use server";

import prisma from "@/lib/db";
import { revalidatePath } from "next/cache";
import { runPythonBackground } from "@/lib/python";
import { allocationQueue, ingestionQueue } from "@/lib/queue"; // Added imports

import { auth } from "@/auth"; // Added import

// Removed hardcoded CURRENT_USER_ID

// ... inside functions ...

// --- INLINED UTILS FOR SAFETY ---
type ActionResult<T = undefined> = {
    success: boolean;
    data?: T;
    error?: string;
};

function ok<T>(data?: T): ActionResult<T> {
    return { success: true, data };
}

function fail(message: string): ActionResult {
    return { success: false, error: message };
}
// --------------------------------

/* ------------------ STATUS UPDATE ------------------ */
export async function updateCaseStatus(
    caseId: string,
    newStatus: string,
    note: string
) {
    try {
        const session = await auth();
        if (!session?.user?.id) return fail("Unauthorized");
        const actorId = session.user.id;

        let slaStatus = undefined;
        let scoreBoost = 0;

        if (newStatus === "WIP") slaStatus = "ACTIVE";
        if (newStatus === "DISPUTE") slaStatus = "PAUSED";
        // PTP handled separately but kept here for generic updates if needed
        if (newStatus === "PTP") {
            slaStatus = "ACTIVE";
            scoreBoost = 15;
        }
        if (newStatus === "PAID") slaStatus = "COMPLETED";

        await prisma.case.update({
            where: { id: caseId },
            data: {
                status: newStatus,
                ...(slaStatus && { currentSLAStatus: slaStatus }),
                ...(scoreBoost > 0 && { aiScore: { increment: scoreBoost } })
            }
        });

        await prisma.auditLog.create({
            data: {
                caseId,
                actorId: actorId,
                action: "STATUS_CHANGE",
                details: note
            }
        });

        revalidatePath("/agency");
        revalidatePath("/");

        return ok();
    } catch (e) {
        console.error(e);
        return fail("Failed to update case");
    }
}



/* ------------------ AGENCY REJECT ------------------ */
export async function agencyRejectCase(
    caseId: string,
    reason: string,
    agencyId: string
) {
    try {
        await prisma.case.update({
            where: { id: caseId },
            data: {
                status: "QUEUED",
                assignedToId: null,
                assignedAt: null,
                currentSLAStatus: "PENDING"
            }
        });

        await prisma.auditLog.create({
            data: {
                caseId,
                actorId: agencyId,
                action: "REJECT",
                details: reason
            }
        });

        // ASYNC: Add to Queue instead of blocking wait
        await allocationQueue.add('reallocate-job', {
            caseId,
            rejectedBy: agencyId,
            args: ['--mode', 'reallocate', '--case_id', caseId, '--rejected_by', agencyId]
        });
        console.log(`[Job Enqueued] Reallocation for case ${caseId}`);

        revalidatePath("/agency");
        revalidatePath("/");

        return ok();
    } catch (e) {
        console.error(e);
        return fail("Reject failed");
    }
}

/* ------------------ LOG PTP ------------------ */
export async function logPTP(caseId: string) {
    try {
        const session = await auth();
        if (!session?.user?.id) return fail("Unauthorized");
        const actorId = session.user.id;

        await prisma.case.update({
            where: { id: caseId },
            data: {
                status: "PTP",
                currentSLAStatus: "ACTIVE",
                aiScore: { increment: 15 }
            }
        });

        await prisma.auditLog.create({
            data: {
                caseId,
                actorId: actorId,
                action: "PTP",
                details: "Promise to Pay logged"
            }
        });

        revalidatePath("/agency");
        revalidatePath("/");

        return ok();
    } catch (e) {
        console.error(e);
        return fail("PTP failed");
    }
}

/* ------------------ UPLOAD PROOF ------------------ */
export async function uploadProof(caseId: string, filename: string) {
    try {
        const session = await auth();
        if (!session?.user?.id) return fail("Unauthorized");
        const actorId = session.user.id;

        await prisma.case.update({
            where: { id: caseId },
            data: { status: 'PAID', currentSLAStatus: 'COMPLETED' }
        });

        await prisma.auditLog.create({
            data: {
                caseId,
                actorId: actorId,
                action: "PROOF",
                details: filename
            }
        });

        await runPythonBackground("Proof.py", ["--file", `"${filename}"`]);

        // SQLite WAL Propagation Buffer
        await new Promise(resolve => setTimeout(resolve, 500));

        revalidatePath("/agency");
        revalidatePath("/");

        return ok();
    } catch (e) {
        console.error(e);
        return fail("Upload failed");
    }
}

/* ------------------ INGEST ------------------ */
export async function ingestMockData() {
    try {
        console.log("[Action] Starting direct ingestion...");
        await runPythonBackground("Allocation.py", ["--mode", "ingest"]);

        revalidatePath("/");
        revalidatePath("/agency");
        return ok();
    } catch (e) {
        console.error("Ingestion failed:", e);
        return fail("Ingestion failed");
    }
}

/* ------------------ RESET ------------------ */
export async function resetDatabase() {
    try {
        await prisma.auditLog.deleteMany();
        await prisma.sLA.deleteMany();
        await prisma.case.deleteMany();
        await prisma.invoice.deleteMany();
        revalidatePath('/');
        return ok();
    } catch {
        return fail("Reset failed");
    }
}
/* ------------------ DEBUG TRUTH TEST ------------------ */
export async function testAction() {
    try {
        const count = await prisma.case.count();
        console.log("CASE COUNT:", count);
        return { success: true, count };
    } catch (e) {
        console.error("Test action failed", e);
        return { success: false, error: "DB Check Failed" };
    }
}

/* ------------------ TEST & SYNC EXTERNAL DB ------------------ */
import { Client } from 'pg';

export async function testAndSyncDatabase(config: any) {
    let client: Client | null = null;
    try {
        if (!config.host || !config.username) {
            return { success: false, error: "Invalid credentials" };
        }

        console.log(`[Sync] Attempting connection to external DB at ${config.host} ...`);

        // 1. Try Real Connection
        // NOTE: We wrap this in a timeout promise to avoid hanging forever if firewall drops packets
        const connectionPromise = new Promise<void>(async (resolve, reject) => {
            try {
                client = new Client({
                    user: config.username,
                    host: config.host,
                    database: config.database,
                    password: config.password,
                    port: parseInt(config.port || '5432'),
                    connectionTimeoutMillis: 5000, // 5s timeout
                    // FIX: Disable SSL validation for demo Docker connections
                    ssl: false
                });
                await client.connect();
                resolve();
            } catch (e) {
                reject(e);
            }
        });

        await connectionPromise;

        // 2. Real Data Sync
        console.log("[Sync] Fetching invoices from external 'invoices' table...");

        // @ts-ignore
        const res = await client.query('SELECT * FROM invoices WHERE status = $1', ['OPEN']);
        console.log(`[Sync] Found ${res.rowCount} invoices in external DB.`);

        // 3. Sync to Local Prisma DB
        for (const row of res.rows) {
            // Map External Columns (invoice_number, amount) -> Internal Schema
            const inv = await prisma.invoice.upsert({
                where: { invoiceNumber: row.invoice_number },
                create: {
                    invoiceNumber: row.invoice_number,
                    amount: parseFloat(row.amount), // decimal -> float
                    status: 'OPEN',
                    dueDate: new Date(new Date().setDate(new Date().getDate() + 30)), // Default +30 days
                    customerID: `CUST-${row.invoice_number.split('-')[1]}`,
                    customerName: `External Client ${row.invoice_number}`,
                    region: 'NA'
                },
                update: {
                    amount: parseFloat(row.amount)
                }
            });

            // Auto-create Case Entry
            await prisma.case.upsert({
                where: { invoiceId: inv.id },
                create: {
                    invoiceId: inv.id,
                    status: 'NEW',
                    priority: parseFloat(row.amount) > 40000 ? 'HIGH' : 'MEDIUM',
                    aiScore: parseFloat(row.amount) > 40000 ? 92 : 75,
                    recoveryProbability: parseFloat(row.amount) > 40000 ? 0.92 : 0.75,
                    currentSLAStatus: 'PENDING',
                    assignedToId: null
                },
                update: {}
            });
        }

        revalidatePath("/");

        if (client) {
            // @ts-ignore
            await client.end();
        }
        return { success: true };

    } catch (error: any) {
        if (client) {
            // @ts-ignore
            await client.end().catch(() => { });
        }

        console.warn(`[Sync] Real connection failed: ${error.message}.`);

        // Fallback for DEMO: Only if user explicitly enters "demo"
        if (config.host === 'demo') {
            console.log("[Sync] Demo mode activated.");
            await new Promise(resolve => setTimeout(resolve, 1500));
            await ingestMockData();
            return { success: true };
        }

        return { success: false, error: `Connection Failed: ${error.message}` };
    }
}

export async function triggerAllocation() {
    try {
        console.log("[Action] Triggering allocation...");
        await runPythonBackground("Allocation.py", ["--mode", "allocate"]);

        revalidatePath("/");
        revalidatePath("/agency");
        return ok();
    } catch (e) {
        console.error("Allocation trigger failed:", e);
        return fail("Allocation failed");
    }
}
