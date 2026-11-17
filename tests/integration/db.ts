import { Pool, type PoolClient } from "pg";
import { randomUUID } from "node:crypto";

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("TEST_DATABASE_URL is not set (run scripts/test-db.sh)");

export const pool = new Pool({ connectionString: url, max: 4 });

/** Run SQL as the database owner (bypasses RLS) — test setup only. */
export async function admin<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  const res = await pool.query(sql, params);
  return res.rows as T[];
}

/**
 * Run SQL exactly like a PostgREST request from a signed-in user:
 * role `authenticated` (or `anon` when uid is null) with the JWT subject set.
 */
export async function as<T = Record<string, unknown>>(
  uid: string | null,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const client: PoolClient = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`set local role ${uid ? "authenticated" : "anon"}`);
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [uid ?? ""]);
    const res = await client.query(sql, params);
    await client.query("commit");
    return res.rows as T[];
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}

export async function createUser(email: string, name: string, confirmed = true) {
  const id = randomUUID();
  await admin(
    "insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values ($1, $2, $3, $4)",
    [id, email, { full_name: name }, confirmed ? new Date() : null],
  );
  return id;
}

export async function rpc<T = unknown>(uid: string | null, fn: string, args: Record<string, unknown> = {}) {
  const keys = Object.keys(args);
  const sql = `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as r`;
  const rows = await as<{ r: T }>(uid, sql, keys.map((k) => args[k]));
  return rows[0]?.r as T;
}
