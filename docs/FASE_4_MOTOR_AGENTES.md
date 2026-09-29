# Fase 4 — Motor de agentes y managers

## Incluido

- Separación entre adaptador de proveedores, interpretación del plan del manager y política de delegación.
- Un manager solo recibe subordinados activos, independientes, del mismo departamento y con una credencial API disponible para el usuario actual.
- Un plan de delegación debe ser JSON válido, usar un ID permitido y traer una tarea válida. El motor no elige un subordinado alternativo cuando el manager devuelve un ID desconocido.
- Límites por llamada: entrada de 8.000 caracteres, contexto de proveedor de 24.000 caracteres, historial acotado, salida de hasta 1.200 tokens (Claude: 1.024) y timeout de 25 segundos. OpenAI/OpenRouter reintentan una vez; Gemini permite dos intentos; los demás errores fallan de forma explícita.
- La migración 006_agent_execution_ledger.sql registra cada turno como running, completed o failed, conserva errores seguros y delegaciones aun cuando falle el especialista, y aplica un límite diario atómico de ejecuciones para el workspace iWeb actual.
- La cuota se configura con JETREE_WORKSPACE_DAILY_EXECUTION_LIMIT. No equivale a un presupuesto monetario: limita la cantidad de turnos; el máximo de salida limita parcialmente el consumo por turno.

## Verificación local

Las pruebas cubren agente independiente, manager con delegación, manager sin subordinados disponibles, destino no permitido, JSON inválido y error del proveedor. La ejecución fallida no genera una respuesta marcada como completada.

## Aplicación y staging

Aplicar 006_agent_execution_ledger.sql después de 001–005; configurar el límite en el entorno del servidor. En staging, comprobar concurrencia cerca del límite diario, caída/timeout de cada proveedor, manager sin credenciales para algún subordinado, delegación permitida/no permitida y recuperación del historial al volver a abrir la conversación.

No se ejecutaron migraciones remotas ni se probaron claves reales de proveedor.
