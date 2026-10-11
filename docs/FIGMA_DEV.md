# Figma en Jetree dev

Alcance: lectura REST, análisis visual, comentarios y edición mediante el plugin Jetree. No instala servicios en la VPS ni requiere nuevas variables. No hay un cargo adicional de Jetree por este conector; siguen aplicando las cuotas de Figma y el consumo del proveedor de IA para analizar imágenes. La generación de imágenes sigue pendiente de su prueba real y no se promueve a main.

## Antes del merge a dev

La migración `20261011183941_figma_tools.sql` debe estar aplicada en Supabase dev. Después, actualizar la huella en la VPS:

```bash
sudo cp -p /opt/jetree/environments/dev/schema.sha256 /opt/jetree/environments/dev/schema.sha256.before-figma
printf '%s\n' '7953ea6a3de55a3341ed0025bccc655017e51f320cce6b7b3f276a531610deb8' | sudo tee /opt/jetree/environments/dev/schema.sha256
```

El merge desencadena el deploy normal. No cambiar la huella de producción.

## Conectar la cuenta y los archivos

1. En Figma, Settings → Security → Personal access tokens, crear un token con `current_user:read`, `file_content:read`, `file_comments:read`, `file_comments:write`. Elegir su vencimiento y tener un asiento/permisos que permitan editar los archivos elegidos.
2. En Jetree dev, Herramientas → Figma, pegar el token únicamente en el campo del panel. Jetree verifica la cuenta y cifra el token en el servidor.
3. Agregar el enlace `https://www.figma.com/design/CLAVE/Nombre` de cada archivo permitido. Los agentes no pueden usar otros archivos mediante este conector.
4. Habilitar Figma en los conectores del manager o agente que vaya a utilizarlo. Cada usuario conecta su propio token y lista de archivos; la conexión no se copia a otros usuarios.

## Plugin para modificar el diseño

1. Descargar y descomprimir `/figma-plugin/jetree-figma.zip` desde el panel de dev.
2. En Figma Desktop, Plugins → Development → New plugin → Figma Design; crear un plugin con interfaz. Figma genera su `id`.
3. Reemplazar `code.js` y `ui.html` por los descargados. En `manifest.json`, conservar el `id` generado por Figma y copiar los demás campos del manifest descargado. Este paquete es una plantilla de plugin de desarrollo, no un plugin publicado en Community.
4. Abrir el archivo registrado y ejecutar el plugin. Elegir **Jetree dev**. Generar un código desde el mismo archivo en Jetree y pegarlo en el plugin. El código es de un solo uso y vence en 10 minutos.
5. Guardar/sincronizar el archivo Figma y pulsar **Guardé el archivo: verificar y comenzar**. Jetree verifica una marca aleatoria del documento mediante REST: un plugin abierto en otro archivo no recibe la cola. Si todavía no sincronizó, esperar antes de verificar de nuevo; Figma puede limitar las consultas.
6. Dejar el plugin abierto. Su vinculación vence en 24 horas. Pausar recepción detiene trabajos nuevos; un trabajo en curso termina. Cerrar el plugin interrumpe su ejecución.

No hace falta publicar el plugin para estas pruebas. Para distribuirlo luego a un equipo se puede publicar internamente usando el id asignado por Figma.

## Pruebas reales después del deploy

Usar un archivo de prueba, sin datos privados:

- Manager y agente: “Mostrame las páginas y capas del archivo Figma [enlace]”.
- Visión: “Analizá el frame [ID leído], contame cómo se ve y sugerí mejoras”. Requiere que el modelo de visión elegido y la API conectada admitan imágenes; no se cambia automáticamente de modelo.
- Comentario: “Agregá el comentario Prueba Jetree dev en este frame”. Revisar y aprobar; comprobar en Figma.
- Edición: “Creá un frame de 300 × 200 llamado Prueba Jetree con un texto Hola Jetree”. Revisar el lote y aprobar desde web. Debe pasar de en cola a aplicado, con IDs y captura.
- Con Figma cerrado, aprobar otro cambio: debe seguir en cola. Abrir/vincular el plugin: debe aplicarse una sola vez.
- Telegram: repetir un cambio desde el bot vinculado, aprobar con su botón y comprobar el aviso de cola y luego el resultado/captura. Escribir “aprobado” recupera el borrador; no autoriza una escritura por sí solo.
- Interrumpir un trabajo en un archivo de prueba: si queda incierto, **cerrar el plugin y revisar Figma** antes de cerrar el trabajo desde Jetree. No repetir el pedido para intentar recuperarlo.

Los trabajos de todos los agentes se serializan por archivo. Una edición cuyo resultado es incierto bloquea nuevas ediciones del archivo hasta la revisión humana. El plugin registra cada trabajo en el documento antes de editar y no repite un trabajo ya iniciado. No se promete una transacción de todo el lote: si un cambio falla después de editar parte, el estado es incierto y se puede usar Deshacer en Figma.

Operaciones de canvas disponibles: crear frames, textos, rectángulos, componentes e instancias; modificar nombre, texto, posición, tamaño, color sólido, tipografía (tamaño), radio y auto layout; duplicar, mover y eliminar capas. Máximo 25 comandos y propiedades validadas; no se ejecuta JavaScript arbitrario propuesto por un modelo. El plugin permite editar capas con los permisos de quien tiene abierto Figma.

Las lecturas REST y las aprobaciones funcionan con la computadora apagada. Aplicar ediciones requiere el archivo y el plugin abiertos. Revocar la conexión cancela trabajos en cola y marca como inciertos los que ya estaban ejecutándose; no deshace cambios ya aplicados.
