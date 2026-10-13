# Sesiones de código en Jetree dev

La pestaña **Código** vincula un ejecutor local a la cuenta de Jetree. Permite elegir un proyecto y modelo autorizados, asociar un agente o manager, enviar el pedido, seguir sus estados, detenerlo y revisar el diff y los tests. La asociación al agente es de identificación: este piloto usa el prompt de programación del ejecutor, sin importar automáticamente herramientas o instrucciones de Gmail/Figma del agente.

Las tareas no ejecutan procesos en Next.js ni en la VPS. El CLI consulta la cola mediante HTTPS saliente; no abre puertos locales. La PC debe estar encendida y `listen` debe permanecer activo. Telegram, ejecución remota, publicación a GitHub, instalación de dependencias y aplicación automática al original quedan para etapas posteriores. No se presenta este piloto como un editor completo ni como capacidad disponible en todos los proveedores.

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
- `pending.json` conserva la entrega del resultado. Si se perdió la respuesta del servidor, se reenvía el informe, no el código. Un reinicio con un reclamo sin informe se registra como interrumpido.
- Un resultado tardío del mismo reclamo puede reconciliar una desconexión; un resultado repetido no cambia una sesión ya terminada.
- Las copias e informes completos permanecen bajo `~/.local/share/jetree-code/runs/ID`. El panel recibe diffs y salida limitados, no el repositorio entero. Revisar y borrar manualmente esos artefactos cuando ya no sean necesarios.
- Un cierre abrupto puede dejar `listener.lock`. Verificá primero que no haya otro `listen` activo antes de retirar ese archivo; el CLI no elimina por su cuenta una protección contra dos ejecutores simultáneos.

## Despliegue

Aplicar `20261013160227_coding_sessions.sql` a Supabase dev y actualizar la huella revisada en la VPS antes del merge. No hacen falta nuevas variables ni Docker en la VPS. Las tablas y RPC quedan inaccesibles para `anon` y `authenticated`; las APIs validan identidad, dueño, reclamo y límites. Producción no forma parte de esta etapa.

La validación combina contratos del CLI, recuperación sin replay, PostgreSQL descartable con todas las migraciones, Auth real con usuarios sintéticos y navegador desktop/mobile. El flujo de programación con claves reales desde el panel se prueba después del deploy; las pruebas CI no usan claves reales.
