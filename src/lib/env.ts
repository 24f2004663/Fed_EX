import { z } from 'zod';

const envSchema = z.object({
    DATABASE_URL: z.string().url(),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
    // Security for Render/Vercel (Required in Production)
    AUTH_TRUST_HOST: z.string().optional().refine((val) => {
        if (process.env.NODE_ENV === 'production' && !val) return false;
        return true;
    }, "AUTH_TRUST_HOST is required in production"),
    NEXTAUTH_URL: z.string().url().optional(),
    NEXTAUTH_SECRET: z.string().min(1).optional()
});

const env = envSchema.safeParse(process.env);

if (!env.success) {
    console.error('❌ Invalid environment variables:', env.error.format());
    throw new Error('Invalid environment variables');
}

export const config = env.data;
