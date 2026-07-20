import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto";
import { promisify } from "node:util";

import { users } from "@wakil/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "../features/types";

// promisify resolves to scrypt's no-options overload; re-type it so the
// work-factor options can be passed through with a Promise<Buffer> result.
const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

/** Minimum password length; short enough to be usable, long enough to matter. */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * The single email + password contract used by both the sign-in server
 * action and the Auth.js credentials provider. Emails are trimmed and
 * lowercased so lookups and inserts share one canonical form.
 */
export const credentialsInputSchema = z.object({
  email: z.preprocess(
    (value) =>
      String(value ?? "")
        .trim()
        .toLowerCase(),
    z.email({ error: "أدخل بريدًا إلكترونيًا صحيحًا." }),
  ),
  password: z
    .string({ error: "أدخل كلمة المرور." })
    .min(MIN_PASSWORD_LENGTH, `كلمة المرور يجب أن تكون ${MIN_PASSWORD_LENGTH} أحرف على الأقل.`),
});

export type CredentialsInput = z.infer<typeof credentialsInputSchema>;

// scrypt work factors. cost=2^15 keeps hashing well under a second on a
// server core. scrypt needs ~128 * cost * blockSize bytes (32 MiB here),
// which sits at Node's default maxmem ceiling, so maxmem is set explicitly
// with headroom below.
const SCRYPT_COST = 32_768;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELISM = 1;
const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_SALT_BYTES = 16;

/** Options with maxmem sized to 2x the memory the given work factors require. */
function scryptOptions(cost: number, blockSize: number, parallelism: number): ScryptOptions {
  return { N: cost, maxmem: 256 * cost * blockSize, p: parallelism, r: blockSize };
}

/** The identity fields Auth.js persists into the session; never the hash. */
export type CredentialsUser = {
  id: string;
  email: string;
  name: string | null;
};

/**
 * Produces a self-describing `scrypt$cost$r$p$salt$hash` string so the
 * verifier can read the parameters that were in force when the hash was
 * written, allowing the cost to be raised later without breaking old hashes.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SCRYPT_SALT_BYTES);
  const derived = await scrypt(
    password,
    salt,
    SCRYPT_KEY_LENGTH,
    scryptOptions(SCRYPT_COST, SCRYPT_BLOCK_SIZE, SCRYPT_PARALLELISM),
  );
  return [
    "scrypt",
    SCRYPT_COST,
    SCRYPT_BLOCK_SIZE,
    SCRYPT_PARALLELISM,
    salt.toString("hex"),
    derived.toString("hex"),
  ].join("$");
}

/** Constant-time verification against a stored `hashPassword` string. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, cost, blockSize, parallelism, saltHex, hashHex] = parts;
  const salt = Buffer.from(saltHex ?? "", "hex");
  const expected = Buffer.from(hashHex ?? "", "hex");
  if (salt.length === 0 || expected.length === 0) return false;

  const derived = await scrypt(
    password,
    salt,
    expected.length,
    scryptOptions(Number(cost), Number(blockSize), Number(parallelism)),
  );
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

type UserRow = {
  id: string;
  email: string;
  name: string | null;
  passwordHash: string | null;
};

/** Tenant-agnostic lookup by the unique email; emails are normalized upstream. */
export async function getUserByEmail(db: Database, email: string): Promise<UserRow | null> {
  const row = (
    await db
      .select({
        email: users.email,
        id: users.id,
        name: users.name,
        passwordHash: users.passwordHash,
      })
      .from(users)
      .where(eq(users.email, email))
      .limit(1)
  )[0];
  return row ?? null;
}

/**
 * Creates a password account. `onConflictDoNothing` keeps concurrent
 * first-time submissions from failing the unique email index; the caller
 * always verifies the password afterwards through the credentials provider.
 */
export async function createCredentialsUser(
  db: Database,
  email: string,
  password: string,
): Promise<void> {
  const passwordHash = await hashPassword(password);
  await db
    .insert(users)
    .values({ email, emailVerified: new Date(), passwordHash })
    .onConflictDoNothing();
}

/** Returns the session identity only when the password matches the stored hash. */
export async function verifyCredentials(
  db: Database,
  email: string,
  password: string,
): Promise<CredentialsUser | null> {
  const user = await getUserByEmail(db, email);
  if (!user?.passwordHash) return null;
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return null;
  return { email: user.email, id: user.id, name: user.name };
}
