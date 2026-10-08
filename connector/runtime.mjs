export const CLI_VERSION = '0.63.0';
export const ALLOWED_ORIGINS = ['https://jetree.iwebtecnology.com', 'https://jetree-dev.iwebtecnology.com'];
export function validateOrigin(value) {
  if (!ALLOWED_ORIGINS.includes(value)) throw new Error('Usá el dominio oficial de producción o dev.');
  return value;
}

export function childEnvironment(parent, home, systemPath) {
  // Allowlist instead of deleting known keys: no inherited API credentials, proxies,
  // loader hooks or provider endpoint overrides can change the billing/auth source.
  const env = {};
  for (const key of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT', 'TEMP', 'TMP', 'TMPDIR', 'LANG', 'LC_ALL', 'DISPLAY', 'WAYLAND_DISPLAY', 'DBUS_SESSION_BUS_ADDRESS', 'XDG_RUNTIME_DIR']) {
    if (typeof parent[key] === 'string') env[key] = parent[key];
  }
  env.GEMINI_CLI_HOME = home;
  env.GEMINI_CLI_SYSTEM_SETTINGS_PATH = systemPath;
  env.GEMINI_CLI_SYSTEM_DEFAULTS_PATH = systemPath + '.defaults';
  env.GOOGLE_GENAI_USE_GCA = 'true';
  env.GEMINI_CLI_SURFACE = 'jetree-personal-connector';
  // Supported by the pinned CLI launcher. Keep cancellation in a single process.
  env.GEMINI_CLI_NO_RELAUNCH = 'true';
  return env;
}

export function isolatedSettings(policyPath) {
  return {
    policyPaths: [policyPath],
    security: { auth: { selectedType: 'oauth-personal', enforcedType: 'oauth-personal' }, disableYoloMode: true, disableAlwaysAllow: true },
    tools: { core: [] },
    hooksConfig: { enabled: false },
    mcpServers: {},
    mcp: { allowed: ['__jetree_no_mcp__'] },
    skills: { enabled: false },
    experimental: { enableAgents: false, autoMemory: false },
    ide: { enabled: false },
    context: { fileName: 'JETREE_NO_LOCAL_CONTEXT_8cbd5a.md', loadMemoryFromIncludeDirectories: false },
    general: { enableAutoUpdate: false, enableAutoUpdateNotification: false, sessionRetention: { enabled: true, maxAge: '1d', maxCount: 1 } },
    telemetry: { enabled: false },
    advanced: { ignoreLocalEnv: true },
  };
}

export function isolatedCliArguments(policyPath) {
  // Admin settings in a user file are ignored by the CLI. Use its supported
  // command-line controls for extensions and supplemental deny policy instead.
  return ['--admin-policy', policyPath, '--extensions', 'none', '--allowed-mcp-server-names', '__jetree_no_mcp__'];
}

export function decodeReply(output) {
  const body = JSON.parse(output);
  if (body.error || typeof body.response !== 'string' || !body.response.trim() || body.response.length > 48_000) throw new Error('Respuesta incompleta.');
  if ((body.stats?.tools?.totalCalls || 0) !== 0) throw new Error('El runtime intentó utilizar herramientas locales.');
  return body.response;
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
