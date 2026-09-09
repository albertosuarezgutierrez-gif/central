# Portal del cliente — la campana de avisos de la cabecera

**Fecha:** 08/09/2026 · **App:** `apps/asegura-portal`
**Origen:** Alberto, mirando el `confirm()` de «anotar que María autoriza a Gabriel… nace pendiente:
no abre nada hasta que Gabriel la acepte en su portal»: *«podría usar el banner de arriba de la
intranet para poner avisos y ahí aparezcan las invitaciones para aceptar, ¿no?»* y, aclarado que era
la intranet del CLIENTE: *«un icono de campana de avisos, para autorizaciones, vencimientos, etc.,
y que podría dar uso para instalar (ya creado)»*.

## 1. El problema, medido

- Una autorización recibida (`portal_autorizacion`, estado `pendiente`) solo se aceptaba dentro de
  `/autorizaciones` (`Autorizaciones.tsx:974-1064`). Quien entraba a mirar su póliza y no abría esa
  pestaña no se enteraba. No fallaba nada.
- Ninguna de las dos apps tenía barra de avisos. El único precedente era `InstalarApp`, arriba del
  contenido del portal.
- Los vencimientos **no tenían API**: el calendario los recibe del servidor en `boveda/page.tsx`.
  Las autorizaciones sí (`GET /api/autorizaciones`).

## 2. Decisiones

| Decisión | Por qué |
|---|---|
| **Va en el portal del CLIENTE, no en plataforma** | Quien acepta es el cliente. En `/correduria` un aviso solo diría «hay pendientes», y eso ya lo dice la ficha |
| **Campana con GLOBO obligatorio** | Una campana esconde. El portal renunció a la hamburguesa por eso mismo y lo usa gente de 50-70 años. Tres desenlaces: `n` · `n+` (alguna fuente ilegible) · `!` (ninguna legible o fallo de red). **Nunca «0» por defecto** |
| **La campana ENLAZA, no acepta** | Aceptar se hace en `/autorizaciones` con el alcance y el texto delante. Duplicar el «aceptar» en dos componentes es aceptar sin leer |
| **Sin tabla de «visto»** | El aviso desaparece cuando se resuelve (aceptar/revocar; obligación fuera de ventana). YAGNI |
| **`GET /api/avisos` con `allSettled`** | Una fuente caída no se lleva la otra y se DECLARA (`fuentesIlegibles`); un `catch → []` diría «sin avisos» sobre lo no leído |
| **Instalar es un BOTÓN de la barra (Alberto, 08/09): ni franja en el contenido ni entrada en la campana** | La primera versión fue la franja + una entrada en la campana; Alberto, viendo producción: «el instalador moverlo en el banner fijo de arriba». Un solo sitio para instalar es uno menos que se descoordina. En iOS el botón abre un globo `role="dialog"` con el gesto. Sigue habiendo un solo almacén (`app/instalacion.tsx`) para `beforeinstallprompt`, que se dispara una vez |
| **Número también en el icono de la app instalada** (`setAppBadge`) | Es lo que hace que instalar sirva: ve el número sin abrir nada. Cifra solo si es cierta; con `+`/`!` un punto |

## 3. Piezas

| Pieza | Qué hace |
|---|---|
| `lib/avisos.ts` | Puro. `avisosDe({ autorizaciones \| null, obligaciones \| null, hoy })` → `{ avisos, fuentesIlegibles, globo }`. Tipos: `autorizacion_pendiente` (recibida pendiente → `/autorizaciones`), `autorizacion_sin_aceptar` (otorgada pendiente → `/autorizaciones`), `obligacion_en_ventana` (`entraEnVentana` del módulo → `/boveda#calendario-titulo`). `textoGlobo(n, ilegibles, fuentes)` |
| `app/api/avisos/route.ts` | `requireIdentidad()` por cookie; `allSettled` sobre `autorizacionesDeIdentidad` + `obligacionesDeIdentidad`; `cache-control: no-store` |
| `app/CampanaAvisos.tsx` | Servidor. Solo con sesión **verificada** (como `SalirDelPortal`): sin ella la campana pediría la API, 401, y pintaría `!` en la portada |
| `app/Campana.tsx` | Cliente. Botón 44 px + globo; panel `absolute` bajo la barra (≤480 px anclado a la pantalla, `left/right: 8px`); cierra con Escape o clic fuera; recarga al abrir. Sin entrada «Instalar» (08/09, segunda vuelta) |
| `app/instalacion.tsx` | Almacén compartido de la instalación (`useInstalacion()`, `instalar()`, `InstruccionesIOS`) |
| `app/InstalarBoton.tsx` | Cliente. El botón «Instalar» de la barra, el primero de `.marca-acciones`: en Chrome/Android lanza el diálogo; en iOS abre un globo `role="dialog"` (Entendido, fuera o Escape; ≤480 px `fixed` a los bordes). Solo icono ≤480 px (44×44 + `aria-label`); no se pinta si no hay nada que instalar |
| `app/InstalarEnBarra.tsx` | Servidor. La puerta: sesión **verificada**, como `SalirDelPortal` y `CampanaAvisos` |
| `globals.css` | `.marca-acciones`: UN contenedor con el único `margin-left:auto`, botones separados por `gap` (orden instalar → avisos → tema → Salir a la derecha del todo). Sustituye a `.salir-form ~ .tema-boton` (que antes fue `+`). ≤380 px gap 6 px; <340 px se esconde `.marca-nombre` |

## 4. Lo que NO entra (y por qué), anotado en `docs/CORREDURIA-INTRANET-IDEAS.md` §N

- **Datos que faltan (teléfono, DNI)**: el rol del portal no lee esas columnas; no hay con qué.
- **Siniestro que cambia de estado, petición respondida, documento nuevo, recibo devuelto**:
  necesitan saber qué vio ya el cliente → tabla `portal_aviso_visto`. v2.
- **Web Push**: salida al cliente; pide OK de Alberto por envío y nace apagado, como el cron.
- **Nada que empuje a renovar o compare primas**: sería asesoramiento (IPID, análisis objetivo).

## 5. Verificación

- `lib/avisos.test.ts` (9) y `lib/campana.test.ts` (7), `pwa.test.ts` repuntado al almacén.
  **27 mutaciones, 27 rojos** (dos cepos salieron verdes a la primera y se endurecieron: buscaban
  la palabra y no la llamada).
- Playwright a 320 / 390 / 1024 con sesión firmada y BD inalcanzable: `scrollWidth` = viewport en
  los tres; Salir · campana · tema a 44 px y 10 px de separación; panel de 8 a 312 px a 320; con la
  API caída el globo es `!` y el panel ofrece reintentar.
- **Segunda vuelta (08/09, instalar como botón de la barra, PR #2636).** Playwright sobre
  `/legal/privacidad` con sesión firmada, BD inalcanzable y `/api/avisos` simulada, en tres modos
  (Chrome con `beforeinstallprompt` simulado · iOS por UA · sin sesión) y seis anchos. En todos:
  `scrollWidth` = viewport, ningún elemento de la barra fuera, los cuatro botones a 44 px de alto,
  orden instalar → campana → tema → salir; en iOS el globo `role="dialog"` dentro de pantalla y
  cerrado con Escape; sin sesión solo el interruptor de tema.

  | ancho | instalar (x→right) | campana | tema | salir | globo iOS (x→right) |
  |---|---|---|---|---|---|
  | 320 | 93→137 (icono; nombre oculto) | 143→187 | 193→237 | 243→304 | 8→312 |
  | 340 | 113→157 (icono; nombre oculto) | 163→207 | 213→257 | 263→324 | 8→332 |
  | 360 | 133→177 (icono) | 183→227 | 233→277 | 283→344 | 8→352 |
  | 375 | 148→192 (icono) | 198→242 | 248→292 | 298→359 | 8→367 |
  | 390 | 151→195 (icono) | 205→249 | 259→303 | 313→374 | 8→382 |
  | 1024 | 712→829 (con texto) | 839→883 | 893→937 | 947→1008 | 469→829 |

  Antes del arreglo la barra se salía 28 px a 320. Hasta 380 px los botones van a 6 px (medido:
  el override tiene que ir DETRÁS del bloque base de `.marca-acciones`, si no la cascada lo pisa y
  el hueco se queda en 10). Entre 341 y ~405 px el nombre va en dos líneas y la barra se queda en
  64 px.
