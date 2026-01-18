import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import fs from 'fs';
import path from 'path';
import { runPythonBackground } from '@/lib/python';
import { saltAndHashPassword } from '@/lib/encryption';

// Force dynamic needed to read local files in some Next.js configs
export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        console.log("Starting Seed Process...");
        const results = [];

        // 1. Seed Agencies
        const agenciesFile = path.join(process.cwd(), 'data', 'agencies.json');
        if (fs.existsSync(agenciesFile)) {
            const raw = fs.readFileSync(agenciesFile, 'utf-8');
            const agencies = JSON.parse(raw);

            for (const agency of agencies) {
                // Capacity Logic
                let capacity = 3;
                if (agency.score >= 85) capacity = 5;
                else if (agency.score >= 75) capacity = 4;

                await prisma.agency.upsert({
                    where: { id: agency.id },
                    update: { name: agency.name, capacity },
                    create: {
                        id: agency.id,
                        name: agency.name,
                        capacity,
                        region: 'NA',
                        status: 'ACTIVE'
                    }
                });

                // Performance History
                await prisma.agencyPerformance.deleteMany({ where: { agencyId: agency.id } });

                const today = new Date();
                for (let i = 0; i < agency.history.length; i++) {
                    const score = agency.history[i];
                    const monthDate = new Date();
                    monthDate.setMonth(today.getMonth() - (agency.history.length - i));
                    const monthStr = monthDate.toISOString().slice(0, 7);

                    await prisma.agencyPerformance.create({
                        data: {
                            agencyId: agency.id,
                            month: monthStr,
                            recoveryRate: score,
                            slaAdherence: score,
                            avgDSO: 45 - (score - 60) * 0.5
                        }
                    });
                }
                results.push(`Seeded Agency: ${agency.name}`);
            }
        } else {
            results.push("WARNING: agencies.json not found!");
        }

        // 2. Seed Users
        const passwordHash = await saltAndHashPassword('password'); // Default password

        // Admin
        const adminId = 'user-admin';
        await prisma.user.upsert({
            where: { id: adminId },
            update: {},
            create: {
                id: adminId,
                email: 'admin@fedex.com',
                passwordHash,
                role: 'ADMIN',
                name: 'System Admin'
            }
        });
        results.push("Seeded Admin User");

        // Agency Users
        const agencyUsers = [
            { id: 'user-agency-alpha', email: 'alpha@agency.com', name: 'Alpha Agent' },
            { id: 'user-agency-beta', email: 'beta@agency.com', name: 'Beta Agent' },
            { id: 'user-agency-gamma', email: 'gamma@agency.com', name: 'Gamma Agent' }
        ];

        for (const u of agencyUsers) {
            await prisma.user.upsert({
                where: { id: u.id },
                update: { agencyId: u.id },
                create: {
                    id: u.id,
                    email: u.email,
                    passwordHash,
                    role: 'AGENCY_ADMIN',
                    name: u.name,
                    agencyId: u.id
                }
            });
            results.push(`Seeded User: ${u.name}`);
        }

        // 3. Trigger Ingestion (Cases)
        // We call the Python script directly here
        console.log("Triggering Allocation.py ingest...");
        await runPythonBackground("Allocation.py", ["--mode", "ingest"]);
        results.push("Triggered Python Ingestion (Background)");

        return NextResponse.json({
            success: true,
            message: "Seeding initiated successfully",
            steps: results
        });

    } catch (error: any) {
        console.error("Seed Failed:", error);
        return NextResponse.json({
            success: false,
            error: error.message,
            stack: error.stack
        }, { status: 500 });
    }
}
