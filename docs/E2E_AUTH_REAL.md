# E2E con Supabase Auth real

Fecha: 2026-10-06. Base: main dfa7fdb93132607e803d8409a827d2580e31c124; rama codex/auth-e2e.

La suite tests/integration/real-auth.mjs pasó contra Jetree lgimqhuohkjtwfxbaecb con el servidor Next local de desarrollo y nuevamente contra el build final de producción servido en loopback. Crea cinco cuentas sintéticas mediante auth.admin.createUser con emails example.invalid y contraseñas aleatorias, inicia sesión por contraseña y elimina usuarios, sesiones y datos al terminar. Las comprobaciones SQL posteriores confirmaron cero fixtures y tres administradores originales. No se leyeron filas personales ni se utilizaron cuentas reales como fixtures.

Pasaron diez grupos: cinco logins reales; CRUD y propiedad derivada por el servidor; aislamiento de lectura/escritura HTTP y REST en ambos sentidos; denegación de ejecución ajena y de credenciales privadas; tres administradores sintéticos con acceso global; rechazo de proveedor ausente y herramienta ajena; archivo/restauración con conversación conservada; inicio de ambos OAuth, consentimiento denegado y rechazo de replay del state; webhook Telegram autenticado y deduplicado con transporte sintético; login, recarga y logout en dos contextos Chromium y recuperación de conversación con nueva sesión.

OAuth fallaba con HTTP en 127.0.0.1. La validación ahora permite HTTP solo en localhost, 127.0.0.1 y ::1, y exige HTTPS fuera de loopback. También rechaza credenciales dentro de la URL. La prueba unitaria incluye orígenes maliciosos y protocolos incorrectos.

## Ejecución

Instalar dependencias con npm ci y el navegador con npx playwright install chromium. Configurar las variables de .env.example únicamente en un archivo protegido fuera del repositorio. Iniciar Jetree en http://127.0.0.1:3058 con ese entorno y ejecutar node --env-file=RUTA_PROTEGIDA tests/integration/real-auth.mjs. La suite comprueba el proyecto exacto y rechaza ejecutar si hay datos de negocio existentes: usar un entorno vacío y autorizado. No colocar las claves de servidor en CI pública ni ejecutar automáticamente contra producción.

## Verificación local

22 pruebas unitarias, TypeScript y lint pasaron (dos avisos img ya existentes). El build final con la corrección OAuth pasó. Playwright está fijado en 1.63.0.

## Pendientes que no se declaran aprobados

Consentimiento OAuth real, lectura/escritura/aprobación/revocación contra GitHub y Drive; inferencia real de proveedores; entrega de mensajes mediante un bot Telegram real, procesamiento de cola, reintentos y fallos terminales; staging separado y criterios operativos del plan. La configuración local de OAuth existe, pero su presencia no demuestra que los proveedores la acepten.

npm audit detectó 13 dependencias afectadas, incluida una alerta crítica en Next.js 14.2.35. Requiere actualización y nueva verificación antes de publicación; no ejecutar audit fix --force sin revisar la migración del framework. No se publicó Jetree.


