# Logros de Steam

Next Play puede hacer seguimiento de los logros de Steam de los juegos que
estás jugando, tienes en pausa o has terminado. La integración es de solo
lectura: no modifica logros ni envía la clave de Steam al navegador.

## Dónde aparece

1. Abre **Tu biblioteca** o la pestaña **Para ti**, donde aparece **Tus juegos
   en curso**, y marca un juego de Steam como **Estoy jugando**, **En pausa** o
   **Terminado**.
2. En la tarjeta del juego, al final aparece una fila con el icono de trofeo,
   por ejemplo `12/45 logros · 27%`.
3. Pulsa la fila para ver la lista de logros conseguidos y pendientes. Los
   logros ocultos que aún no has conseguido no revelan su nombre ni descripción.
4. El botón **Actualizar logros** dentro de ese panel fuerza una lectura nueva
   de Steam. En la vista de lista se muestra el contador junto al título.

## Sincronización y datos guardados

Al pasar un juego a uno de esos estados, Next Play solicita su progreso. La
aplicación vuelve a comprobar los juegos seguidos cada seis horas mientras está
abierta; al abrirla de nuevo también actualizará cualquier dato con más de seis
horas. La actualización manual ignora ese plazo.

Los resultados se guardan localmente en la base SQLite de Next Play, en la tabla
`steam_achievements`. Cada registro incluye el número de logros conseguidos, el
total, la fecha de consulta y la lista de logros. No se consulta toda la
biblioteca, únicamente los juegos que están en curso, en pausa o terminados.

## Requisitos y límites

- Se reutilizan el perfil y `STEAM_API_KEY` ya configurados para sincronizar la
  biblioteca.
- Steam debe permitir leer los detalles del perfil y del juego. Si una consulta
  falla, el último resultado guardado se conserva.
- Algunos juegos no tienen logros o no los exponen mediante Steam Web API; se
  mostrarán como `0/0`.
- El progreso es siempre el del perfil conectado a Next Play, también para un
  juego prestado mediante Steam Families.
