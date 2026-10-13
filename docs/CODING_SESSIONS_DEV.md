# Sesiones de código en Jetree dev

La pestaña **Código** vincula un ejecutor local a la cuenta de Jetree. Permite elegir un proyecto y modelo autorizados, asociar un agente o manager, enviar el pedido, seguir sus estados, detenerlo y revisar el diff y los tests. La asociación al agente es de identificación: este piloto usa el prompt de programación del ejecutor, sin importar automáticamente herramientas o instrucciones de Gmail/Figma del agente.

Las tareas no ejecutan procesos en Next.js ni en la VPS. El CLI consulta la cola mediante HTTPS saliente; no abre puertos locales. La PC debe estar encendida y `listen` debe permanecer activo. Telegram, ejecución remota, publicación a GitHub y aplicación automática al original quedan para etapas posteriores. No se presenta este piloto como un editor completo ni como capacidad disponible en todos los proveedores.

## Configuración local

Desde Ubuntu/WSL2 con Node 22+, Git, Docker Linux y la imagen `jetree-code:opencode-1.19.0`, creá un JSON de configuración. Usá rutas Linux (`/mnt/c/...` para proyectos Windows). Las carpetas deben ser raíces Git con un commit. El comando de tests se autoriza localmente y no puede modificarse desde la web.

```json
{
  "name": "Mi PC",
  "projects": [{
    "localId": "mi-app",
    "name": "Mi aplicación",
    "path": "/mnt/c/proyectos/mi-app",
    "testCommand": "node --test",
    "models": [
      {"provider":"groq","model":"openai/gpt-oss-20b","keyFile":"/home/jetree-runner/.config/jetree/keys/groq.key"},
      {"provider":"openrouter","model":"openrouter/free","keyFile":"/home/jetree-runner/.config/jetree/keys/openrouter.key"}
    ]
  }]
}
```

Las claves se guardan en archivos propios con permisos 600. No se incluyen en el JSON, se suben a Jetree ni se comparten con el contenedor de código. Este piloto utiliza claves locales autorizadas; no copia automáticamente las conexiones IA del panel. Groq y OpenRouter pasaron una prueba básica real de edición y tres tests. OpenRouter/free es una ruta variable, no una evaluación de un modelo fijo.

En **Código → Vincular ejecutor**, generá un código de uso único con vencimiento de 10 minutos. En Ubuntu:

```bash
node coding-runner/cli.mjs connect --server https://jetree-dev.iwebtecnology.com --code CODIGO_DEL_PANEL --config /ruta/config.json
node coding-runner/cli.mjs listen
```

`connect` registra solamente nombre, modelos y comando de tests: las rutas y claves quedan en la PC. Otorga a esa cuenta permiso para solicitar ediciones y ejecutar los tests dentro de copias de esos proyectos. El token revocable vence a los 30 días y se guarda, con la configuración, en `~/.local/share/jetree-code/connection.json`, con permisos privados. No pegarlo por chat. Para otro ejecutor/configuración, usar `--connection /otra/carpeta/privada` en ambos comandos.

El panel solicita autorización para enviar contexto al proveedor y almacenar diffs y resultados. El comando de tests puede ejecutar código del proyecto; se ejecuta dentro del contenedor aislado. Revisá el contexto y sus exclusiones descritos en [CODING_RUNNER_DEV.md](CODING_RUNNER_DEV.md). Ningún diff se aplica ni se publica automáticamente.

## Desconexión, cancelación y recuperación

- Solo una sesión activa por ejecutor. Una cola espera hasta que el CLI esté conectado.
- El ejecutor renueva la sesión cada 10 segundos. Tras 90 segundos sin renovación, se considera interrumpida; no se vuelve a poner en cola.
- Detener desde la web solicita abortar el motor. Revocar el ejecutor impide nuevos reclamos y resultados; la tarea local se detiene después de detectar la pérdida de acceso. No significa matar instantáneamente Docker por remoto.
- `pending.json` conserva la entrega del resultado mediante reemplazo atómico después de sincronizar el archivo. Si se perdió la respuesta del servidor, se reenvía el informe, no el código. Un reinicio con un reclamo sin informe se registra como interrumpido. Un registro corrupto detiene el ejecutor para revisión; no se descarta silenciosamente.
- Un resultado tardío del mismo reclamo puede reconciliar una desconexión; un resultado repetido no cambia una sesión ya terminada.
- Las copias e informes completos permanecen bajo `~/.local/share/jetree-code/runs/ID`. El panel recibe diffs y salida limitados, no el repositorio entero. Revisar y borrar manualmente esos artefactos cuando ya no sean necesarios.
- `listener.lock` ahora es una carpeta privada con PID e identidad del proceso. Al reiniciar `listen`, recupera el bloqueo únicamente si demuestra que el dueño murió. En Linux distingue también reinicios del sistema y reutilización del PID. Un dueño vivo impide iniciar otro ejecutor. En Windows un PID existente se considera vivo conservadoramente. Bloqueos antiguos vacíos o corruptos requieren revisión manual: verificar que no haya otro `listen` antes de retirarlos.
- La cancelación interrumpe también el transporte y la verificación, sin esperar el timeout completo del comando de tests. El CLI luego elimina los contenedores. Después de reiniciar la PC, arrancá `listen` nuevamente; no se instala un servicio de inicio automático.
- Los fallos distinguen autenticación, cuota, límite de contexto/salida, generación de herramientas y respuesta vacía. `status.json` conserva códigos, nombre de error permitido y HTTP status; nunca el cuerpo crudo del proveedor. No se determinó retrospectivamente la causa del primer fallo Groq anterior a esta instrumentación.

## Dependencias Node

La configuración local puede autorizar `"dependencies": "npm-ci"` dentro de un proyecto; por defecto usa `"none"`. La web no puede activar esa política ni cambiarla por tarea. Para cambiar una configuración ya vinculada, revocá el ejecutor y vinculá una nueva configuración; no edites el token manualmente.

El piloto admite `package-lock.json` versión 3, hasta 1.000 entradas, dependencias públicas con integridad SHA-512 y tarballs HTTPS de `registry.npmjs.org`. No admite workspaces, paquetes privados, fuentes Git/file/URL, overrides ni configuración `.npmrc`. Algunos rangos o árboles válidos de npm pueden quedar fuera de este subconjunto inicial. No soporta preparación de Python, pnpm o yarn todavía.

Antes de iniciar el agente, instala con `npm ci --ignore-scripts --no-audit --no-fund` en un contenedor sin claves, que recibe solamente package.json y el lockfile. Tiene acceso de red para descargar paquetes; no recibe código del proyecto ni credenciales de npm. Los scripts de instalación quedan desactivados. Dependencias y caché tienen límites temporales de 512 MiB y 256 MiB respectivamente. No se reutiliza node_modules del host.

El agente y los tests usan esas dependencias mediante un volumen de solo lectura y mantienen la red interna. Los cambios en package.json o el lockfile invalidan la verificación: preparar una nueva copia para instalar otro árbol. Paquetes que necesitan postinstall o compilación nativa pueden no funcionar. El volumen se elimina al cerrar normalmente; una caída abrupta de Docker/CLI puede dejar recursos para limpiar manualmente, sin reejecutar el trabajo.

Evaluación real con un proyecto sintético de carrito, dependencia pública, siete tests y una edición humana sin commit (la clave solo se lee localmente):

```bash
node coding-runner/evaluate.mjs groq ~/.config/jetree/keys/groq.key --allow-inference
node coding-runner/evaluate.mjs openrouter ~/.config/jetree/keys/openrouter.key --allow-inference
```

Cada evaluación crea otra copia y comprueba que el original y los tests no cambiaron. Esto no autoriza nuevos proyectos en el ejecutor del panel.

Validación local del 13/10/2026: Groq `openai/gpt-oss-20b` y OpenRouter `openrouter/free` corrigieron únicamente checkout.cjs y pasaron los siete tests del carrito, incluida la integración del CLI. En ambos casos los tests y la edición humana quedaron intactos. Es una evaluación pequeña reproducible, no una garantía de desempeño en repositorios grandes.

## Despliegue

Aplicar `20261013160227_coding_sessions.sql` a Supabase dev y actualizar la huella revisada en la VPS antes del merge. No hacen falta nuevas variables ni Docker en la VPS. Las tablas y RPC quedan inaccesibles para `anon` y `authenticated`; las APIs validan identidad, dueño, reclamo y límites. Producción no forma parte de esta etapa.

La validación combina contratos del CLI, recuperación sin replay, PostgreSQL descartable con todas las migraciones, Auth real con usuarios sintéticos y navegador desktop/mobile. El flujo de programación con claves reales desde el panel se prueba después del deploy; las pruebas CI no usan claves reales.
