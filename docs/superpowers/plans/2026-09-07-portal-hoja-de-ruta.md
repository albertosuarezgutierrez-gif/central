# Portal del cliente: hoja de ruta de las cinco piezas (07/09/2026)

> Esto NO es un plan de implementación: es el ORDEN y las decisiones. Cada pieza
> se lleva su propio plan cuando le toque. Lo que fija este documento es por qué
> van en este orden y qué NO se hace en cada una.

**Origen:** dictado de Alberto el 07/09/2026 — «añade todo y empezamos», tras
proponer él la pieza 2 (formulario por ramo relleno para revisar) y la 5
(ingesta por correo).

---

## El agujero que las ordena

**Medido el 07/09/2026:** `seguros.portal_poliza_declarada` solo la leen
`apps/asegura/lib/partes-portal.ts` y `lib/export-rgpd.ts`. **Ninguna pantalla
de Alberto la mira.** O sea: el cliente sube la póliza de otra compañía con su
vencimiento y el corredor no se entera nunca. Todo lo que se afine del extractor
alimenta hoy una tabla que no lee nadie, así que la pieza 1 va primera.

## Y la dependencia que nadie había visto

`reparoDeclarada()` (`packages/module-seguros-portal/src/obligacion.ts:104`)
**no deja** que una declarada genere aviso mientras `confirmadaPorUsuario` sea
`false`, porque sus fechas las adivinó un extractor. Eso significa que **la
pieza 2 es el requisito de calidad de la 1**: sin la revisión del cliente, los
leads que le llegan a Alberto llevan fechas que no ha mirado nadie, y llamar a
un cliente con la fecha equivocada es peor que no llamarlo.

Consecuencia de diseño, no negociable: **la lista de leads distingue los tres
estados** (confirmado por la persona · leído por una máquina y sin confirmar ·
sin fecha). Nunca una lista plana.

---

## Orden

| # | Pieza | Por qué ahí |
|---|---|---|
| 1 | **El vencimiento ajeno, en `/correduria`** | Cierra el circuito. Hoy no existe en ninguna pantalla. |
| 2 | **Formulario por ramo, para revisar** | Es lo que da `confirmadaPorUsuario`, o sea la calidad de la 1. |
| 3 | **Guardar el PDF (bucket privado)** | Desbloquea releer lo ya subido. Plan ya escrito y sin hacer. |
| 4 | **Confianza por campo del extractor** | Sin ella, la 2 es un sello de goma. |
| 5 | **Ingesta por correo** | Multiplica el volumen. Va la última: sin 1-4 multiplica basura. |

---

### 1. El vencimiento ajeno, en la pantalla de Alberto

Una declarada con compañía + vencimiento **es** un lead. El aviso no va en la
fecha de vencimiento sino **un mes antes**: `DIAS_PREAVISO_TOMADOR = 30`, que es
el plazo del art. 22 LCS para oponerse a la prórroga. Pasado eso, el lead ya no
sirve para nada este año.

**No hace:** no retarifica (Avant2/Codeoscopic cuesta 0,50 € por consulta y no
es idempotente: ningún botón ni cron puede dispararlo) y no manda correos al
cliente. El lead llega a Alberto y decide él.

### 2. El formulario por ramo, relleno, para revisar

Idea de Alberto. **El riesgo es el que la hace cómoda: un formulario relleno se
firma sin leer**, y el guardar SUBE la etiqueta de confianza del dato (de
«leído de tu PDF» a «confirmado por ti»). Por eso:

- **Nunca relleno de forma uniforme.** Lo leído llega relleno y marcado; lo que
  NO se pudo leer llega **vacío y señalado**, que es donde va la atención.
- **Procedencia campo a campo**, que ya existe (`datosRamoOrigen`). Prohibido el
  sello global «confirmado» sobre todo el formulario.
- **El ramo es también una lectura**: su selector va arriba y editable, y
  cambiarlo no puede perder lo ya leído.
- **La fila se guarda ANTES de revisar** (como hoy) y la revisión la edita.
  Nunca «revisar y luego guardar»: sin bucket, abandonar la pantalla lo pierde
  todo.

Ya construido y reutilizable: `campos-ramo.ts`, `EditarPoliza.tsx`,
`poliza-editable.ts`, `/boveda/anadida/[id]`. **Lo que falta es de flujo:** hoy
subir un PDF devuelve a la lista en vez de llevar a esa ficha.

### 3. Guardar el PDF

Plan escrito y sin ejecutar:
`docs/superpowers/plans/2026-09-07-portal-documentos-bucket-privado.md`. Hoy
`portal_poliza_declarada` guarda el **nombre** del fichero, no el documento: lo
que no se leyó al subirlo no se puede releer, y cada mejora del extractor solo
vale hacia adelante.

### 4. Confianza por campo

Hoy un dato mal leído pero plausible se ve igual que uno bien leído — los
55,85 € de un suplemento guardados como prima anual son el ejemplo. Si el
extractor devuelve confianza por campo, lo dudoso llega **vacío y marcado** al
formulario de la pieza 2 en vez de relleno.

### 5. Ingesta por correo

La póliza llega por correo de la compañía. Que se **reenvíe** y entre sola quita
cuatro pasos de las veinte veces siguientes (no de la primera: entrar una vez es
inevitable, por identidad y consentimiento).

🚨 **No es `hola@grupoasegura.es` y no es un agente leyendo Gmail.** Medido:

- `hola@` es la dirección **pública** (pie de la web, aviso legal, privacidad,
  información del mediador, quiénes somos — `packages/module-seguros/src/mediador.ts:113`)
  y ya es el **`Reply-To`** de los correos del portal
  (`apps/asegura-portal/lib/canal-email.ts:35`). Un buzón haciendo tres trabajos
  obliga a la máquina a adivinar cuál es cuál, y falla en las dos direcciones y
  en silencio.
- **No hay ningún agente encendido** en el Gmail de Alberto: el agente es una
  sesión, cuando él la abre. Una ingesta que depende de un cron + un conector +
  una sesión tiene tres puntos de fallo mudos.

**Lo que sí:** Resend ya tiene **`envios.grupoasegura.es` verificado** con
`Receiving: disabled`. Activarle la recepción da un webhook a la app —
determinista, con registro. El **MX va en el subdominio**: el apex es de IONOS y
tocarlo deja a la correduría sin correo de trabajo (el propio código ya lo
razona para el SPF; vale igual para el MX, y es la misma trampa que el CNAME de
`clientes`).

Y dos cepos del diseño: **el remitente no autentica** (token por cliente en la
dirección, y aun así lo que entra queda pendiente de confirmar), y **nadie
escribe esa dirección a mano** (botón de copiar en el portal, o en el pie de los
correos que ya se le mandan).

---

## Fuera de las cinco, y medido el mismo día

- `clientes.grupoasegura.es` **resuelve** a `216.150.1.1` pero **no está en los
  dominios del proyecto Vercel `asegura-portal`** → 404. El DNS está hecho;
  falta atar el dominio en el panel, y no hay herramienta MCP que lo haga.
- `apps/asegura-web/lib/sitio.ts:50` apunta a `https://asegura-portal.vercel.app`,
  que **tampoco está** entre los dominios del proyecto. [Probable] el botón
  «Área de clientes» lleva a un 404 desde que se puso.
