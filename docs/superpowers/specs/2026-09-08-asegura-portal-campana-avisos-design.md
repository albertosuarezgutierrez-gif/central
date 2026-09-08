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
| **La franja «Tenlo a mano» se queda la primera vez; la campana la conserva después** | En iPhone la franja es lo único que explica el gesto. Un solo almacén (`app/instalacion.tsx`) para el evento `beforeinstallprompt`, que se dispara una vez |
| **Número también en el icono de la app instalada** (`setAppBadge`) | Es lo que hace que instalar sirva: ve el número sin abrir nada. Cifra solo si es cierta; con `+`/`!` un punto |

## 3. Piezas

| Pieza | Qué hace |
|---|---|
| `lib/avisos.ts` | Puro. `avisosDe({ autorizaciones \| null, obligaciones \| null, hoy })` → `{ avisos, fuentesIlegibles, globo }`. Tipos: `autorizacion_pendiente` (recibida pendiente → `/autorizaciones`), `autorizacion_sin_aceptar` (otorgada pendiente → `/autorizaciones`), `obligacion_en_ventana` (`entraEnVentana` del módulo → `/boveda#calendario-titulo`). `textoGlobo(n, ilegibles, fuentes)` |
| `app/api/avisos/route.ts` | `requireIdentidad()` por cookie; `allSettled` sobre `autorizacionesDeIdentidad` + `obligacionesDeIdentidad`; `cache-control: no-store` |
| `app/CampanaAvisos.tsx` | Servidor. Solo con sesión **verificada** (como `SalirDelPortal`): sin ella la campana pediría la API, 401, y pintaría `!` en la portada |
| `app/Campana.tsx` | Cliente. Botón 44 px + globo; panel `absolute` bajo la barra (≤480 px anclado a la pantalla, `left/right: 8px`); cierra con Escape o clic fuera; recarga al abrir; entrada «Instalar» |
| `app/instalacion.tsx` | Almacén compartido de la instalación (`useInstalacion()`, `instalar()`, `InstruccionesIOS`) |
| `globals.css` | `.salir-form ~ .tema-boton` (era `+`: con la campana en medio, el interruptor recuperaba su `margin-left:auto`) |

## 4. Lo que NO entra (y por qué), anotado en `docs/CORREDURIA-INTRANET-IDEAS.md` §M

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
