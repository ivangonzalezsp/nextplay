# Changelog

Cambios visibles de Next Play. Las novedades y correcciones nuevas se añaden bajo `## [Unreleased]`; el workflow de release promociona ese bloque a una versión fechada.

## [Unreleased]

### Features

- Los juegos de Steam se pueden abrir directamente con un botón compacto de reproducción.
- Ajustes permite buscar en bloque las duraciones HLTB que faltan.
- El resumen de HLTB de cada juego se puede desplegar para ver sus tres duraciones.

### Correcciones de errores

- La búsqueda de HLTB muestra claramente su progreso mientras consulta los juegos pendientes.

## [0.6.1] - 2026-09-20

### Correcciones de errores

- Los juegos añadidos directamente como terminados vuelven a aparecer en el Calendario de Mi año en su fecha real, aunque no tengan un inicio registrado.

## [0.6.0] - 2026-09-19

### Features

- Los juegos terminados de tu biblioteca también muestran y actualizan sus logros de Steam.
- El Calendario de Mi año integra los tramos de actividad por semana, con bandas legibles, cabeceras más claras y fondos neutros adaptados a cada tema. El estado y las fechas se consultan al hacer clic.

### Correcciones de errores

- HowLongToBeat prueba variantes simplificadas de los nombres con sufijos de edición, como `Master Collection Version`.
- Los distintos tramos de un mismo juego ahora se muestran en una sola línea en Timeline y Calendario.
- Cada fragmento del Timeline muestra ahora sus detalles al hacer clic, con inicio, final y estado.
- Los fragmentos del Timeline ya no se animan al pasar el ratón y muestran cursor de puntero.
- Las secuencias del mismo día que vuelven al estado inicial se ignoran para evitar tramos accidentales.

## [0.5.0] - 2026-09-17

### Features

- Ninguno.

### Correcciones de errores

- Ahora se pueden borrar de la biblioteca los juegos añadidos manualmente.
- Las ediciones equivalentes, como una edición GOTY y su edición base, ya no aparecen como descubrimientos si una de ellas está en tu biblioteca.
- Se puede detener una búsqueda de recomendaciones en curso sin esperar a que termine.

## [0.4.0] - 2026-09-17

### Features

- La actividad de la IA se muestra durante las recomendaciones y permite desplegar detalles sanitizados.
- Las recomendaciones de Codex conservan el contexto de la conversación y pueden continuar cargando resultados.

### Correcciones de errores

- Ninguna.

Actualiza desde **Ajustes → Configurar cuentas y aplicación → Buscar actualizaciones → Actualizar y reiniciar**. Se conservan biblioteca, juegos manuales, preferencias, historial y conexiones, con copia de seguridad antes de instalar.

Distribución piloto para Windows x64, sin firma de código. Windows puede mostrar un aviso de editor desconocido. Descarga únicamente desde este repositorio y comprueba `SHA256SUMS.txt` si instalas manualmente.
