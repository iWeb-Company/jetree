export type GithubAccess = 'public' | 'private';

export function githubAccessForCredentials(scope: string | undefined, requested: unknown): GithubAccess {
  const granted = new Set((scope || '').split(/[ ,]+/).filter(Boolean));
  return requested === 'private' && granted.has('repo') ? 'private' : 'public';
}

export function githubScopeGranted(scope: string | undefined, requested: GithubAccess): boolean {
  const granted = new Set((scope || '').split(/[ ,]+/).filter(Boolean));
  return granted.has('repo') || (requested === 'public' && granted.has('public_repo'));
}
