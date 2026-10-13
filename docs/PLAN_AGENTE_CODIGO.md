# Jetree como agente de código

Propuesta del 11 de octubre de 2026. Documento de planificación: no instala servicios, ejecuta código de proyectos ni cambia producción.

## Decisión recomendada

Mantener Jetree como panel, identidad, agentes, permisos y conversaciones. Crear un ejecutor independiente y un CLI propio para conectar proyectos locales. El mismo contrato debe servir para entornos remotos aislados. Evaluar OpenCode como primer motor de programación, detrás de un adaptador sustituible; la decisión final depende de una prueba con las claves y modelos reales de Jetree.

Una app de escritorio puede añadirse después como interfaz del mismo ejecutor. No resuelve por sí sola ni el aislamiento ni trabajar con la computadora apagada.

## Estado observado del repositorio

- Next.js 15 y TypeScript, agentes y managers con delegación, modelos por API, conversaciones web y Telegram.
- Herramientas, permisos y aprobaciones ya implementados; GitHub permite operaciones puntuales vía REST.
- `respondWithTools` ejecuta hasta cinco decisiones secuenciales; propone herramientas mediante JSON generado como texto.
- El adaptador limita el prompt a 24.000 caracteres. El historial del agente usa los últimos ocho mensajes, recortados a 2.000 caracteres cada uno. Esto no constituye memoria suficiente para implementar y verificar cambios extensos.
- No hay un entorno de checkout, terminal y ejecución de tests para los agentes. El conector GitHub no sustituye ese entorno.

## Alternativas de ejecución

| Alternativa | Archivos locales | PC apagada | Evaluación |
| --- | --- | --- | --- |
| Web y APIs de GitHub | Solo copias subidas/remotas | Sí | Útil para revisiones y cambios puntuales; insuficiente para desarrollo completo |
| Web más ejecutor local/CLI | Carpetas autorizadas | No, salvo tareas trasladadas a remoto | Primera opción para trabajar sobre los proyectos reales del usuario |
| Ejecutor remoto aislado | Checkout o copia autorizada | Sí | Necesario para autonomía desde Telegram y trabajos en segundo plano |
| App de escritorio más ejecutor | Carpetas autorizadas | No por sí sola | Mejora instalación y experiencia; posterior al motor funcional |

Seleccionar una carpeta mediante File System Access permite acceso concedido por el usuario en navegadores compatibles; no proporciona una terminal del sistema ni procesos persistentes equivalentes a un agente local.

## Motores candidatos

- **OpenCode:** servidor y SDK, múltiples proveedores y licencia MIT en el repositorio consultado. Encaja con TypeScript y claves de varios proveedores. Debe probarse compatibilidad de modelos, eventos, permisos, recuperación y comportamiento en Windows. Su autenticación de servidor no reemplaza el control por usuario y proyecto de Jetree.
- **Codex app-server/SDK:** motor existente con sesiones, eventos y aprobaciones. Buen adaptador opcional cuando el usuario elija ese entorno y tenga credenciales/modelos compatibles; no asumir equivalencia con todos los modelos que acepta Jetree.
- **Claude Agent SDK:** herramientas, sesiones y gestión de contexto del motor de Claude Code. Alternativa opcional para Claude; revisar autenticación y condiciones comerciales antes de distribuir.
- **OpenHands SDK:** ejecución local/remota y Agent Server, apropiado para entornos aislados; incorpora Python y más infraestructura al stack actual.
- **Motor íntegramente propio:** control total y libertad de proveedores. Mayor esfuerzo: contexto, herramientas, permisos, recuperación, tests y calidad deben construirse y mantenerse. Mantener abierta esta alternativa sin bloquear el primer producto en ella.

## Arquitectura propuesta

1. Web, Telegram y CLI envían pedidos a una misma sesión de código.
2. Jetree autoriza usuario, agente, proyecto, modelo y destino de ejecución.
3. Un coordinador persistente registra eventos, presupuesto, estado y aprobaciones.
4. Un ejecutor reclama el trabajo y crea un checkout/worktree aislado.
5. El adaptador del motor explora, modifica y verifica el proyecto usando herramientas dentro del entorno autorizado.
6. Jetree muestra actividad, diff, tests, capturas y resultado; la publicación a GitHub requiere su permiso propio.

Separar procesos largos del ciclo de una petición HTTP de Next.js. El ejecutor necesita identidad revocable, eventos ordenados, heartbeats, cancelación y recuperación después de una desconexión. Un comando que pudo ejecutarse pero no devolvió resultado debe reconciliarse; nunca repetir automáticamente una acción externa ambigua.

## Archivos y ejecución local

- Vinculación mediante inicio de sesión/código de dispositivo; conexión saliente cifrada al servidor, sin abrir un puerto público en la PC.
- Registrar proyectos concretos, no otorgar por defecto acceso al disco o carpeta personal completos.
- Validar rutas reales, enlaces simbólicos, junctions y escapes de directorio en Windows y Linux.
- No modificar cambios humanos existentes: conservarlos y trabajar en worktrees separados cuando el repositorio lo permita. Para carpetas sin Git, exigir una copia de trabajo y mecanismo de restauración.
- Excluir credenciales, perfiles del navegador, claves SSH y archivos sensibles del contexto. Una regla de exclusión de archivos no protege por sí sola contra una terminal con permisos amplios: requiere aislamiento real.
- En Windows, comenzar con un entorno WSL2 o contenedor autorizado para comandos; validar rutas, dependencias y diferencias con ejecución nativa. Para herramientas nativas de Windows, diseñar un modo específico antes de prometer soporte equivalente.
- El agente puede cerrar el navegador y continuar mientras el ejecutor siga activo y la PC encendida. Con la PC apagada, las tareas locales quedan esperando; no se trasladan a remoto sin autorización de la copia de archivos.
- Los fragmentos necesarios se envían al proveedor de IA elegido. Evitar subir todo el repositorio o conservar su contenido íntegro en el servidor por defecto.

CLI ilustrativo, todavía no disponible:

```text
jetree login
jetree project add "C:\proyectos\mi-app"
jetree connect
jetree run "Corregí el formulario y ejecutá los tests"
jetree status
jetree disconnect
```

## Ejecución remota

Usar repositorios autorizados mediante una GitHub App con permisos acotados. Cada trabajo parte de un commit/base explícito y produce una rama y diff revisables. Las modificaciones locales sin subir no aparecen en el checkout remoto.

El código y los scripts de dependencias son código no confiable. No ejecutarlos en el proceso de Jetree ni montar `/opt/jetree`, secretos de producción, el socket Docker o el disco del servidor. Para un piloto privado, un worker en una VM separada con contenedores endurecidos, cuotas de CPU/RAM/disco, usuario sin privilegios y red controlada; para usuarios no confiables, aislamiento más fuerte, por ejemplo microVMs. Preferir una máquina distinta a la VPS productiva.

La misma sesión puede continuar desde web o Telegram, independientemente del navegador. Los previews requieren acceso autenticado y vencimiento; no publicar puertos automáticamente.

## Herramientas, contexto y permisos

Herramientas mínimas: listar/buscar/leer archivos, aplicar parches con comprobación de versión, ejecutar comandos con cwd y límites, consultar estado/diff Git, correr tests y generar artefactos. Añadir navegador Playwright para verificar interfaces después del flujo básico.

Usar llamadas a herramientas nativas cuando el modelo lo permita y un adaptador probado cuando no. Persistir plan, resultados y checkpoints; compactar por presupuesto de tokens del modelo, sin recortar silenciosamente la solicitud. Recuperar contexto por búsquedas y lecturas selectivas; no empezar con un índice vectorial de todo el repositorio.

Modos de proyecto:

- **Revisar:** lecturas, diagnóstico y propuesta; sin ejecución de código no autorizado.
- **Desarrollar:** autorizar ediciones y comandos dentro de la copia aislada durante la sesión. No pedir una aprobación por cada línea o test.
- **Publicar:** permisos separados para push, PR, merge, despliegues, acceso adicional a red o secretos.

Los comandos deben controlarse por sus efectos y por el aislamiento, no solo por prefijos: `npm test` puede ejecutar cualquier script del proyecto. El contenido del repositorio no concede permisos. Las instrucciones del proyecto se aplican dentro del alcance aprobado.

## Etapas y criterios de salida

1. **Prueba de motor y aislamiento.** Ejecutar OpenCode en un entorno de prueba con dos proveedores reales y un proyecto descartable. Verificar editar, tests, eventos, cancelación, aprobación, desconexión, costes y denegación de acceso fuera del proyecto. Elegirlo solo si satisface el contrato; comparar otro motor si falla.
2. **Sesión de código en Jetree dev.** Selector de proyecto, modelo y ejecutor; estados en cola/explorando/editando/verificando/esperando aprobación/completado/fallido/interrumpido. Vista de actividad, diff y resultados de tests. Ningún trabajo se marca completo sin resultados verificables.
3. **CLI y ejecutor local Windows.** Vinculación, registro/revocación de carpetas, acceso acotado, worktrees, logs y reconexión. Una tarea iniciada en web debe continuar desde Telegram sin duplicarse; cambios humanos previos deben conservarse.
4. **Worker remoto.** GitHub App, checkout aislado, dependencias, pruebas, cuotas y borrado de entornos. Una tarea desde Telegram termina y produce una PR revisable con la PC apagada.
5. **Calidad y experiencia.** Navegador para UI, previews privados, contexto de proyecto, límites de coste, evaluaciones reproducibles y revisión independiente. Evaluar una extensión VS Code antes de desarrollar un editor propio.
6. **Escritorio opcional.** Electron para priorizar reutilización del stack Node y terminal, o Tauri con sidecar para priorizar tamaño y permisos explícitos. Interfaz empaquetada localmente; no dar a una página remota privilegios nativos completos. Instaladores, firma y actualizaciones son parte del alcance.

Primer objetivo: un agente, un proyecto y una tarea con diff y pruebas. Managers coordinan después; agentes concurrentes usan worktrees separados y una integración controlada, nunca escriben simultáneamente el mismo checkout.

## Evaluación y costes

Probar corrección de bugs, funcionalidad con tests, cambios de UI, dependencias, interrupción/reanudación y conflicto con cambios humanos. Medir tasa de éxito, regresiones, latencia, tokens/coste por tarea y veces que interviene el usuario. Que un modelo acepte una API no demuestra que programe bien; modelos gratuitos siguen siendo elegibles, con sus cuotas y rendimiento medidos.

No estimar coste de hosting ni capacidad de concurrencia sin medir la VPS/worker y builds representativos. El software abierto no elimina el consumo de API, almacenamiento, CPU ni posibles costes de firma de escritorio.

## Fuentes oficiales consultadas

- OpenCode: https://opencode.ai/docs/sdk/ ; https://opencode.ai/docs/server/ ; https://opencode.ai/docs/providers/ ; https://github.com/anomalyco/opencode/blob/dev/LICENSE
- Codex: https://learn.chatgpt.com/docs/codex-sdk ; https://learn.chatgpt.com/docs/app-server
- Claude Agent SDK: https://code.claude.com/docs/en/agent-sdk/overview
- OpenHands: https://docs.openhands.dev/sdk
- Acceso local del navegador: https://developer.chrome.com/docs/capabilities/web-apis/file-system-access
- Permisos de escritorio Tauri: https://tauri.app/security/capabilities/
- Aislamiento: https://www.anthropic.com/engineering/claude-code-sandboxing
