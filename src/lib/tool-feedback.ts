import type { ChatMessage } from '@/types';

export function toolErrorMessage(code: string) {
  switch (code) {
    case 'FIGMA_PAIR_INVALID': return 'El código de Figma venció o ya fue usado. Generá uno nuevo en Conectores → Figma.';
    case 'FIGMA_PAIR_WAITING': return 'Todavía no aparece la vinculación en el archivo autorizado. Guardá Figma, esperá la sincronización y verificá nuevamente.';
    case 'FIGMA_PAIR_BUSY': return 'Hay una edición en curso en este archivo. Esperá que termine antes de verificar otra vinculación.';
    case 'FIGMA_FILE_NOT_REGISTERED': return 'Agregá el enlace del archivo en Conectores → Figma antes de usarlo.';
    case 'FIGMA_FILE_NOT_FOUND': return 'El archivo de Figma no existe o tu token no tiene acceso.';
    case 'FIGMA_EDIT_ACCESS_REQUIRED': return 'Necesitás permiso de edición en este archivo de Figma para preparar cambios.';
    case 'FIGMA_FILE_TYPE_UNSUPPORTED': return 'Esta integración edita archivos de Figma Design. Elegí un archivo de diseño.';
    case 'FIGMA_JOB_NOT_ACTIVE': return 'El cambio ya fue resuelto o no está disponible en esta sesión.';
    case 'FIGMA_RENDER_FAILED': return 'Figma no pudo exportar esta capa. Probá un frame visible.';
    case 'FIGMA_RESPONSE_TOO_LARGE': return 'El archivo es demasiado grande para esta consulta. Pedí menos capas o menor profundidad.';
    case 'TOOL_INPUT_INVALID': return 'Los datos de la operación no son válidos. Revisá el enlace, las capas y los cambios solicitados.';
    case 'TOOL_SEARCH_NOT_CONFIGURED': return 'La búsqueda en internet todavía no está configurada. Contactá al administrador.';
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
