# Worker Telegram: permisos y cuota — 2026-10-06

Base: main b6b06e39d76ea47cb0577ddcb4aac3298c2f112f, PR #11 mergeado. Rama: codex/telegram-worker-guards.

## Comportamiento

Antes de inferir o entregar, el worker verifica que bot y agente correspondan, que agente y departamento estén activos y que exista el perfil del dueño. El dueño debe ser admin, creador del departamento o miembro actual. Una revocación o archivo termina el update como failed; un fallo de lectura no concede acceso y sigue el flujo de reintentos. Una entrega pendiente también vuelve a validar permisos.

Antes de executeAgentChat se reserva una ejecución con la misma función atómica y el mismo límite diario que usa el chat HTTP. Límites inválidos, errores de base o cuota agotada bloquean la inferencia. Los reintentos de entrega con respuesta persistida no vuelven a consumir cuota. El límite mide ejecuciones, no dólares ni cada llamada interna de un manager. No modifica esquema ni migraciones.

## Verificaciones

Local: 26 pruebas unitarias aprobadas (incluye revocación, perfiles ausentes, privilegios admin/creador, archivo incluso para admins, cuota agotada, errores y configuración inválida); TypeScript, lint y build aprobados. Permanecen dos avisos img conocidos.

Remoto con fixtures sintéticos: la suite live-provider-telegram volvió a pasar con Gemini real y entrega aceptada por Telegram; incluye deduplicación, mensaje ya persistido, backoff, recuperación y quinto fallo terminal. Regresiones adicionales: agentes/departamentos archivados, dueño ajeno y membresía revocada quedaron failed antes de entregar. También se probó la reserva contra la RPC real con un límite inferior al uso existente: denegó la reserva y el contador no cambió. Esto no fue una prueba de cuota por HTTP; fue del helper integrado y la RPC real.

Limpieza confirmada mediante conteos: cero usuarios sintéticos, departamentos, bots, updates y conexiones de proveedores; tres admins conservados. No se consultaron filas personales. Las ejecuciones sintéticas consumen el contador diario; no se restableció artificialmente.

## Infraestructura y siguiente etapa

VPS informada por Facu: Debian 13, Docker/Compose, Nginx en 80/443; puerto 3028 libre en la lectura adjunta; 26 GiB de RAM disponibles y 204 GB de disco libre en esa instantánea. Sin acceso SSH directo verificado por Codex. El usuario instaló el sitio de mantenimiento y certificado. Desde este equipo se verificó DNS y HTTPS público con respuesta 503 en jetree.iwebtecnology.com. El usuario aportó salida exitosa de renovación simulada y deploy-hook de validación/recarga de Nginx. Las advertencias de sitios existentes permanecen documentadas; no se afirma una auditoría completa de esa VPS.

Siguiente etapa: empaquetar Docker, secretos externos, health check, scheduler del worker, rollback y prueba protegida de staging en la VPS con puerto 127.0.0.1:3028. Jetree continúa en mantenimiento; no se desplegó la aplicación. Pendientes del plan: manager real, escritura GitHub, staging aislado, retención/alertas, rate limiting, privacidad/exportación/borrado y alertas de herramientas de desarrollo.

Rollback de este cambio: volver al artefacto de b6b06e3; no requiere restauración de esquema.
