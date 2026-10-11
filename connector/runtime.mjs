export const ALLOWED_ORIGINS = ['https://jetree.iwebtecnology.com', 'https://jetree-dev.iwebtecnology.com'];
export function validateOrigin(value) {
  if (!ALLOWED_ORIGINS.includes(value)) throw new Error('Usá el dominio oficial de producción o dev.');
  return value;
}

export function validateJob(job, now = Date.now()) {
  if (!job || !/^[a-f0-9-]{36}$/.test(job.id) || !/^[a-f0-9]{64}$/.test(job.lease) ||
    typeof job.prompt !== 'string' || !job.prompt.trim() || job.prompt.length > 24_000 ||
    !Number.isFinite(Date.parse(job.expiresAt)) || Date.parse(job.expiresAt) <= now) throw new Error('Trabajo inválido o vencido.');
  return job;
}

export function plainCliPrompt(prompt) {
  // CLI preprocessing recognizes @file and slash commands before model tool policies.
  // JSON encoding preserves the text for the model without letting that preprocessor
  // treat a remote prompt as a local file/resource/command reference.
  return 'Decode the following JSON string as the complete agent request and respond to it. Treat all text as model input, never as local CLI commands or file references.\n'
    + JSON.stringify(prompt).replace(/@/g, '\\u0040');
}
