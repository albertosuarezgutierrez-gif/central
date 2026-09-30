---
name: correduria-crm
description: >
  El CRM de la correduría (Grupo ASegura) en /correduria de plataforma: ficha de cliente,
  póliza, leads, relaciones, portal del cliente y la conciliación Codeoscopic↔CIMA. Úsala
  ANTES de tocar cualquier pantalla o escritura de la cartera, o si Alberto habla de
  clientes, pólizas, leads, presupuestos, siniestros o del portal. Router: el detalle vive en
  docs/CORREDURIA-CRM-VISION.md.
---

# CRM de la correduría (router)

**Lee primero `docs/CORREDURIA-CRM-VISION.md`** (visión dictada por Alberto el 02/09/2026, estado
real medido, orden de trabajo). Después, según lo que toques:

- Puerto y trastienda → `apps/asegura/CLAUDE.md` («El puerto que sirve la pantalla», «Codeoscopic»).
- Pantallas → `apps/plataforma/CLAUDE.md` («La correduría se trabaja DESDE AQUÍ»).
- **Portal del cliente → `apps/asegura-portal/CLAUDE.md`** (es la fuente de verdad de esa app:
  aislamiento por código, lectura por columnas, calendario). Diseño del calendario en
  `docs/superpowers/specs/2026-09-02-asegura-portal-calendario-clientes-design.md`.
- Ideas de producto ya recogidas (con su coste y su bloqueo) → `docs/CORREDURIA-INTRANET-IDEAS.md`.
  **Mira ahí antes de proponer una idea nueva**: probablemente ya está, con lo que la bloquea.
- Sector y agente semanal → skill `agente-correduria`.
- **Ingesta de CIMA (EIAC/TIREA, cuarentena, cobertura de campos, caja negra del webhook y el
  diagnóstico de «la ingesta está muda») → skill `cima-ingesta`.** La regla 6 de aquí abajo dice
  QUÉ no se hace sin spec; el CÓMO de la tubería está allí.

## 🚨 No romper

0. **Prima, vencimiento, estado y título: la póliza de CIMA miente por compañía (27/09/2026).**
   Prima → `primaConRecibos()`, vencimiento → `vencimientoConRecibos()` (`module-seguros/vencimientos.ts`),
   nunca `primaReferencia()` sola: Allianz solo da prima y renovación en el recibo CA; Mapfre deja pólizas
   en EV sin fecha nueva (se avisa «Renovación sin confirmar», no se inventa); CIMA puede decir EV de una
   anulada (se cambia a mano con nota en `historial_interno`, la verdad es el portal de la compañía). La
   RC se titula solo por la cobertura que ES la RC («RC caballos», `tituloRc()` en `objeto.ts`); el resto
   va al desglose. Detalle en `apps/asegura/CLAUDE.md` § «Prima y vencimiento».
1. **Dos caras, dos apps.** Corredor en `apps/plataforma` (`/correduria`); cliente en
   `apps/asegura-portal` (rol `prisma_asegura_portal` sin BYPASSRLS, secreto propio). Nunca una
   pantalla compartida con permisos. En el portal el aislamiento **lo da el código**, no RLS.
2. **«Cliente» = póliza viva de CIMA**, y qué es «viva» lo decide UNA fuente:
   `packages/module-seguros/src/cartera-viva.ts` de `@central/module-seguros` (`esCarteraViva()`,
   `WHERE_CARTERA_VIVA`, `sqlCarteraViva()`) = **`import_ref IS NULL` O `eiac_xml_hash IS NOT NULL`**.
   No lo reimplementes en una consulta. `''` cuenta como volcado: es el valor de cajón que se cuela por
   `IS NULL`, `??` y `COALESCE`. Lo emitido por nosotros es «pendiente de confirmación» hasta que CIMA lo
   trae. El estado del cliente se DERIVA, no se guarda.
   🚨 **Y CLIENTE = póliza viva EN VIGOR (19/09/2026), no viva a secas.** `esCarteraViva()` responde el
   ORIGEN (CIMA la trae o la mantiene) e incluye las canceladas: 47 de 157. Alberto: «si es cancelada es
   leads». Quién es cliente HOY lo decide `esCarteraEnVigor()` / `WHERE_CARTERA_EN_VIGOR` /
   `sqlCarteraEnVigor()` (mismo fichero) = viva Y estado en `POLIZA_ESTADOS_VIGENTES`. Lo usan el grupo
   viva/leads del listado, el recuento de pólizas vivas y «clientes sin canal» (67 clientes / 105 pólizas).
   Gemelas, siniestros y lo que enseña el portal siguen preguntando por el origen.
   🚨 **`import_ref IS NULL` a secas tenía un agujero (medido 03/09/2026).** Cuando CIMA trae una póliza
   que ya estaba en el volcado no crea fila nueva: actualiza la vieja y le deja su `import_ref`, así que
   una póliza que CIMA mantiene al día contaba como lead. El segundo brazo (`eiac_xml_hash`, que solo
   escribe el pipeline EIAC) lo tapa. Hoy afecta a **1** póliza, la `3021700291186` de **Reale (C0613)**,
   que dejaba a Reale con «0 pólizas vivas» y a su cliente invisible en el CRM y en el portal.
   🚨 **`confirmadaCima` (`id_poliza_entidad !== null`) NO vale como filtro de cartera viva**: es otra
   pregunta, y usarlo dejaría fuera justo lo que emitimos nosotros y CIMA aún no ha confirmado.
   🚨 **Y `clientes.tipo` TAMPOCO vale para decir quién es cliente y quién lead (medido 03/09/2026).**
   Esa columna dice **2.742 «cliente» y 29.860 «lead»** cuando la cartera viva son **80 clientes**: es
   un campo del volcado que no mantiene nadie. Cualquier listado o filtro que la lea devuelve 2.742
   fichas muertas con cara de cartera. El grupo se DERIVA de `esCarteraViva()`, como todo lo demás.
   Cifras al 03/09/2026: **80 clientes / 110 pólizas** vivas. Las otras **28.728** pólizas
   (32.520 fichas, vencimientos 2013-2018) son volcado histórico = **leads**, jamás «clientes».
3. **Toda escritura** va por `/api/operador/*` de asegura con `correduriaId` explícito y deja fila en
   `historial_interno`. Reglas puras en `@central/module-seguros` con test.
4. **Identidad solo documentada** (DNI recibido en la ficha); contacto y dirección libres; el DNI
   entero no cruza el puerto (enmascarado).
5. **Autorización para ver seguros ajenos es direccional** y se da desde la ficha de quien autoriza.
6. **Emisión y conciliación CIMA: spec + OK de Alberto antes de código.** Hoy CIMA empareja por
   número + nombre de compañía y pisa; una emitida sin marcar se duplica o se sobreescribe.
7. **Nada sale al cliente** (email/WhatsApp) sin OK explícito. Borradores. La única salida automática
   prevista es el aviso de vencimiento del calendario, que es **informativo** (no asesoramiento) y va
   apagado — regla 13.
8. `null` ≠ `[]` en recibos, documentos, contactos, relaciones: la pantalla lo dice, no lo colapsa.
9. **Una oportunidad sin sus tarificaciones enlazadas es una oportunidad a la que no se puede
   emitir desde la pantalla (29/09/2026).** «Presupuestos de este riesgo» (P1…Pn) y el botón de
   emitir salen SOLO de `seguros.tarificaciones.oportunidad_id` (`apps/asegura/lib/oportunidad-riesgo.ts`).
   Apuntar el nº de Avant2 en `info_riesgo.presupuestoCodeoscopic`, o la prima y las ofertas en
   `prima_bruta`/`info_riesgo.ofertas`, **NO enlaza nada**: la pantalla dice «Aún no se ha pedido precio»
   y empuja a volver a tarificar, pagando 0,50€ por un precio que ya estaba (0,50€ por cotización).
   Caso fundacional: la oportunidad `5ca953b0…` del Navara 5655DSM (Antonio Cruz Sánchez) se creó a mano
   por SQL el 24/09 con el Reale aceptado (40821944) y sus 4 tarificaciones del 21/09 se quedaron con
   `oportunidad_id = NULL`. Por tanto, **al crear o tocar a mano una oportunidad:** enlaza en el MISMO
   paso las tarificaciones de ese riesgo
   (`update seguros.tarificaciones set oportunidad_id = <op> where cliente_id = <cliente> and
   correduria_id = <corr> and oportunidad_id is null and project_id_codeoscopic in (…)`), y quita de
   `info_riesgo` cualquier «pendiente» que ya se haya resuelto. Comprobación (tiene que dar 0 filas):
   `select o.id from seguros.oportunidades o join seguros.tarificaciones t on t.correduria_id = o.correduria_id
   and t.project_id_codeoscopic::text = o.info_riesgo->>'presupuestoCodeoscopic' where t.oportunidad_id
   is distinct from o.id`.
   ✅ (arreglado el mismo día: la cabecera dice «ahora en <compañía>» cuando es la de hoy, campo `aseguradoraActual`) **La cabecera mezclaba dos cosas:** pinta `coalesce(poliza_competencia.aseguradora,
   aseguradora_ganadora)` al lado de `prima_bruta`. En el caso fundacional salía «Mapfre · 276,69€» cuando
   Mapfre es la compañía de HOY y 276,69€ es la oferta de **Reale**. Antes de emitir, la compañía se mira en
   la variante, no en la cabecera. Pendiente de arreglar: el significado de `prima_bruta` no es el mismo
   en todas las oportunidades, así que no se ha tocado sin mirarlo antes.

## 🎨 La pantalla son CINCO SECCIONES, no un scroll (03/09/2026)

`/correduria` pasó de ocho bloques apilados del mismo peso a **Hoy · Clientes · Cartera · Comisiones ·
Datos** (`secciones.ts` + `Secciones.tsx`), con el buscador SIEMPRE arriba y fuera de las pestañas.
Antes de añadir un bloque, decide en qué sección vive; y si trae una cola de trabajo, **reporta su
contador al padre** (`onContador?: (n: number|null) => void`, llamado en el `.then` y guardado en un
`useRef`): una pestaña esconde, y el badge es lo único que impide que esconda TRABAJO. Tres desenlaces
y ninguno es 0 — `{n}` · `n+` (alguna cola ilegible) · `!` (ninguna legible).

**Las acciones de la ficha de cliente son DOS botones, no una fila por ramo (08/09/2026).** La
cabecera de `/correduria/cliente/[id]` (`Cabecera.tsx`, `RAMOS_PRESUPUESTO`) lleva «➕ Presupuestar ▾»
(menú `<details>` nativo con los seis ramos; 🚧 en los de esquema sin verificar) y «📄 Subir póliza»
con su aviso en el `title`. Un ramo nuevo se AÑADE a la lista del menú, no como botón; y un aviso va
pegado a lo que avisa, nunca suelto entre botones. El menú va primero porque su desplegable se ancla a
la izquierda y en segunda posición se salía a 360px. Guardián:
`test/regression-ficha-cliente-acciones.test.ts` (lee el fuente).

Un bloque **NO pinta caja propia**: se envuelve en `<Bloque>`, que da línea fina + título; `destacado`
(fondo tintado) se reserva para alarmas con alguien esperando al otro lado.

**El vocabulario del filtro de cartera** (ramos, estados, ventanas de vencimiento, parseo de la URL)
vive en `filtro-cartera.ts` de `@central/module-seguros` y lo comparten asegura y plataforma. No lo
dupliques: con una lista por app, la pantalla acaba ofreciendo filtros que el puerto no entiende, y
eso devuelve cero resultados sin un solo error. Un valor de filtro que no se reconoce se DECLARA
(`descartados`), nunca se ignora — ignorarlo convierte «los de ramo XYZ» en «todos».

El listado que lo consume ya existe de punta a punta: `GET /api/operador/cartera` (asegura) → proxy
`/api/correduria/cartera-lista` (con CSV) → `ListaCartera.tsx`. 🚨 Dos cosas que se aprendieron
ejecutando su SQL contra la BD real, no leyéndolo: **24 de las 110 pólizas vivas guardan `prima = 0`**
(sin `nullif` se sirven como «0,00€», un importe inventado sin hueco que lo delate), y **el guardián de
ese SQL tiene que leer el FUENTE con `readFileSync`** — `tsc` no mira dentro de un `Prisma.sql`, y un
test que importe el módulo tumba el job `Tests (packages + guardián)`, que corre sin `prisma generate`.

## Estado en una línea (02/09/2026)

Lectura y cuidado de la cartera: hecho (buscador, ficha cliente/póliza, edición, relaciones,
documentos, retención, retarificar, historial visible, estado derivado, guardián de duplicadas,
siniestros desde la ficha, «por qué ha subido la prima», canal de leads web `/seguros`, portal Fase 4
leyendo la cartera por `portal_vinculo`, acuñado de emitidas D2 + reglas de conciliación D3/D4). El
02/09 entró además la **v1 de la intranet del cliente**: `seguros.portal_obligacion` aplicada,
calendario con la fecha accionable, enlace de un clic en el correo de acceso y el cron de avisos
(apagado). El ENVÍO al vendor SÍ está desde el 11/09 (emisiones reales 17/09 y 23/09), solo desde «Retarificar»
de una póliza auto/moto; sin probar la idempotencia de punta a punta (sin sandbox). Falta: el port de la
ingesta CIMA, WhatsApp (sin WABA) y **desplegar el portal** (`DATABASE_URL` con la contraseña del
Vault, `PII_LOOKUP_KEY` idéntica a la de `central-asegura`, secretos de sesión/canal,
`PORTAL_PUBLIC_URL`) más `CRON_SECRET` en `central-asegura`. Tabla completa en el documento (§4) y
orden en §9.

9. **Siniestros: dos orígenes, dos reglas.** En uno de CIMA el estado lo fija la compañía (CIMA lo
   reescribe en cada pull) y se anota lo que CIMA no manda; en uno nuestro, la referencia de la
   compañía va TAMBIÉN a `id_siniestro_entidad` para que el pull case y no duplique.
10. **La prima por anualidad se DERIVA de los recibos por aniversario, no por año natural**, y
    `sin_datos` (CIMA no manda la anualidad anterior, o el ciclo está incompleto) es la respuesta
    para la mayoría de las vivas: nunca se pinta como «no ha subido».
11. **El portal lee la cartera por COLUMNAS con `prisma_asegura_portal` (sin BYPASSRLS)**: su schema
    Prisma declara solo las columnas concedidas; declarar una más rompe en la BD. El vínculo
    identidad ↔ ficha nace del email por índice ciego y **con varias fichas no se adivina**. Y
    **nunca por teléfono: un móvil identifica un HOGAR, no a una persona** (740 números compartidos
    por 1.599 fichas). El email sí es identificador limpio: 0 duplicados entre clientes distintos.
12. **Quién es quién se decide por NIF, nunca por nombre.** Agrupar personas por el nombre falla en
    las dos direcciones: parte a una en dos filas (enlazada a su ficha en una póliza y suelta en otra)
    y, peor, funde a dos parientes homónimos con los teléfonos mezclados. Orden: NIF → ficha → nombre,
    y dos NIF distintos NO se funden jamás. El NIF no cruza el puerto: asegura manda una etiqueta
    opaca por respuesta (`p1`, `p2`…) que solo sirve para agrupar. Hoy 409 de 504 filas de
    intervinientes no traen NIF (volcado) y caen al nombre, así que el aviso sigue vivo.
13. **El TOMADOR no es un interviniente**: es el `cliente_id` de la póliza y no está en
    `poliza_intervinientes`. Toda pantalla que liste «quién hay en la póliza» tiene que ponerlo ella,
    o el titular desaparece (pasaba en las 4 pólizas vivas de GLOBAL 2).
14. **Un lead web nunca fuerza un duplicado**: si el dato ya está en una ficha se anota el contacto
    ahí. Y el Telegram sale aunque el puerto esté caído: es el único rastro en ese caso.
15. **El portal NO tiene a quién escribir; el envío vive en `apps/asegura`.** `portal_canal` guarda
    **solo `valor_hash`** (SHA-256 con pimienta, `apps/asegura-portal/lib/auth.ts:28`) y su
    `ClienteEmail` solo `email_lookup_hash`; el rol del portal **no tiene GRANT sobre la columna del
    email**, y un hash no se revierte. El correo sale de `apps/asegura/lib/avisos-vencimiento.ts` +
    `app/api/cron/avisos-vencimiento/route.ts`, con `prisma_seguros` (BYPASSRLS), que sí lee
    `cliente_emails` cifrado. **No lo «arregles» metiendo un transporte de correo en el portal**: lo
    caza `test/regression-portal-obligaciones.test.ts`.
    🚨 **Y ese cron está APAGADO:** sin `ASEGURA_AVISOS_ACTIVOS === '1'` solo cuenta (`?contar=1`
    fuerza el ensayo); sin `CRON_SECRET` no se autoriza a nadie **tampoco en desarrollo** (más duro
    que `apps/plataforma`) y solo por `Authorization: Bearer`, nunca `?secret=`. **Antes de
    encenderlo se cuenta: si no salen ≤110 el filtro no funciona y no se enciende nada.**
16. **La fecha que se le enseña al cliente NO es la del vencimiento**, es la **accionable** =
    vencimiento **− 30 días** de preaviso del tomador (art. 22 LCS). «Vence el 15 de marzo» le deja
    creer que tiene hasta el 15: el plazo se le pasó el 13 de febrero. La aritmética
    (`fechaAccionable`, `entraEnVentana`, `polizaGeneraObligacion`) vive testeada en
    `@central/module-seguros-portal` y **no se reimplementa en ninguna app**.
    `seguros.portal_obligacion` cuelga del **bien**, con `poliza_id` opcional a propósito (tipos:
    `poliza`, `itv`, `carnet`, `recibo`, `mantenimiento`, `revision_gas`, `libre`); grants DML para
    `prisma_asegura_portal` y **solo `SELECT,UPDATE`** para `prisma_seguros` — el que avisa sella
    `avisada_at`, no crea obligaciones.
17. **Un aviso que no se puede entregar hay que decirlo, no suponerlo.** De los 79 clientes de CIMA,
    **44 tienen email, 52 teléfono, 53 alguno de los dos y 26 NINGUNO**: con esos 26 no hay forma de
    comunicarse y desde el código se ven idénticos a uno al que sí se avisó (regla global «¿en qué
    pantalla lo va a ver?»). Entrar al portal es un **código de un solo uso por email** (no hay
    contraseñas por diseño); el correo lleva además un **enlace de un clic que PRE-RELLENA, no
    canjea** —un GET lo consumirían los escáneres antivirus y el prefetch, y a la persona le saldría
    `ya_usado`—, y sin `PORTAL_PUBLIC_URL` https no se manda enlace, solo el código. WhatsApp **no
    existe** (no hay WABA): el canal es un puerto (`lib/canal.ts`) y `503 canal_no_disponible` («ese
    canal no está montado») **NO es** `502 envio_fallido` («el envío no salió»).
19. 🚨 **El contacto de un cliente vive en TRES sitios, y afirmar «no se le puede
    contactar» exige haber mirado los tres.** (1) su ficha; (2) **su propio dato
    colgado de la PÓLIZA** —`poliza_intervinientes` cuyo `cliente_id` es él mismo:
    CIMA lo trae y nadie lo copia a la ficha, así que el cron de avisos, que lee la
    ficha, no le manda nada—; (3) otra persona de su póliza. Caso fundacional
    (04/09/2026, lo vio Alberto en la pantalla): «19 clientes con los que NO se
    puede contactar» de los que **solo 15 lo eran** — `Esquiansa` salía ilocalizable
    teniendo a Juan Manuel López Benjumea de conductor habitual con ficha, email y
    teléfono. ⚖️ Y no se funden en un «localizable»: **tener a quién llamar no es
    poder notificar**, el preaviso del art. 22 LCS va al TOMADOR, así que un tercero
    sirve para CONSEGUIR su correo, no para darlo por avisado. La lección de método:
    la regla 13 ya decía la dirección contraria (el tomador no está en
    `poliza_intervinientes`) y `contactoEfectivo()` ya lo resolvía para la FICHA —
    pero nadie cruzó las dos pantallas, y `contactoEfectivo` además descartaba los
    intervinientes del propio tomador. Guardián: `test/regression-clientes-sin-canal.test.ts`.

20. **Avant2/Codeoscopic cuesta 0,50€ por consulta y NO es idempotente**: repetir la llamada crea
    otro proyecto y otro cargo. **Ningún botón público ni vigilancia periódica lo dispara.** Se
    vigila la FECHA (gratis) y se tarifica **una vez**, contra el cupo y el motivo de
    `seguros.codeoscopic_consumo`.

21. **Los datos de una cotización se leen con su LLAVE y su NIVEL, no a ojo (30/09/2026, PR #4103).**
    - **El precio que se confirma y emite se identifica por compañía + categoría + MODALIDAD**
      (`encontrarPrecio`, única en las 396 filas medidas). El `producto` NO distingue (tres Mapfre
      «Autos»; moto 450€/600€ a 2,49€) y «la prima más cercana» tampoco: tras un PATCH el vendor
      re-tarifica. Sin modalidad exacta → 409, nunca otra en su lugar. Todo llamador de la oferta manda
      `modalidad`.
    - **Un TODO RIESGO de coche/moto INCLUYE daños propios** (Alberto: «un todo riesgo sí incluye daños
      propios»). Lo decide la CATEGORÍA del vendor (`esTodoRiesgo`), y manda sobre su lista de coberturas
      (Reale marca «Daños propios: false» en sus TR). La «Pérdida total» es una garantía aparte:
      contradictoria → «no consta».
    - `garantias` NULL = «aún sin leer» (también si la lectura FALLÓ; se reintenta 7 días), nunca todo
      `no_consta`: eso la parrilla lo lee como «la compañía no dice».
    - Cotización RECUPERADA: fallos y supuestos no guardados se DICEN (`null`), nunca `[]`.
    - Antes de afirmar un dato del vendor, mídelo en `seguros.tarificacion_precios` (coberturas crudas y
      `tarificaciones.respuesta`): el parser puede estar leyendo bien un dato que la compañía manda mal.
    - **Y por encima de la modalidad, el `id` del vendor** (`idPrecio`, 30/09/2026 tarde): si el proyecto
      aún lo trae, se emite ESE. Toda pantalla que abre `<Emision>` le pasa `idPrecio` (cepo en
      `test/regression-rerate-fecha-y-desempate.test.ts`).
    - **Nada de IA decidiendo precios o coberturas en vivo.** Las incoherencias las marcan reglas fijas
      (`revisarCoherenciaCotizacion`, en pantalla + Telegram) y un cambio del lector se prueba gratis con
      `GET /api/operador/codeoscopic/reproceso` sobre respuestas reales. El vocabulario de coberturas de
      Codeoscopic es cerrado: un nombre nuevo sale en `coberturasNuevas` y se decide a mano.

22. **Los datos del riesgo viven en info_riesgo por CLAVE DE RAMO (30/09/2026, PR #4127).** En la oportunidad se editan
    y confirman POR RAMO: `datosVehiculo` (auto/moto), `datosVivienda` (hogar), `datosCapital` (vida/salud/decesos),
    `datosRiesgoLibre` (RC/comercio/comunidades/otros). Cada clave guarda el campo confirmado (se sella al confirmar,
    se borra al editar). Se pide precio desde la oportunidad en los 6 ramos tarificables; personas editan datos sin salir
    (carné si conductor). Catálogo de versión solo en pantalla de precio; editar marca/modelo/versión borra codigoVehiculo.
    Precarga desde polizas.datos_especificos sin confirmar.
