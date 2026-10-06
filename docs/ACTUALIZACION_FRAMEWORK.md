# Actualización del framework verificada — 2026-10-06

Base: main 287e8f37568b74effaaa1e64cc4e712fa342e7f0 (PR #9 mergeado). Rama propuesta: codex/security-upgrade.

Next.js 15.5.27 y React/React DOM 19.3.0. Las tres rutas dinámicas ahora esperan los parámetros asíncronos requeridos por Next.js 15. PostCSS de Next se fija mediante override compatible en 8.5.29. No cambia el esquema ni el historial de migraciones.

## Verificado localmente

22 pruebas unitarias, lint, TypeScript y build de producción aprobados. Lint mantiene dos avisos img existentes. npm audit --omit=dev: cero alertas. npm audit completo: nueve alertas (siete altas y dos moderadas) en braces, chokidar, micromatch, fast-glob, Tailwind, postcss-nested, postcss-selector-parser y herramientas de ESLint. No se ejecutó audit fix --force. La cadena braces no tiene corrección disponible en la versión publicada; requiere seguir la actualización de sus consumidores. No equivale a declarar segura toda la cadena de construcción.

## Verificado contra Supabase

Build local servido en 127.0.0.1:3058 contra Jetree lgimqhuohkjtwfxbaecb. Once grupos E2E aprobados con cinco identidades sintéticas: login real, CRUD, aislamiento bidireccional HTTP/REST, tres admins sintéticos, permisos de membresía otorgados/revocados, rutas dinámicas Telegram, denegaciones, archivo/restauración, inicio OAuth y replay, webhook sintético, dos contextos Chromium y persistencia de conversación.

La lectura posterior confirmó cero usuarios E2E, departamentos, agentes y conexiones de herramientas; tres administradores existentes. No se leyeron filas personales. Esta ejecución no repitió consentimiento OAuth real, inferencia ni transporte Telegram real. Los resultados OAuth del PR #9 mantienen su alcance documentado.

## Rollback y pendientes

Antes de desplegar, conservar el artefacto de main 287e8f3. El rollback consiste en volver a ese artefacto/código y su lockfile; no requiere restaurar la base porque esta actualización no modifica el esquema. No se desplegó Jetree.

Pendientes críticos: alertas de herramientas de construcción, inferencia real, escritura GitHub en un repositorio de pruebas autorizado, bot Telegram real y worker/reintentos, staging y criterios operativos del plan de producción. La aprobación de este PR no aprueba un despliegue.
