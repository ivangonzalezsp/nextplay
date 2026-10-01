# Changelog

Cambios visibles de Next Play. Las novedades y correcciones nuevas se añaden bajo `## [Unreleased]`; el workflow de release promociona ese bloque a una versión fechada.

## [Unreleased]

### Features

- Icono propio de Next Play en la ventana de escritorio, navegador, bandeja de Windows, accesos directos e instalador.
- Selector de Codex actualizado con GPT-6.1 Sol, GPT-6 Sol y GPT-6 Luna; modelo y esfuerzo se pueden cambiar y guardar desde el chat sin perder la conversación. Ajustes conserva Guardar/Cancelar y las combinaciones compatibles.

- Cambio incompatible previsto para 1.0.0: el instalador Windows incluye Electron y abre Next Play en una ventana propia. Las actualizaciones conservan el perfil existente, respaldan los datos y preferencias de escritorio y recuperan idioma/color del navegador una sola vez.
- Prototipo de escritorio con Electron: ventana propia, perfil de prueba aislado, servidor local gestionado por la app y apertura externa de páginas web y juegos de Steam.
- Preparación de Next Play Server para Docker: servidor compilado sin Electron, volumen persistente, configuración Compose y workflow de distribución y validación nativa AMD64/ARM64 en PR o bajo demanda.
- La ventana de escritorio abre 15 px más ancha y alta; idioma y color pasan de la cabecera a «General» en los ajustes, conservando las preferencias de cada dispositivo.
- Ajustes se unifica en una pantalla con General, Cuentas, Motor e IA y Datos: desaparecen los diálogos encadenados y los pasos de configuración; las conexiones opcionales y el diagnóstico quedan plegados.

### Correcciones de errores

- La barra lateral de escritorio es más compacta y deja 24 px de separación con el contenido.
- Ajustes se alinea con las demás opciones de la barra lateral y comparte sus estilos, sin la raya superior.
- El prototipo Electron elimina la barra de menús, conserva los atajos de teclado y muestra la versión y la búsqueda de actualizaciones en los ajustes de la aplicación.

## [0.9.1] - 2026-09-30

### Features

- Interfaz bilingüe español/inglés con selector de banderas, idioma persistente y nuevas recomendaciones en el idioma elegido; README de desarrollo y descargas con acceso directo a ambas versiones.
- Inmersivo pasa a ser el único diseño, con cinco paletas de color: Menta, Océano, Violeta, Ámbar y Rosa.

### Correcciones de errores

- Ninguno.

## [0.9.0] - 2026-09-30

### Features

- Tutorial inicial opcional con revisión de juegos jugados y preferencias para ajustar las recomendaciones; las respuestas se guardan por paso y el recorrido puede retomarse desde Ajustes sin inventar fechas de juego.

### Correcciones de errores

- Ninguno.

## [0.8.0] - 2026-09-30

### Features

- Modo guiado en el chat: la IA hace preguntas para acotar tu juego ideal hasta que pulses «Recomiéndame ya». Los mensajes y las fichas recomendadas aparecen como una conversación encima del cuadro de texto.
- La IA recibe un índice compacto de los juegos elegibles para orientarse en bibliotecas grandes, con etiquetas compartidas y un límite de contexto que conserva el acceso al catálogo completo.

### Correcciones de errores

- Las fichas recomendadas ajustan las acciones y las portadas al ancho disponible en pantallas pequeñas.

## [0.7.0] - 2026-09-23

### Features

- En Inmersivo, Ajustes y conexiones pasa al pie de la navegación lateral; en pantallas estrechas queda al final del menú.
- Nueva sección Estadísticas con horas registradas, distribución de tiempo, estados, juegos más jugados y rankings de etiquetas de Steam y géneros por presencia y horas, con desglose de los juegos al pasar sobre cada barra.
- Nuevo tema Inmersivo con navegación lateral, arte panorámico de Steam, tarjetas coherentes en recomendaciones, biblioteca y lista corta, y estados vacíos sin copy ornamental.
- La vista Inmersivo mantiene la recomendación como foco, compacta las alternativas y los juegos en curso en una cuadrícula con carátulas verticales, tags y progreso visible, y añade un diálogo de detalles sin ocultar acciones ni filtros.
- La Biblioteca en Inmersivo usa tarjetas horizontales con carátulas verticales, tags visibles y filtros agrupados para reducir espacio vacío sin perder acciones.
- La Lista corta adopta el mismo formato horizontal para aprovechar mejor las carátulas y destacar la decisión entre candidatos.
- El Historial presenta sus búsquedas guardadas como bloques desplegables y reutiliza las tarjetas horizontales de recomendaciones.
- La navegación del tema Inmersivo usa una rail más ligera, con estados activos claros y contadores separados.
- La rail lateral del tema Inmersivo comparte ahora la misma superficie desde el logo hasta la navegación.
- El diálogo de filtros del tema Inmersivo adopta una composición centrada con campos agrupados y acciones claras.
- Inmersivo pasa a ser el tema inicial; el HUD original sigue disponible como Legacy y las elecciones de tema guardadas se conservan.
- La elección principal, otras opciones y los descubrimientos muestran el vídeo de IGDB al cargar, sin espera ni bucle.
- La previsualización de vídeo en Inmersivo ya no muestra el aviso «Tráiler al pasar» sobre las carátulas.

### Correcciones de errores

- Ninguno.

## [0.6.2] - 2026-09-21

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
