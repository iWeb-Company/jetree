import { readFileSync } from 'node:fs';
try {
  const last = Number(readFileSync('/tmp/jetree-worker-ready', 'utf8'));
  const interval = Number(process.env.JETREE_WORKER_INTERVAL_SECONDS || 3);
  const age = Date.now() - last;
  process.exit(Number.isFinite(last) && age >= 0 && age < (interval + 260) * 1000 ? 0 : 1);
} catch { process.exit(1); }
