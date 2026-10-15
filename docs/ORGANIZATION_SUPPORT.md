# Organigrama y ayuda interna

Organigrama usa exclusivamente los departamentos, agentes y tareas ya cargados por las APIs con permisos existentes. Permite buscar, filtrar, plegar y ajustar zoom. Los equipos se muestran como enlaces explícitos: puede haber subordinados compartidos, managers subordinados y relaciones entre departamentos. No se crea una jerarquía de permisos nueva ni se recorre un grafo cíclico. Trabajando combina estado del agente con tareas en curso; no es presencia humana.

Ayuda Jetree aparece abajo a la derecha para usuarios autenticados. Tiene consentimiento previo, sugerencias, historial solo en memoria de la pantalla, texto sin ejecutar HTML y accesos a las secciones documentadas. No lee datos de negocio, credenciales, correos ni historial de agentes. La pregunta y los últimos turnos de soporte se envían al proveedor; no ingresar información privada. Se redactan algunos formatos comunes de claves como defensa adicional, no como garantía de detección de secretos. Recargar o abrir otra herramienta que desmonta el widget borra el historial; Nueva también lo borra localmente, no en el proveedor.

## Configurar dev en la VPS

No hay migraciones ni nueva huella de esquema. En `/opt/jetree/environments/dev/runtime.env`, agregar con un editor seguro:

```dotenv
JETREE_SUPPORT_OPENROUTER_API_KEY=CLAVE_EXCLUSIVA_DEL_SOPORTE
JETREE_SUPPORT_MODEL=openrouter/free
```

La clave se ingresa solo en el archivo protegido, no por chat ni en el frontend. Crear una clave exclusiva de soporte en OpenRouter y revisar privacidad del proveedor y límites de la cuenta. El deploy tras merge carga runtime.env; guardarlo sin redeploy no actualiza el proceso. No copiar automáticamente a producción.

El servidor permite exclusivamente openrouter/free o un ID con variante :free. La solicitud limita precio de prompt/completion a cero; no se configuran fallbacks pagos ni herramientas. Los modelos gratuitos pueden estar sin capacidad o cuota. No se promete disponibilidad ni exactitud perfecta. Si falta clave, se responde con extractos de documentación local y se avisa, sin llamar a IA. También se usa documentación local ante errores de proveedor/red, cuota, configuración inválida, respuesta vacía/malformada/excesiva o timeout. La interfaz distingue «Ayuda Jetree · Documentación» y muestra un aviso; nunca presenta ese respaldo como inferencia exitosa. Devuelve solo un motivo permitido y, si existe, estado HTTP numérico del proveedor, sin cuerpo crudo ni razonamiento. No reintenta ni cambia de modelo. Una cancelación del cliente se propaga sin iniciar otro intento.

La prueba real inicial en dev respondió dos consultas y falló otras dos. No se identificó retrospectivamente si fueron respuestas vacías o errores HTTP: la versión anterior no exponía diagnósticos suficientes. Se amplió el presupuesto de salida de 800 a 1600 tokens para dar margen al texto visible y se conserva el timeout y el límite de precio cero. El cambio no promete resolver la disponibilidad del proveedor; el respaldo documental mantiene la utilidad cuando falla. La ayuda de Obsidian aclara que los requisitos de PC/plugin activos corresponden al conector Jetree, no a todo el servicio Sync.

Límites actuales por proceso: cinco solicitudes por usuario/minuto, una simultánea por usuario, tres globales y 45 solicitudes/día UTC. Memoria acotada, sin transcripts; se reinicia con el proceso. Diseñado para la instancia actual, no es una cuota persistente ni compartida entre réplicas. Antes de escalar, usar un limitador compartido. Es independiente del límite de tareas del workspace.

Entrada máxima 16 KB, hasta nueve mensajes alternados, 2.000 caracteres por mensaje y 10.000 totales; timeout 25 s y respuesta máxima 64 KB. No registra cuerpos ni errores crudos del proveedor. API POST /api/support/chat exige el mismo requireUser existente. No consume automáticamente claves personales conectadas en Jetree.

## Mantener la ayuda

La base revisable está en `src/lib/support-knowledge.ts`, versionada con la aplicación. La búsqueda selecciona hasta cuatro artículos; no hay navegación, herramientas o RAG sobre documentos privados. Añadir capacidades nuevas aquí y actualizar la fecha al cambiar comportamientos. Las fuentes mostradas son documentación seleccionada por Jetree, no verificación automática de cada frase del modelo. La ayuda reconoce funciones pendientes de validación y deriva al administrador si desconoce el caso.

## Verificación

Probar escritorio/móvil, búsqueda sin resultados, solo trabajando, agentes sin manager, subordinados compartidos y de otro departamento, archives y ciclos. Comprobar navegación a chat/configuración. En soporte probar consentimiento, nueva consulta, cerrar/reabrir, preguntas sobre seis proveedores, PDF/XLSX/HTML, Telegram, Figma, Notion, Obsidian y código; intentar pedir acciones no disponibles y omitir reglas. Revisar modo documentación sin clave, fallos de cuota y acceso anónimo. La inferencia real requiere configurar la clave y verificar después del deploy.

Referencias: https://openrouter.ai/docs/guides/routing/model-variants/free y https://openrouter.ai/docs/api/reference/limits.
