import fs from 'node:fs/promises';
import { Pool } from 'pg';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const pool=new Pool({connectionString:process.env.DATABASE_URL});
const client=await pool.connect();
try {
  await client.query('BEGIN');
  await client.query("SELECT pg_advisory_xact_lock(hashtext('rn-dedicated-live-migrations'))");
  await client.query('CREATE TABLE IF NOT EXISTS rn_live_service_migrations(name text PRIMARY KEY, applied_at timestamptz DEFAULT now())');
  for (const name of ['20260930140000_live_runtime','20260930160000_live_commands']) {
    const exists=await client.query('SELECT 1 FROM rn_live_service_migrations WHERE name=$1',[name]);
    if (!exists.rowCount) {
      const sql=await fs.readFile(new URL(`../../netlify/database/migrations/${name}/migration.sql`,import.meta.url),'utf8');
      await client.query(sql);
      await client.query('INSERT INTO rn_live_service_migrations(name) VALUES($1)',[name]);
    }
  }
  await client.query('CREATE TABLE IF NOT EXISTS rn_live_media_v1(run_id text NOT NULL, media_id text NOT NULL, payload jsonb NOT NULL, PRIMARY KEY(run_id,media_id))');
  await client.query('COMMIT');
  console.log('Dedicated live schema ready');
} catch(error){await client.query('ROLLBACK');throw error;} finally {client.release();await pool.end();}
