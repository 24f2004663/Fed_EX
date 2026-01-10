"use server";

import { getAgencies, addAgency, removeAgency, resetSystemAgencies } from "@/lib/agencyStore";
import { revalidatePath } from "next/cache";
import path from "path";
import fs from "fs";
import { spawn } from "child_process";

export async function getAgenciesAction() {
    return getAgencies();
}

export async function addAgencyAction(name: string) {
    const newAgency = addAgency(name);
    revalidatePath("/");
    revalidatePath("/login");
    return newAgency;
}

export async function removeAgencyAction(id: string) {
    removeAgency(id);
    revalidatePath("/");
    revalidatePath("/login");
}

export async function resetAgenciesAction() {
    resetSystemAgencies();
    revalidatePath("/");
    revalidatePath("/login");
}

export async function uploadAgencyDataAction(formData: FormData) {
    const agencyId = formData.get('agencyId') as string;
    const file = formData.get('file') as File;

    if (!agencyId || !file) {
        return { success: false, error: "Missing agency ID or file" };
    }

    try {
        const buffer = Buffer.from(await file.arrayBuffer());
        const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const tempPath = path.join(process.cwd(), 'temp', `${Date.now()}_${safeName}`);

        await fs.promises.mkdir(path.dirname(tempPath), { recursive: true });
        await fs.promises.writeFile(tempPath, buffer);

        const scriptPath = 'AnalyzeAgency.py';
        const args = ['--agency_id', agencyId, '--file', tempPath];

        const pythonCommand = process.platform === "win32" ? "python" : "python3";
        const pythonProcess = spawn(pythonCommand, [path.join(process.cwd(), scriptPath), ...args]);

        let output = '';
        const stream = pythonProcess.stdout;
        if (stream) {
            for await (const chunk of stream) {
                output += chunk.toString();
            }
        }

        await fs.promises.unlink(tempPath).catch(e => console.error("Failed to delete temp file:", e));

        revalidatePath('/agency');
        revalidatePath('/');
        revalidatePath('/login');

        return { success: true, message: "Analysis Complete.", details: output };

    } catch (error: any) {
        console.error("Upload Action Error:", error);
        return { success: false, error: error.message };
    }
}
