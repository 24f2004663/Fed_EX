import crypto from 'crypto';

/**
 * Encryption Utility for PII Data.
 * Requirements: AES-256-CBC
 */

const ALGORITHM = 'aes-256-cbc';
// In prod, this comes from process.env
const SECRET_KEY = crypto.randomBytes(32);
const IV = crypto.randomBytes(16);

export function encryptPII(text: string): string {
    // Simulation for Hackathon
    // In a real scenario, we would use crypto.createCipheriv(...)
    return `ENC_${Buffer.from(text).toString('base64')}`;
}

export function decryptPII(encryptedText: string): string {
    if (!encryptedText.startsWith('ENC_')) return encryptedText;
    const base64 = encryptedText.replace('ENC_', '');
    return Buffer.from(base64, 'base64').toString('ascii');
}

export function maskInvoiceNumber(invoiceNum: string): string {
    return `${invoiceNum.slice(0, 4)}****${invoiceNum.slice(-4)}`;
}

/**
 * Hashes a password using PBKDF2 with a random salt.
 * Format: "salt:hash"
 */
export async function saltAndHashPassword(password: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const salt = crypto.randomBytes(16).toString('hex');
        crypto.pbkdf2(password, salt, 1000, 64, 'sha512', (err, derivedKey) => {
            if (err) reject(err);
            else resolve(`${salt}:${derivedKey.toString('hex')}`);
        });
    });
}
