# FreeLLMAPI en Jetree

FreeLLMAPI es un gateway autoalojado, no un servicio público que incluya acceso
automático a todos los proveedores. Instalá una instancia separada por entorno,
configurá sus claves de proveedores desde su dashboard y copiá su clave unificada
`freellmapi-…` a Conexiones IA de Jetree. No compartas claves por chat.

Jetree valida la clave mediante GET autenticado `/v1/models`, conserva cada clave
en la bóveda cifrada por usuario y respeta la selección explícita. La URL del
gateway procede únicamente de `FREELLMAPI_BASE_URL` en runtime.env del servidor.
No hay campos de URL ni endpoints enviados por el cliente.

El selector consulta el catálogo completo de la instancia, sin recortarlo a mil
modelos, y permite seleccionar `auto` o cualquier ID anunciado. Que un modelo
figure en el catálogo no implica que esté configurado ni tenga cuota. Agentes,
managers y Telegram usan `/v1/chat/completions`: los modelos de conversación
son ejecutables; generación de imágenes/video, embeddings y transcripción de
FreeLLMAPI requieren endpoints distintos y no se agregan con esta integración.
Telegram mantiene los proveedores de transcripción ya existentes.

## VPS dev: instalación antes de mergear

Los comandos requieren Docker Compose ya instalado. No exponen el dashboard
a Internet. Producción usa otra instancia y otro volumen cuando promovamos.

```bash
sudo install -d -m 700 /opt/jetree/freellmapi-dev
sudo docker pull ghcr.io/tashfeenahmed/freellmapi:latest
# Fijar el digest descargado: las recreaciones no cambian de versión.
gateway_image=$(sudo docker image inspect ghcr.io/tashfeenahmed/freellmapi:latest --format '{{index .RepoDigests 0}}')
printf 'FREELLMAPI_IMAGE=%s\n' "$gateway_image" | sudo tee /opt/jetree/freellmapi-dev/.env >/dev/null
printf 'ENCRYPTION_KEY=%s\n' "$(openssl rand -hex 32)" | sudo tee -a /opt/jetree/freellmapi-dev/.env >/dev/null
sudo chmod 600 /opt/jetree/freellmapi-dev/.env
sudo docker network create jetree-freellmapi-dev
sudo tee /opt/jetree/freellmapi-dev/compose.yml >/dev/null <<'YAML'
services:
  gateway:
    image: ${FREELLMAPI_IMAGE:?Required pinned image}
    env_file: .env
    environment:
      NODE_ENV: production
      PORT: 3001
    ports: ['127.0.0.1:3101:3001']
    volumes: ['data:/app/server/data']
    networks:
      default:
        aliases: [freellmapi-dev]
    restart: unless-stopped
    logging:
      driver: json-file
      options: {max-size: '10m', max-file: '3'}
volumes:
  data:
networks:
  default:
    external: true
    name: jetree-freellmapi-dev
YAML
sudo docker compose --project-directory /opt/jetree/freellmapi-dev -p freellmapi-dev up -d
sudo cp -p /opt/jetree/environments/dev/compose.yml /opt/jetree/environments/dev/compose.yml.before-freellmapi
sudo cp -p /opt/jetree/environments/dev/runtime.env /opt/jetree/environments/dev/runtime.env.before-freellmapi
sudo nano /opt/jetree/environments/dev/compose.yml
```

En el servicio `app`, agregar `networks: [default, freellmapi]`. Al nivel raíz
(junto a `services`), agregar lo siguiente; preservar servicios y opciones:

```yaml
networks:
  default: {}
  freellmapi:
    external: true
    name: jetree-freellmapi-dev
```

No conectar el worker a esa red: llama a Jetree, que ejecuta la inferencia.

```bash
sudo nano /opt/jetree/environments/dev/runtime.env
# Agregar esta variable sin modificar secretos existentes:
# FREELLMAPI_BASE_URL=http://freellmapi-dev:3001/v1
curl -fsS http://127.0.0.1:3101/api/ping >/dev/null && echo 'FreeLLMAPI saludable'
```

Abrí un túnel desde tu computadora, reemplazando usuario y host por los que ya
usás para entrar a la VPS:

```bash
ssh -N -L 3101:127.0.0.1:3101 usuario@host-vps
```

Visitá http://localhost:3101. Creá tu cuenta de FreeLLMAPI, agregá allí claves
de proveedores y copiá la clave unificada de la página Keys. Si el primer
registro pide código de instalación, consultalo localmente en los logs de su
contenedor; no compartas esos logs ni el código por chat.

El merge/deploy recrea Jetree y carga su URL/red. La huella de esquema se
actualiza después de que Codex aplique y verifique la migración en Supabase dev.
La migración ya está aplicada y verificada. Antes del merge a dev:

```bash
sudo cp -p /opt/jetree/environments/dev/schema.sha256 /opt/jetree/environments/dev/schema.sha256.before-freellmapi
printf '%s\n' 'ac92cd7c7f3f5b5f99214f3f19aa3b1af937914a313b30c4ec3d86a3093ec950' | sudo tee /opt/jetree/environments/dev/schema.sha256
sudo grep -q '^FREELLMAPI_BASE_URL=http://freellmapi-dev:3001/v1$' /opt/jetree/environments/dev/runtime.env && echo 'URL FreeLLMAPI presente'
```

No ejecutar bootstrap SQL ni migraciones manualmente en Supabase.

Estos comandos de instalación son para una instancia nueva. No regenerar
ENCRYPTION_KEY al repetirlos: perderías acceso a las claves del volumen existente.

## Referencias

- [API oficial](https://github.com/tashfeenahmed/freellmapi/blob/main/docs/en/api/01-rest-api.md)
- [Instalación oficial](https://github.com/tashfeenahmed/freellmapi/blob/main/docs/en/install/01-install.md)
- [Compose oficial](https://github.com/tashfeenahmed/freellmapi/blob/main/docker-compose.yml)
