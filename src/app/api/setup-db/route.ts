import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import util from 'util';

const execAsync = util.promisify(exec);

export async function GET() {
    try {
        console.log("Starting DB Push...");
        // Use the global prisma binary we installed in Dockerfile
        // --skip-generate is CRITICAL to avoid writing to read-only node_modules
        // --accept-data-loss is risky but needed if schema changed drastically (useful for dev)
        const command = 'prisma db push --skip-generate --accept-data-loss';

        const { stdout, stderr } = await execAsync(command);

        console.log("DB Push Output:", stdout);
        if (stderr) console.error("DB Push Warning/Error:", stderr);

        return NextResponse.json({
            success: true,
            message: "Database schema pushed successfully!",
            output: stdout,
            warnings: stderr
        });
    } catch (error: any) {
        console.error("Migration Failed:", error);
        return NextResponse.json({
            success: false,
            error: error.message,
            stack: error.stack
        }, { status: 500 });
    }
}
