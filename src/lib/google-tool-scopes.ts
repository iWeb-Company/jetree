export const GOOGLE_TOOL_SCOPES = {
  google_drive: 'https://www.googleapis.com/auth/drive.file',
  gmail: 'https://www.googleapis.com/auth/gmail.modify',
} as const;

export function googleToolScopeGranted(provider: keyof typeof GOOGLE_TOOL_SCOPES, scope: string | undefined) {
  return (scope || '').split(/\s+/).includes(GOOGLE_TOOL_SCOPES[provider]);
}
