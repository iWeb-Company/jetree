import InformationPage from '@/components/InformationPage';

export default function Terms() {
  return <InformationPage title="Condiciones de uso">
    <section><h2 className="text-xl font-semibold">Uso del workspace</h2><p>Jetree está destinado al trabajo de las personas autorizadas por iWeb. Cada cuenta debe usarse por su titular y dentro de los departamentos y permisos asignados. Los administradores gestionan el acceso global. No intentes acceder a información ajena ni eludir las aprobaciones de herramientas.</p></section>
    <section><h2 className="text-xl font-semibold">Contenido y servicios externos</h2><p>Usá contenido que estés autorizado a compartir. Las respuestas de IA pueden contener errores y deben revisarse antes de usarlas. Una aprobación autoriza la operación concreta que muestra el panel; revisá destino y contenido antes de aprobar. Los servicios externos pueden tener restricciones, costos y condiciones propias.</p></section>
    <section><h2 className="text-xl font-semibold">Disponibilidad y costos</h2><p>La aplicación puede interrumpirse por mantenimiento o fallos de sus proveedores. Las credenciales de IA conectadas consumen el saldo o presupuesto de su titular. El límite diario de ejecuciones de Jetree no es un límite monetario del proveedor. No dependas de una respuesta automática para decisiones críticas.</p></section>
    <section><h2 className="text-xl font-semibold">Soporte y datos</h2><p>Para problemas de acceso, corrección o eliminación, contactá al administrador en <a href="mailto:facundod@iwebtecnology.com" className="text-cyan-300 underline">facundod@iwebtecnology.com</a>. Estas condiciones describen el uso operativo del workspace; los acuerdos comerciales o laborales se gestionan por separado.</p></section>
  </InformationPage>;
}
