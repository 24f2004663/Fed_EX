"use server";

import prisma from "@/lib/db";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";

// --- Types ---
export type AdminActionResult<T = undefined> = {
    success: boolean;
    data?: T;
    error?: string;
};

// --- Helpers ---
const ok = <T>(data?: T): AdminActionResult<T> => ({ success: true, data });
const fail = (error: string): AdminActionResult => ({ success: false, error });

function assertAdmin(session: any) {
    if (!session?.user) throw new Error("Unauthorized");
    // Strict Admin Check (keeping ENTERPRISE for demo compatibility)
    if (session.user.role !== 'ADMIN' && session.user.role !== 'ENTERPRISE') {
        throw new Error("Unauthorized: Admin Access Required");
    }
}

async function getAdminUser() {
    const session = await auth();
    assertAdmin(session);
    return session!.user;
}

async function audit(action: string, details: string, caseId?: string) {
    const user = await getAdminUser();
    // Audit logic...
    console.log(`[AUDIT] [${user.email}] ${action}: ${details}`);
}

// --- Actions ---

export async function getAgenciesAdmin() {
    try {
        await getAdminUser();
        // Fetch all, including inactive (for history), but maybe separate lists?
        // Let's fetch all and let UI filter.
        const agencies = await prisma.agency.findMany({
            orderBy: { name: 'asc' },
            include: {
                performance: {
                    orderBy: { month: 'desc' },
                    take: 1 // Get latest for table display
                }
            }
        });
        return ok(agencies);
    } catch (e: any) {
        console.error("[getAgenciesAdmin] Failed:", e);
        return fail(e.message || "Failed to fetch agencies");
    }
}

export async function addAgencyAdmin(name: string, region: string, capacity: number) {
    try {
        await getAdminUser();

        await prisma.agency.create({
            data: {
                name,
                region,
                capacity,
                status: 'ACTIVE'
            }
        });

        await audit("CREATE_AGENCY", `Created agency ${name}`);
        revalidatePath('/admin/agencies');
        return ok();
    } catch (e: any) {
        console.error(e);
        return fail("Failed to create agency");
    }
}

export async function updateAgencyAdmin(id: string, data: { name?: string, capacity?: number, status?: string }) {
    try {
        await getAdminUser();

        await prisma.agency.update({
            where: { id },
            data
        });

        await audit("UPDATE_AGENCY", `Updated agency ${id} with ${JSON.stringify(data)}`);
        revalidatePath('/admin/agencies');
        return ok();
    } catch (e: any) {
        return fail("Update failed");
    }
}

export async function deleteAgencyAdmin(id: string) {
    try {
        await getAdminUser();

        // Soft Delete
        await prisma.agency.update({
            where: { id },
            data: {
                status: 'INACTIVE',
                deletedAt: new Date()
            }
        });

        await audit("DELETE_AGENCY", `Soft deleted agency ${id}`);
        revalidatePath('/admin/agencies');
        return ok();
    } catch (e: any) {
        return fail("Delete failed");
    }
}

export async function getAgencyDetailsAdmin(id: string) {
    try {
        await getAdminUser();
        const agency = await prisma.agency.findUnique({
            where: { id },
            include: {
                performance: {
                    orderBy: { month: 'desc' },
                    take: 12 // Last year
                }
            }
        });
        return agency;
    } catch (e) {
        return null;
    }
}

export async function updateAgencyPerformance(id: string, month: string, metrics: { recoveryRate: number, slaAdherence: number }) {
    try {
        await getAdminUser();

        const data = {
            recoveryRate: metrics.recoveryRate,
            slaAdherence: metrics.slaAdherence,
            avgDSO: 45 - (metrics.recoveryRate - 60) * 0.5 // Derived simple logic
        };

        // Use upsert thanks to @@unique([agencyId, month])
        await prisma.agencyPerformance.upsert({
            where: {
                agencyId_month: {
                    agencyId: id,
                    month: month
                }
            },
            update: data,
            create: {
                agencyId: id,
                month: month,
                ...data
            }
        });

        await audit("UPDATE_PERFORMANCE", `Updated metrics for ${id} in ${month}`);
        revalidatePath('/admin/agencies');
        return ok();
    } catch (e: any) {
        console.error(e);
        return fail("Performance update failed");
    }
}
