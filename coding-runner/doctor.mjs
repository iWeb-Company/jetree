import { command } from './process.mjs';
import { IMAGE } from './sandbox.mjs';

export async function doctor(execute = command) {
  const result = { node: Number(process.versions.node.split('.')[0]) >= 22, git: false, dockerLinux: false, image: false, status: 'docker_unavailable', next: '' };
  try { await execute('git', ['--version']); result.git = true; } catch { /* Report missing Git separately. */ }
  try {
    const type = (await execute('docker', ['info', '--format', '{{.OSType}}'])).trim();
    if (!['linux','windows'].includes(type)) throw new Error('DOCKER_HEALTH_INVALID');
    if (type === 'windows') { result.status = 'linux_backend_required'; result.next = 'Elegí contenedores Linux en Docker Desktop.'; }
    else {
      result.dockerLinux = true;
      try { await execute('docker', ['image','inspect',IMAGE]); result.image = true; result.status = 'ready'; }
      catch { result.status = 'image_missing'; result.next = 'Ejecutá npm run code:build.'; }
    }
  } catch (error) {
    if (error.code === 'ENOENT') { result.status = 'docker_cli_missing'; result.next = 'Instalá Docker Desktop o abrí una terminal nueva para actualizar PATH.'; }
    else { result.status = 'docker_engine_unavailable'; result.next = 'Abrí Docker Desktop y revisá su error de inicio. En Windows, verificá que WSL2 pueda arrancar; instalar el cliente no alcanza.'; }
  }
  if (!result.node || !result.git) { result.status = 'prerequisites_missing'; result.next = 'Instalá Node 22+ y Git antes de continuar.'; }
  return result;
}
