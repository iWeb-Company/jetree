import InformationPage from '@/components/InformationPage';

export default function AIUsage() {
  return <InformationPage title="Uso responsable de IA">
    <ul className="list-disc space-y-4 pl-5">
      <li>Revisá las respuestas: la IA puede inventar información, equivocarse o interpretar mal una solicitud.</li>
      <li>Un manager puede delegar a los especialistas asignados. Sus instrucciones y mensajes forman parte del contexto enviado a sus proveedores.</li>
      <li>Compartí únicamente datos autorizados y necesarios. No pegues secretos ni datos sensibles innecesarios.</li>
      <li>Revisá las escrituras en GitHub y Google Drive antes de aprobarlas. Una respuesta del agente no acredita una operación externa: consultá su resultado y auditoría.</li>
      <li>No uses respuestas automáticas como única base para decisiones médicas, legales, financieras o que afecten derechos de personas.</li>
      <li>Configurá alertas y presupuesto en el proveedor de IA. El número de turnos permitido por Jetree no garantiza un gasto máximo.</li>
    </ul>
  </InformationPage>;
}
