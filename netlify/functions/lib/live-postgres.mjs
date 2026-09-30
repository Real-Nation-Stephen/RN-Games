/** Opt-in live storage. Platform assets and pre-existing Blobs rooms are untouched. */
import { getDb } from './db.mjs';
import { randomUUID } from 'node:crypto';

export function postgresLiveEnabled() {
  // Functions v2 runtime variables may live in Netlify.env rather than process.env.
  const backend = globalThis.Netlify?.env?.get('LIVE_STATE_BACKEND') ?? process.env.LIVE_STATE_BACKEND;
  return backend === 'postgres' && !['memory','file'].includes(process.env.LIVE_STORE_DRIVER) && !globalThis.__RN_LIVE_TEST__?.store;
}
export const isPostgresRun = run => run?.storageBackend === 'postgres-v1';
const codeOf = code => String(code || '').trim().toUpperCase();
async function query(sql, params) { return (await getDb()).pool.query(sql, params); }
export async function readPostgresRun(code, includePresence = false) {
  const { rows } = await query(includePresence
    ? `SELECT state, snapshot, revision,
        (SELECT coalesce(jsonb_object_agg(participant_id,jsonb_build_object('at',last_seen,'readyAttempt',ready_attempt)),'{}')
         FROM rn_live_presence_v1 p WHERE p.code=r.code) AS presence
       FROM rn_live_runs_v1 r WHERE code=$1`
    : 'SELECT state, snapshot, revision FROM rn_live_runs_v1 WHERE code=$1',[codeOf(code)]);
  const row=rows[0];
  if (row?.presence) for (const [id, presence] of Object.entries(row.presence)) {
    if (row.state.participants?.[id]) Object.assign(row.state.participants[id], {lastSeen:presence.at,readyAttempt:presence.readyAttempt});
  }
  return row ? {data:{...row.state,snapshot:row.snapshot,storageBackend:'postgres-v1'},etag:String(row.revision),storageBackend:'postgres-v1'} : null;
}
export async function createPostgresRun(code,run) {
  const {snapshot,...state}=run;state.storageBackend='postgres-v1';state.readinessRequired=true;
  const {rowCount}=await query('INSERT INTO rn_live_runs_v1(code,state,snapshot,revision) VALUES($1,$2::jsonb,$3::jsonb,$4) ON CONFLICT DO NOTHING',[codeOf(code),JSON.stringify(state),JSON.stringify(snapshot),state.revision||1]);
  return {modified:rowCount===1};
}
export async function updatePostgresRun(code,run,revision) {
  const {snapshot,...state}=run;
  const {rowCount}=await query('UPDATE rn_live_runs_v1 SET state=$2::jsonb,revision=$3,updated_at=clock_timestamp() WHERE code=$1 AND revision=$4',[codeOf(code),JSON.stringify(state),state.revision,revision]);
  return {modified:rowCount===1};
}
export async function deletePostgresRun(code) { await query('DELETE FROM rn_live_runs_v1 WHERE code=$1',[codeOf(code)]); }
export async function postgresAction(code,op,participantId,secret,payload={}) {
  const {rows}=await query('SELECT rn_live_action_v1($1,$2,$3,$4,$5::jsonb) AS response',[codeOf(code),op,participantId,secret,JSON.stringify({...payload,eventId:randomUUID()})]);
  const response=rows[0].response;
  if(response.error)throw Object.assign(new Error(response.error),{statusCode:response.statusCode,code:response.code});
  return response;
}
export async function postgresPresence(code) {
  const {rows}=await query(`SELECT coalesce(jsonb_object_agg(p.participant_id,jsonb_build_object('at',p.last_seen,'readyAttempt',p.ready_attempt)) FILTER (WHERE p.participant_id IS NOT NULL),'{}') AS records
    FROM rn_live_runs_v1 r LEFT JOIN rn_live_presence_v1 p ON p.code=r.code WHERE r.code=$1 GROUP BY r.code`,[codeOf(code)]);
  return rows[0]?.records ?? null;
}
export async function writePostgresPresence(code,participantId,readyAttempt=null) {
  const {rowCount}=await query(`INSERT INTO rn_live_presence_v1(code,participant_id,last_seen,ready_attempt)
    SELECT code,$2,clock_timestamp(),$3 FROM rn_live_runs_v1 WHERE code=$1
    ON CONFLICT(code,participant_id) DO UPDATE SET last_seen=EXCLUDED.last_seen,ready_attempt=coalesce(EXCLUDED.ready_attempt,rn_live_presence_v1.ready_attempt)`,[codeOf(code),participantId,readyAttempt]);
  return rowCount>0;
}

export async function putPostgresMedia(runId, mediaId, payload) {
  await query('INSERT INTO rn_live_media_v1(run_id,media_id,payload) VALUES($1,$2,$3::jsonb) ON CONFLICT(run_id,media_id) DO UPDATE SET payload=EXCLUDED.payload',[runId,mediaId,JSON.stringify(payload)]);
}
export async function getPostgresMedia(runId, mediaId) {
  return (await query('SELECT payload FROM rn_live_media_v1 WHERE run_id=$1 AND media_id=$2',[runId,mediaId])).rows[0]?.payload || null;
}
