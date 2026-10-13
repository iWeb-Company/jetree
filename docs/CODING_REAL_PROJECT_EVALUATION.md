# Evaluación en un repositorio real: SmartTweaker

Evaluación del 13/10/2026 sobre [facudemarco/smarttweaker](https://github.com/facudemarco/smarttweaker), base `91fede47ebf833f95afd4c56b87e0c7cbb9cf650`. El usuario eligió el repositorio, autorizó una corrección pequeña del frontend y aprobó instalar sus dependencias únicamente dentro del contenedor. Su `.agents/AGENTS.md` exige esa aprobación.

## Preparación

La copia capturó 200 archivos. Omitió instaladores EXE/MSI, símbolos PDB y el ejemplo de entorno. El lockfile v3 tiene 242 entradas y usa rangos beta válidos; el validador ahora acepta prereleases y tags, manteniendo versiones, integridad y origen HTTPS fijados en el lockfile. No se instaló nada en Windows ni se ejecutó Tauri, Rust o ajustes de hardware.

Las dependencias se instalaron con scripts desactivados y se montaron de solo lectura. El build original `npm run build` (TypeScript + Vite) terminó con cero. Los directorios dist/target/.next se omiten del contexto y de los diffs para que un build no se informe como cambios de código.

## Resultado del agente

Tarea: permitir cerrar el login con Escape, limpiar el listener y dar al diálogo un nombre accesible mediante el título y un ID único. Mantener estilos, texto, autenticación, paquetes y otros archivos.

- Groq GPT OSS 20B produjo una edición parcial, pero la ejecución falló con HTTP 429 y 413. Esa copia se conservó y no se aplicó ni se reejecutó. No se atribuye éxito a Groq en esta evaluación.
- Una ejecución distinta sobre otra copia con OpenRouter/free cambió únicamente `src/components/LoginModal.tsx`. El build terminó con cero y los hashes de todos los archivos capturados del original quedaron intactos. No se aplicó ni publicó el cambio en SmartTweaker.
- El frontend compilado se sirvió en un navegador de pruebas separado, con la red externa bloqueada y sin autenticación real. En el original, Escape no cerró el login. En la copia corregida cerró, funcionó de nuevo al reabrir, otras teclas no cerraron y el diálogo tuvo `aria-modal` y un nombre accesible. La captura visual conservó el estilo original.

## Corrección del diagnóstico

El gateway convertía el 413 del proveedor en un 502 genérico, que podía provocar reintentos innecesarios del SDK. Ahora conserva 413 con cuerpo sanitizado y categoría `REQUEST_TOO_LARGE`. El error HTTP conocido del proveedor tiene prioridad sobre un error genérico del transporte Docker. No se conservan cuerpos crudos, cabeceras ni claves.

Esta prueba valida un cambio pequeño en un frontend real, no todos los flujos de escritorio, hardware, pagos o autenticación de SmartTweaker. Los modelos gratuitos tienen límites variables; una prueba corta exitosa no garantiza capacidad para tareas grandes. La vinculación del panel existente continúa limitada a su proyecto descartable: esta evaluación se hizo con el CLI y no amplió sus permisos.
