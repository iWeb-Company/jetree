# Conector personal Google / Antigravity para Jetree

Versión de desarrollo 0.2.0-next.1 para Windows x64/ARM64. Login, consulta de modelos y respuesta real con Gemini 3.8 Flash Low verificados en Windows x64. Vinculación y relay siguen bloqueados hasta completar las pruebas integradas de dev y revocación. No es una versión funcional de producción todavía.

Google terminó el acceso de cuentas personales gratuitas, AI Pro y Ultra mediante Gemini CLI el 18 de junio de 2026. Una actualización o repetir el login anterior no resuelve UNSUPPORTED_CLIENT. Antigravity es la ruta oficial de reemplazo.

## Probar la autenticación

1. Usar Node.js 22 o superior en una terminal de tu propio usuario, sin administrador/root.
2. Extraer el conector en una carpeta propia. Ejecutar npm ci, luego npm run login.
3. Se descarga Antigravity 1.3.1 desde el enlace del manifiesto oficial y se verifica SHA-512 antes de ejecutar; no se ejecuta un instalador, no se cambia PATH y se rechaza un binario modificado.
4. Completar personalmente Google y los consentimientos oficiales. Verificar qué cuenta está seleccionada. No compartir códigos, contraseñas ni tokens. No importar configuraciones, plugins o herramientas de otra instalación.
5. Al llegar al chat oficial, salir con /quit y confirmar el resultado de la prueba.

## Prueba integrada exclusivamente en dev

La versión de desarrollo permite `npm run pair -- --dev-preview` y `npm start -- --dev-preview`. Usar exclusivamente https://jetree-dev.iwebtecnology.com, elegir un modelo de la lista real y pegar en la terminal el código de vinculación creado por tu usuario en dev. No compartirlo. Producción se rechaza incluso con esta opción. La vinculación normal permanece deshabilitada hasta finalizar las pruebas de revocación y aislamiento.

Antigravity controla la autenticación y el almacén seguro del sistema. Jetree no copia ni recibe tokens Google. El perfil de configuración usa ~/.jetree-personal/antigravity; la credencial de transporte Jetree permanece separada. No compartir estos archivos ni el usuario del sistema operativo entre cuentas Jetree. Un login puede requerir elegir la cuenta existente en el almacén seguro.

## Aislamiento y límites

El conector escribe el perfil documentado de Antigravity con modo strict, listas allow/ask vacías y denegaciones de archivos, comandos, web y MCP. Selecciona un agente propio con tools vacías, sin subagentes, plugins, skills ni MCP. Usa una carpeta vacía y archivos de hooks/MCP vacíos. No hereda API keys, ADC, proxies, variables del backend ni permisos del entorno. La sesión real confirmó las denegaciones. Una prueba sintética de lectura/escritura/comandos no produjo llamadas de herramientas, filtración ni cambios de archivos; esto no sustituye el aislamiento del sistema operativo.

La integración usa eventos NDJSON oficiales. Antes de enviar el prompt exige confirmación del agente, modelo Gemini y modo strict. La vinculación solicita elegir un modelo de la lista real de la cuenta; no usa el modelo predeterminado de Antigravity. Rechaza resultados parciales, duplicados, no exitosos y ejecuciones de herramientas/subagentes. La cancelación termina el árbol del proceso en Windows. No usa --dangerously-skip-permissions y no cambia a API como respaldo. La cuota depende del plan y de Google.

Antes de habilitar relay: completar revocación y cancelación durante una petición real de Jetree y repetir aislamiento con dos usuarios. Antigravity puede conservar historial local: no se promete eliminación automática. Usar /logout para cerrar su sesión y revocar el consentimiento desde la cuenta Google cuando corresponda.

Claude sigue usando MCP desde su aplicación oficial. OpenAI por suscripción permanece pendiente. Telegram y ejecuciones de servidor usan las conexiones API configuradas.

Fuentes oficiales:
- https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/
- https://antigravity.google/docs/cli/install/
- https://antigravity.google/docs/cli/headless/
- https://antigravity.google/docs/permissions/
