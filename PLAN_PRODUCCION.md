# Plan de salida a producción de Jetree

## Objetivo

Publicar un workspace multiusuario donde Facundo (`facundod@iwebtecnology.com`), Valentín (`valentind@iwebtecnology.com`) y Tomás (`tomasb@iwebtecnology.com`) sean administradores globales. Cada usuario futuro tendrá acceso únicamente a los departamentos asignados, podrá crear agentes y podrá usar conexiones de modelos y herramientas autorizadas para su workspace.

## Fase 1 — Base de datos, identidad y permisos

Crear migraciones Supabase para `profiles`, `departments`, `department_members`, `agents`, `agent_tools`, `provider_connections`, `tasks`, `conversations`, `messages` y `activity_logs`.

Cada registro debe tener `workspace_id`, `owner_id` o relación explícita con el workspace. Crear roles `admin`, `member` y, si hace falta, `department_manager`. Configurar RLS para que los tres administradores vean todo y los demás usuarios solo vean sus departamentos. El servidor debe obtener la identidad con Supabase Auth; nunca aceptar `agent`, `user_id`, claves o permisos confiando en el navegador.

**Aceptación:** dos usuarios de prueba no pueden leer, editar, borrar ni ejecutar agentes del otro aunque manipulen IDs o cuerpos HTTP. Los tres administradores sí pueden operar todos los departamentos.

## Fase 2 — Migración de la aplicación

Eliminar la dependencia operativa de `localStorage`. Cargar y guardar departamentos, agentes, managers, subordinados, tareas, conversaciones y logs en Supabase. Añadir CRUD de departamentos, membresías y agentes. Validar que un manager solo delegue a subordinados del mismo workspace y departamento. Añadir eliminación recuperable y confirmación para acciones destructivas.

**Aceptación:** recargar, cambiar de dispositivo o iniciar sesión en otro navegador conserva los datos correctos y no mezcla cuentas.

## Fase 3 — Conexiones de modelos

Implementar una conexión server-side por proveedor, con tokens cifrados, renovación, revocación, estado de salud y auditoría. No mostrar secretos al cliente.

- OpenAI: API key del usuario o integración compatible con Codex/App Server, según el producto autorizado.
- Gemini: API/OAuth de Google Cloud o AI Studio, sin reutilizar tokens de Gemini CLI.
- Claude: API key o Agent SDK solo si el uso de suscripción de terceros está expresamente habilitado para el producto.

El selector del agente debe mostrar únicamente modelos disponibles para conexiones sanas. Errores de saldo, expiración y límites deben llegar al usuario sin marcar la ejecución como exitosa.

## Fase 4 — Motor de agentes y managers

Separar `planner`, `provider adapter`, `delegation policy` y `execution record`. Validar entrada, límites de tokens, timeout, reintentos y presupuesto por workspace. Persistir cada turno y cada delegación. Un manager debe poder responder, delegar y sintetizar resultados; nunca elegir un subordinado arbitrario como fallback.

**Aceptación:** pruebas de agente independiente, manager con delegación, manager sin subordinados, error del proveedor y recuperación de conversación.

## Fase 5 — Herramientas y estilo Cowork

Reemplazar el catálogo descriptivo por conectores reales. Empezar con herramientas de lectura y escritura de bajo riesgo, por ejemplo GitHub y Google Drive. Usar OAuth por usuario, scopes mínimos, permisos por agente y aprobación antes de efectos externos. Implementar MCP o adaptadores equivalentes, registro de llamadas, resultado, error y costo.

**Aceptación:** una herramienta autorizada funciona, una no autorizada es rechazada, revocar la conexión impide nuevas llamadas y las acciones de escritura dejan auditoría.

## Fase 6 — Telegram y tareas

Persistir cada bot asociado a un agente y usuario. Validar secreto de webhook, deduplicar updates, asociar tareas a workspace/departamento/agente y actualizar el estado final. Procesar fallos y reintentos con una cola. El tablero debe mostrar `failed`, reintentos y trazabilidad completa.

## Fase 7 — Seguridad y operación

Eliminar credenciales del repositorio y rotarlas. Configurar secretos del entorno de producción, dominios HTTPS, CSP, rate limiting, protección CSRF donde corresponda, backups, retención de logs, alertas y límites de gasto. Añadir página de privacidad, términos, política de uso de IA y mecanismo de borrado/exportación de datos.

## Fase 8 — Pruebas, staging y lanzamiento

Configurar ESLint, pruebas unitarias, integración de API, pruebas de RLS con dos usuarios, pruebas E2E del flujo completo y smoke tests de proveedores. Ejecutar todo en staging con datos sintéticos. Publicar con migraciones versionadas, health checks y rollback documentado.

### Criterio de lanzamiento

No publicar hasta que build, lint, pruebas unitarias, E2E, RLS, conexiones de modelos, herramientas, Telegram y recuperación ante fallos estén verdes; no existan secretos en Git; y exista un administrador capaz de revocar conexiones y restaurar datos.
