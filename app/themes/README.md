# Temas

El HUD original vive en `app/globals.css` y permanece disponible como el tema `Legacy` (`default`).

Para añadir un tema:

1. Copia uno de los CSS de esta carpeta y cambia su selector `html[data-theme='identificador']` y sus variables.
2. Importa el archivo en `index.css`.
3. Añade su identificador y nombre a `THEMES` en `lib/themes.ts`.

Cada módulo define paleta, superficies, fondo, radios y color de texto de botones. Puede añadir reglas propias bajo su selector. `index.css` aplica las variables a los componentes compartidos; los portales de ajustes y desplegables heredan el tema desde `html`.

La elección se guarda en localStorage con la clave `nextplay-theme`. Sin elección, con un tema desconocido o con almacenamiento bloqueado, la carga usa Inmersivo. Las elecciones ya guardadas se conservan, incluido `default`, que ahora aparece como Legacy. Los estilos Steam, PS5 y Switch 2 son interpretaciones visuales, no réplicas de sus interfaces.

Inmersivo (`cinema`) es el tema inicial y adapta los mockups aprobados a los componentes reales: navegación lateral, tarjetas con acciones compactas y arte panorámico de Steam. El arte se carga únicamente en este tema; si no está disponible, la recomendación conserva su carátula. No requiere migración ni altera datos personales.
