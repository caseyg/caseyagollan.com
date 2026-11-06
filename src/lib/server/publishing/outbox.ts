/** Private delivery state: bind only to the private publishing-state bucket. */
export type DeliveryEvent = {
 source: string; revision: string; generation?: string; action: 'publish' | 'remove'; targets: string[];
 syndicateTo: ('mastodon' | 'bluesky')[]; text: string; title?: string; published: string; sourcePath?: string;
};
export interface DeliveryProgress {
 webmentions: string[];
 webmentionFailures?: Record<string, string>;
 syndication: Partial<Record<'mastodon' | 'bluesky', string>>;
 syndicationStartedAt: Partial<Record<'mastodon' | 'bluesky', number>>;
}
export interface OutboxJob {
 id: string; event: DeliveryEvent; status: 'pending' | 'running' | 'done' | 'failed' | 'superseded';
 attempts: number; createdAt: number; nextAttemptAt: number; leaseUntil: number;
 progress: DeliveryProgress; error?: string;
}
const PREFIX = 'private/outbox/';
const READY_PREFIX = 'private/outbox-ready/';
const CURSOR_KEY = 'private/outbox-ready-scan-cursor';
const REPAIR_CURSOR_KEY = 'private/outbox-repair-scan-cursor';
const active = (job: OutboxJob) => job.status === 'pending' || job.status === 'running';
async function indexReady(bucket: R2Bucket, job: OutboxJob): Promise<void> {
 if (active(job)) await bucket.put(READY_PREFIX + job.id, '', { onlyIf: { etagDoesNotMatch: '*' } });
}
async function clearReady(bucket: R2Bucket, key: string): Promise<void> {
 // Canonical terminal state is already durable; an orphan marker is harmless and
 // the next active scan retries cleanup. Never turn cleanup failure into a retry.
 try { await bucket.delete(key); } catch { /* Retry cleanup on the next scan. */ }
}
async function repairReadyIndex(bucket: R2Bucket): Promise<void> {
 const previous = await bucket.get(REPAIR_CURSOR_KEY);
 const cursor = previous ? await previous.text() : '';
 const page = await bucket.list({ prefix: PREFIX, limit: 100, ...(cursor ? { cursor } : {}) });
 for (const object of page.objects) {
  const record = await bucket.get(object.key);
  if (record) await indexReady(bucket, await record.json<OutboxJob>());
 }
 await bucket.put(REPAIR_CURSOR_KEY, page.truncated ? page.cursor : '');
}
function stable(value: unknown): string {
 if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
 if (value && typeof value === 'object') return '{' + Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => JSON.stringify(k) + ':' + stable(v)).join(',') + '}';
 return JSON.stringify(value);
}
export async function enqueueDelivery(bucket: R2Bucket, event: DeliveryEvent, now = Date.now()): Promise<string> {
 const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stable(event)));
 const id = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
 const job: OutboxJob = { id, event, status: 'pending', attempts: 0, createdAt: now, nextAttemptAt: now, leaseUntil: 0,
  progress: { webmentions: [], syndication: {}, syndicationStartedAt: {} } };
 // A completed marker is deliberately never reset by an identical publication event.
 const created = await bucket.put(PREFIX + id + '.json', JSON.stringify(job), { onlyIf: { etagDoesNotMatch: '*' } });
 if (created) await indexReady(bucket, job);
 else {
  const existing = await bucket.get(PREFIX + id + '.json');
  if (existing) await indexReady(bucket, await existing.json<OutboxJob>());
 }
 return id;
}
class LeaseLost extends Error { constructor() { super('outbox_lease_lost'); } }
function bounded(value: number | undefined, fallback: number, max: number): number {
 return value !== undefined && Number.isFinite(value) ? Math.min(max, Math.max(1, Math.floor(value))) : fallback;
}
export async function processOutbox(
 bucket: R2Bucket,
 handle: (job: OutboxJob, checkpoint: (progress: DeliveryProgress) => Promise<void>) => Promise<'done' | 'superseded'>,
 options: { now?: () => number; limit?: number; leaseMs?: number; maxAttempts?: number } = {}
): Promise<{ processed: number; failed: number }> {
 const now = options.now ?? Date.now;
 const limit = bounded(options.limit, 20, 100);
 const leaseMs = bounded(options.leaseMs, 300_000, 900_000);
 const maxAttempts = bounded(options.maxAttempts, 8, 100);
 // Repair interrupted enqueues independently of the active claim budget.
 await repairReadyIndex(bucket);
 const cursorObject = await bucket.get(CURSOR_KEY);
 const cursor = cursorObject ? await cursorObject.text() : '';
 const page = await bucket.list({ prefix: READY_PREFIX, limit: 100, ...(cursor ? { cursor } : {}) });
 let processed = 0; let failed = 0;
 for (const object of page.objects) {
  const key = PREFIX + object.key.slice(READY_PREFIX.length) + '.json';
  const stored = await bucket.get(key);
  if (!stored) { await clearReady(bucket, object.key); continue; }
  const job = await stored.json<OutboxJob>();
  if (!active(job)) { await clearReady(bucket, object.key); continue; }
  if (processed >= limit) continue;
  const time = now();
  if (!((job.status === 'pending' && job.nextAttemptAt <= time) || (job.status === 'running' && job.leaseUntil <= time))) continue;
  if (job.attempts >= maxAttempts) {
   const result = await bucket.put(key, JSON.stringify({ ...job, status: 'failed', leaseUntil: 0, error: 'outbox_attempts_exhausted' }), { onlyIf: { etagMatches: stored.etag } });
   if (result) { failed++; await clearReady(bucket, object.key); }
   continue;
  }
  job.status = 'running'; job.attempts++; job.leaseUntil = time + leaseMs;
  const claim = await bucket.put(key, JSON.stringify(job), { onlyIf: { etagMatches: stored.etag } });
  if (!claim) continue;
  processed++;
  let etag = claim.etag;
  let lost = false;
  let pending: Promise<void> = Promise.resolve();
  const save = async (): Promise<void> => {
   if (lost || now() >= job.leaseUntil) { lost = true; throw new LeaseLost(); }
   const result = await bucket.put(key, JSON.stringify(job), { onlyIf: { etagMatches: etag } });
   if (!result) { lost = true; throw new LeaseLost(); }
   etag = result.etag;
  };
  // Serialize checkpoints even if a handler issues them concurrently. Rejection is sticky.
  const checkpoint = (progress: DeliveryProgress): Promise<void> => {
   const snapshot = structuredClone(progress);
   pending = pending.then(async () => {
    if (lost || now() >= job.leaseUntil) { lost = true; throw new LeaseLost(); }
    job.progress = snapshot;
    job.leaseUntil = now() + leaseMs;
    await save();
   });
   return pending;
  };
  try {
   const status = await handle(structuredClone(job), checkpoint);
   await pending;
   // Check lease before clearing it: completion may never overwrite a newer worker.
   if (lost || now() >= job.leaseUntil) throw new LeaseLost();
   job.status = status;
   delete job.error;
   const result = await bucket.put(key, JSON.stringify({ ...job, leaseUntil: 0 }), { onlyIf: { etagMatches: etag } });
   if (!result) lost = true;
   else await clearReady(bucket, object.key);
  } catch (error) {
   // Do not persist arbitrary exception messages, URLs, credentials or provider bodies.
   try { await pending; } catch { lost = true; }
   if (lost || error instanceof LeaseLost || now() >= job.leaseUntil) continue;
   const permanent = typeof error === 'object' && error !== null && 'retryable' in error && error.retryable === false;
   const terminal = permanent || job.attempts >= maxAttempts;
   const retryAt = now() + Math.min(3_600_000, 30_000 * 2 ** Math.min(job.attempts - 1, 16));
   const result = await bucket.put(key, JSON.stringify({ ...job, status: terminal ? 'failed' : 'pending', leaseUntil: 0,
    nextAttemptAt: retryAt, error: permanent ? 'outbox_delivery_rejected' : terminal ? 'outbox_attempts_exhausted' : 'outbox_delivery_retry' }), { onlyIf: { etagMatches: etag } });
   if (result && terminal) { failed++; await clearReady(bucket, object.key); }
  }
 }
 // Concurrent scans may repeat a page; CAS job claims still prevent duplicate owners.
 // Only active markers consume scan slots; the cursor rotates past delayed retries.
 await bucket.put(CURSOR_KEY, page.truncated ? page.cursor : '');
 return { processed, failed };
}
