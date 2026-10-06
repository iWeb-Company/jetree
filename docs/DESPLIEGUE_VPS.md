# Paquete VPS de Jetree

Preparado sobre main 38a0d99f2e0f249f086def4c9ad6abaad3c48fbd, con PR #12 mergeado y protecciones del worker incluidas. La preparación no habilita el lanzamiento; siguen vigentes los criterios críticos de PLAN_PRODUCCION.md.

## Arquitectura y secretos

Next.js standalone en un contenedor Node 22, usuario node sin root. Puerto exclusivo 127.0.0.1:3028, detrás del Nginx existente. Aplicación limitada a 2 CPU/1 GiB; scheduler a 0.25 CPU/128 MiB. Estos límites son iniciales, no resultados de una prueba de carga. La construcción de la imagen no está limitada por los recursos de Compose; vigilarla en la VPS compartida o construir fuera de ella.

Scheduler secuencial cada 60 segundos, sin superponer invocaciones propias. Se inicia solo con el perfil worker. Usa únicamente el secreto del worker, sin service-role ni claves de proveedores. No publica puertos. La cola de Supabase y su bloqueo siguen siendo responsables de concurrencia/recuperación. Un contenedor unhealthy no se reinicia automáticamente por esa condición: unless-stopped reinicia procesos que terminan. Monitorear health y alertar por separado.

Crear /opt/jetree/secrets con permisos 700 y archivos 600 de root. public.env se basa en deploy/public.env.example; runtime.env en .env.example, con JETREE_APP_URL=https://jetree.iwebtecnology.com; worker.env en deploy/worker.env.example. El secreto de worker debe coincidir entre runtime.env y worker.env. Configurar valores localmente, nunca pegarlos en chat ni Git. No ejecutar docker inspect ni compose config sin --quiet en salidas compartidas, pues env_file incorpora secretos al entorno del contenedor. Docker/root pueden verlos.

Solo las variables NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY se pasan al build; se incorporan al cliente y no son secretos de servidor. El arranque compara esos valores con la imagen y rechaza discrepancias. Cambiarlas exige reconstruir. La clave de cifrado necesita 32 bytes base64 y el secreto worker al menos 32 caracteres. No rotar la clave de cifrado de una bóveda existente sin migrar sus credenciales. El contexto Docker excluye .env*, *.env, dumps, archivos DPAPI y work*; ningún secreto es argumento de construcción.

## Preparación local en la VPS, aún en mantenimiento

Usar un checkout privado del commit revisado bajo /opt/jetree/releases/COMMIT. No cambiar permisos ni reiniciar otros proyectos. Mantener Nginx público en HTTP 503 durante la validación. Verificar nuevamente puerto 3028 y capacidad antes de iniciar. Los secretos permanecen fuera del checkout.

Desde el checkout aprobado:

```bash
docker compose --env-file /opt/jetree/secrets/public.env -f compose.vps.yml config --quiet
docker compose --env-file /opt/jetree/secrets/public.env -f compose.vps.yml build app
docker compose --env-file /opt/jetree/secrets/public.env -f compose.vps.yml up -d --no-build app
curl --fail http://127.0.0.1:3028/api/health
```

/api/health comprueba vida del proceso HTTP; no certifica Supabase, OAuth, proveedores, Telegram ni disponibilidad completa. Las pruebas reales y la configuración de staging se validan por separado. La imagen no ejecuta migraciones ni crea fixtures al iniciar.

Una vez aprobadas las pruebas de staging y los criterios operativos, iniciar explícitamente el scheduler:

```bash
docker compose --env-file /opt/jetree/secrets/public.env -f compose.vps.yml --profile worker up -d --no-build
```

Habilitar luego el proxy de Nginx hacia 127.0.0.1:3028 solamente con criterios críticos comprobados. Configurar HTTPS, encabezados forwarded correctos y timeout compatible con la ejecución de agentes; registrar el webhook mediante Jetree solo en el entorno autorizado. Actualizar los callbacks OAuth y la configuración Auth correspondientes. No copiar el entorno E2E de esta computadora a producción. Supabase staging separado sigue pendiente: un contenedor local o un subdominio no aísla una base de producción.

## Rollback

Guardar la imagen y commit anterior verificados antes de actualizar. No usar latest ni sobrescribir tags de release. En un fallo detener solo el scheduler de Jetree, mantener/reponer mantenimiento, y volver al checkout y tag anterior con su configuración compatible. Restaurar la versión de compose del mismo release; recrear app y worker con --no-build y comprobar health e integraciones antes de reabrir Nginx. No ejecutar docker system prune ni borrar imágenes anteriores. Este paquete no cambia esquema; rollback de app no revierte datos o efectos externos.

## Verificación

Docker CLI existe localmente, pero el daemon Linux no está disponible: no se afirma una prueba local de contenedor. El workflow container.yml construye la imagen en Linux con valores sintéticos, valida Compose, usuario no-root, health, límites de autenticación HTTP y rechazo de configuración ausente. No publica imágenes ni despliega a la VPS. El workflow verify.yml conserva las comprobaciones unitarias, lint, tipos, build, migraciones y RLS. Los resultados concretos se registran en el PR.

VPS: HTTPS/mantenimiento y la renovación de Certbot quedaron comprobados en la etapa anterior. El contenedor y scheduler de este paquete todavía no se han ejecutado allí. Persisten staging, carga, alertas/retención, privacidad/exportación/borrado, controles de seguridad y otras condiciones del plan.
