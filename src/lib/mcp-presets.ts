export type McpPreset = 'custom' | 'notion' | 'obsidian';
export function mcpPresetDefaults(preset:McpPreset) {
  return {name:preset==='notion'?'Notion':preset==='obsidian'?'Obsidian':'',url:preset==='notion'?'https://mcp.notion.com/mcp':'',authMode:preset==='notion'?'oauth':preset==='obsidian'?'token':'none',transport:preset==='custom'?'auto':'streamable_http',headerName:'Authorization',token:'',clientId:'',clientSecret:'',issuer:''};
}
