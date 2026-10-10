# Gmail, internet y tareas completadas

Conectar Gmail desde Conectores de herramientas. Activar Gmail y/o Internet y YouTube en cada agente o manager. El agente detecta solicitudes normales («mostrame correos», «contestale», «buscá videos») y conserva referencias del historial al delegar. Las escrituras pendientes se revisan en el panel o con botones en Telegram.

Telegram: el propietario del bot abre su configuración en Jetree y elige «Vincular mi chat para herramientas». Envía el comando generado en su chat privado con el bot. El código vence en 10 minutos, se guarda solamente su hash y se consume una sola vez. Solo el chat y usuario vinculados pueden leer herramientas y aprobar sus acciones; los grupos y otros usuarios quedan excluidos. La vinculación también suscribe bots existentes a callback_query, sin pedir nuevamente el token de BotFather. Revocar el chat bloquea herramientas, aprobaciones pendientes y acceso al historial que contiene sus resultados. Reemplazar el token del bot elimina la vinculación.

Al pedir una escritura, el bot muestra la operación y el detalle completo, seguido de «Aprobar y ejecutar» y «Rechazar». El servidor ejecuta el borrador almacenado, vuelve a verificar el acceso y consume la aprobación una sola vez. Repetir un botón o reintentar la entrega no vuelve a enviar el correo. La aprobación y el resultado también quedan registrados en Jetree. La migración `20261010043000_telegram_tool_approvals.sql` agrega la vinculación y una tabla privada del servidor; aplicar y actualizar la huella de esquema antes del deploy.

Gmail usa OAuth por usuario y credenciales cifradas del servidor con renovación. Solicita `gmail.modify`: buscar/leer, enviar/contestar, marcar leído y papelera/restaurar. Borrar significa enviar a papelera. Cada modificación o envío necesita aprobación explícita; el destinatario de una respuesta forma parte del detalle aprobado. El cuerpo de correos y resultados externos es información no confiable y no autoriza nuevas acciones.

Internet y YouTube usan Tavily Search con profundidad básica y parámetros automáticos desactivados. Configurar `TAVILY_API_KEY` en runtime.env de cada entorno. No usa claves de modelos ni requiere OAuth de YouTube. Devuelve títulos, extractos y enlaces; no ve ni transcribe videos. El plan gratuito tiene límites compartidos entre los usuarios de la plataforma; administrar consumo en Tavily y mantener desactivada la facturación automática.

Google Cloud: habilitar Gmail API en el proyecto OAuth existente, agregar `https://www.googleapis.com/auth/gmail.modify` al consentimiento y las cuentas de prueba mientras la app esté en Testing. Reutiliza GOOGLE_OAUTH_CLIENT_ID/SECRET y el callback `/api/tool-connections/oauth/callback` de cada dominio. Google clasifica gmail.modify como restringido: la publicación general requiere revisión y, al transmitir/almacenar datos, puede requerir evaluación de seguridad. Revocar Gmail o Drive puede revocar el otro permiso de la misma app; Jetree marca esa conexión como vencida para reconectarla.

La migración `20261010011520_gmail_web_tools.sql` amplía las listas de proveedores permitidos. Mantiene RLS, permisos y cifrado. Aplicar en Supabase dev y actualizar schema.sha256 de VPS dev antes del deploy; repetir en producción después de las pruebas de dev.

Completadas: departamento → agente → tarea, con grupos plegados inicialmente y contadores. Respeta el filtro de departamento, conserva tareas sin asignación y permite abrir el resultado o reabrir una tarea. Estados activos/fallidos mantienen el tablero actual.

Fuentes: https://developers.google.com/workspace/gmail/api/auth/scopes ; https://developers.google.com/workspace/gmail/api/guides/threads ; https://docs.tavily.com/documentation/api-reference/endpoint/search
