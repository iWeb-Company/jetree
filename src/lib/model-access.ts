// Subscription OAuth and local inference are paused. Tool OAuth is independent.
export function retiredModelPath(path: string): boolean {
  return path === '/mcp' || path.startsWith('/mcp/') || path === '/claude' || path.startsWith('/claude/')
    || /^\/api\/(model-devices|mcp-oauth|mcp-connections)(\/|$)/.test(path)
    || path === '/.well-known/oauth-authorization-server'
    || path === '/.well-known/oauth-protected-resource/mcp'
    || path === '/downloads/jetree-google-connector.tar.gz';
}
