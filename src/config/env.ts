/**
 * Typed environment config for OpenNano-CRM.
 * Centralizes defaults so the rest of the codebase never reads process.env directly.
 */

export const env = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: process.env.DATABASE_URL ?? "postgres://nanobliss:nanobliss@localhost:5432/nanobliss",
  jwtSecret: process.env.JWT_SECRET ?? "dev-secret-change-me",
  jwtExpiresInSec: 60 * 60 * 24 * 7, // 7 days
} as const;

export type Env = typeof env;
