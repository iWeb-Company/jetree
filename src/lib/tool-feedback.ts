import type { ChatMessage } from '@/types';

export function toolErrorMessage(code: string) {
  switch (code) {
    case 'TOOL_GITHUB_PRIVATE_ACCESS_REQUIRED': return 'Este repositorio requiere acceso privado. En Conectores de herramientas, ampliá el permiso de GitHub y autorizalo en GitHub.';
    case 'TOOL_CONNECTION_REQUIRED': return 'Conectá nuevamente el proveedor en Conectores de herramientas para continuar.';
    case 'TOOL_CONNECTION_EXPIRED':
    case 'TOOL_PROVIDER_AUTH_FAILED': return 'La autorización del proveedor venció o fue revocada. Volvé a conectarlo en Conectores de herramientas.';
    case 'TOOL_NOT_AUTHORIZED': return 'El agente no tiene permiso para usar esta herramienta.';
    case 'TOOL_PROVIDER_RATE_LIMITED': return 'El proveedor alcanzó su límite de solicitudes. Intentá nuevamente más tarde.';
    case 'TOOL_APPROVAL_NOT_PENDING': return 'Esta aprobación ya fue resuelta. Actualizá el registro antes de continuar.';
    default: return 'La operación de herramienta no pudo completarse. Revisá el registro e intentá nuevamente más tarde.';
  }
}

export function mergeToolMessage(messages: ChatMessage[], message: ChatMessage) {
  return messages.some(item => item.id === message.id) ? messages : [...messages, message];
}
