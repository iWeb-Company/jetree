import { setTimeout as sleep } from 'node:timers/promises';
import { writeFileSync, rmSync } from 'node:fs';
const secret = process.env.JETREE_TELEGRAM_WORKER_SECRET;
if (!secret || secret.length < 32) throw new Error('Worker secret required');
const interval = Number(process.env.JETREE_WORKER_INTERVAL_SECONDS || 60);
if (!Number.isSafeInteger(interval) || interval < 10 || interval > 3600) throw new Error('Invalid worker interval');
const stop = new AbortController();
rmSync('/tmp/jetree-worker-ready', { force: true });
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => stop.abort());
while (!stop.signal.aborted) {
  try {
    const response = await fetch('http://app:3000/api/telegram/worker', {
      method: 'POST', headers: { 'x-jetree-worker-secret': secret },
      // Drain an in-flight invocation before exiting, so a replacement cannot overlap it.
      signal: AbortSignal.timeout(240000),
    });
    const result = await response.json();
    if (response.status === 200 && Number.isSafeInteger(result.processed)) {
      writeFileSync('/tmp/jetree-worker-ready', String(Date.now()), { mode: 0o600 });
    } else {
      rmSync('/tmp/jetree-worker-ready', { force: true });
    }
    console.log(JSON.stringify({ workerStatus: response.status, processed: Number.isSafeInteger(result.processed) ? result.processed : null }));
  } catch { if (!stop.signal.aborted) console.error('Worker invocation failed'); }
  try { await sleep(interval * 1000, undefined, { signal: stop.signal }); } catch { break; }
}
