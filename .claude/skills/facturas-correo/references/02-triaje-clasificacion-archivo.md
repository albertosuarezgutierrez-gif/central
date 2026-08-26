# Pasos 1–3 — Localizar candidatos, clasificar y archivar

## Paso 1 — Localizar candidatos (Gmail)
Query base (ventana corta para la pasada diaria; amplía a `newer_than:30d` en la primera):

```
newer_than:2d -label:Facturas/Procesada -in:draft
( subject:(factura OR justificante OR recibo OR invoice OR receipt OR pedido OR "ticket")
  OR has:attachment filename:pdf
  OR label:Triaje/Contabilidad
  OR from:(pricelabs.co OR amazon OR ionos OR booking OR smoobu OR stripe OR endesa OR emasesa OR digi OR mgx.cabify.com) )
```
Incluye también los **reenvíos de `pilar.pina.franco@gmail.com`** que sean justificantes de compra.

> **Buzón puente del agente `correo-triaje`:** ese agente etiqueta como **`Triaje/Contabilidad`**
> todo correo que huele a factura/recibo/banco (de ahí el `OR label:Triaje/Contabilidad` de arriba).
> Así lo que él detecta entra en ESTA pasada sin depender de las keywords. ⚠️ **Limitación conocida:**
> un cron de Vercel NO puede disparar esta rutina de Claude Code, así que lo etiquetado se recoge en
> la siguiente pasada programada (08:00), no al instante. Si quieres reducir esa latencia, añade en
> `claude.ai/code → Rutinas` un 2º disparo diario de esta skill (p.ej. 15:00) — es acción manual tuya.
Descarta newsletters, citas de calendario (`Invitación:`/`Aceptado:`), promociones, **notificaciones operativas de Cabify** que NO sean recibo (`¡Tu viaje ha finalizado sin cambios!`, `¡Esto solo acaba de empezar!`, emails de invitaciones/descuentos) y **notificaciones operativas de la correduría** (recibos devueltos de clientes, avisos de emisión, circulares de compañías aseguradoras — Allianz, Mapfre, Generali, Occident — que NO sean facturas a nombre de Alberto).

Para cada candidato: `get_thread` FULL_CONTENT → extrae **emisor, fecha, importe(s), concepto,
a nombre de quién, método de pago** del cuerpo o del PDF adjunto.

## Paso 1-bis — Subidas MANUALES a Drive (Alberto/Pilar suben ficheros a mano)
Gmail no lo cubre todo: a veces Alberto **escanea/sube una factura a mano** a Drive en vez de
reenviarla por email (Leroy Merlin el 02/07/2026; Castuera 055/2026 el 09-10/07/2026). Esos ficheros no
tienen correo candidato → sin este paso se quedarían huérfanos. **Regla: una subida manual a Drive se
trata EXACTAMENTE igual que un correo** — detectar → leer → verificar que es nueva → clasificar → si es
deducible, archivar + conciliar (Pasos 2-4); si es personal, no archivar. En cada pasada:

1. **Localiza las subidas manuales** (PDFs que Alberto dejó a mano, sin pasar por Gmail). Barre, en
   este orden:
   - **Buzón `_subir_aqui`** (`parentId = '1JlK9JXIpqlbDlOawtAFlk4_X7bn0Onjf'`, dentro de `FACTURAS
     Apartamentos / 2026`) — carpeta ÚNICA y sin ruido donde Alberto deja las subidas manuales. Es la
     vía preferente: todo lo que caiga aquí es un candidato a procesar. Tras archivar, deja el aviso
     «🗑️ borrar del buzón: <nombre>».
   - **Raíz `FACTURAS Apartamentos / 2026`** (`parentId = '1M7PwjU3MSJ7zb83rhlXzTx1O2RlTad3O'` y
     `mimeType != 'application/vnd.google-apps.folder'`): red de seguridad — lo bien archivado vive
     SIEMPRE dentro de las subcarpetas de mes, así que un PDF suelto en la raíz es una subida manual
     pendiente.
   - **PDFs recién creados por Alberto FUERA de la estructura de FACTURAS** (fallback, por si no usó el
     buzón — pasó con el Castuera 055, que acabó en `ALBERTO 2026 PERSONAL (SEGUROS)/JULIO`, una
     estructura personal distinta): `owner = 'me' and mimeType contains 'pdf' and createdTime >
     '<hoy-3d>'`. Descarta los que ya vivan dentro de una subcarpeta `NN-Mes-2026` de FACTURAS (ya
     archivados) y el ruido evidente (declaraciones, docs personales que no son gasto). ⚠️ Si un
     **deducible** aparece en el árbol personal (p. ej. `…PERSONAL (SEGUROS)/…`), archívalo bien en
     FACTURAS **y además** registra esa copia personal en la papelera `_DUPLICADOS_BORRAR` (aviso «⚠️
     mal ubicado») para que Alberto no confíe en ella y la borre.
2. **Verifica que es NUEVA antes de tocar nada (anti-duplicado — clave).** `read_file_content` →
   emisor + fecha + importe(s). Es un **duplicado ya procesado** (NO re-archives ni re-concilies) si se
   cumple CUALQUIERA de estas dos:
   - ya existe una copia normalizada en la subcarpeta del mes con mismo emisor+fecha+importe
     (`YYYY-MM-DD_emisor_importe.pdf`), **o**
   - el cargo bancario de ese importe ya está `conciliado=true` con `factura_ref` (query del Paso 4).
   En ese caso NO re-archives ni re-concilies: registra el duplicado en la **papelera
   `_DUPLICADOS_BORRAR`** (ver bloque de abajo) para que Alberto lo borre, y pasa al siguiente (fue
   justo el caso Castuera: el agente ya lo había archivado y conciliado desde Gmail, y las copias
   manuales de la raíz y de PERSONAL(SEGUROS) eran duplicados).
3. **Si es nueva:** clasifica (Paso 2). Ojo: un mismo PDF puede traer factura + rectificativa/abono
   (como el Leroy). Si es **deducible** → copia a la subcarpeta del mes con el nombre normalizado
   (Paso 3) → concilia (Paso 4), igual que un correo. Si es **personal** → no la archives (solo
   anótala en el resumen).
4. El MCP de Drive no mueve/borra ficheros: tras archivar (o al detectar un duplicado), registra el
   fichero sobrante en la **papelera `_DUPLICADOS_BORRAR`** para que Alberto lo borre a mano.

> **📁 Papelera de duplicados `_DUPLICADOS_BORRAR`** (`parentId
> '1Au-_pFEPqvwZN_a7xKNZzVZOWGMAAO7Z'`, dentro de `FACTURAS Apartamentos / 2026`). El MCP de Drive no
> mueve/borra/edita ficheros, así que la papelera NO contiene los duplicados: contiene **un mini-aviso
> por duplicado** que Alberto usa como lista de tareas de borrado. Por cada duplicado detectado (fichero
> sobrante, copia mal ubicada en el árbol personal, o carpeta de mes duplicada):
> 1. **Idempotencia:** primero `search_files` en la papelera por título; si ya existe un aviso para ese
>    duplicado, NO crees otro.
> 2. Si no existe, crea un aviso con `create_file` (`parentId` = papelera, `contentMimeType` `text/plain`
>    → queda como Google Doc): **título** `BORRAR — <descripción corta>`; **cuerpo** con qué es, su
>    ubicación, el **enlace directo** al fichero/carpeta a borrar (`https://drive.google.com/file/d/<id>/view`
>    o `/drive/folders/<id>`), y el enlace a la copia BUENA (marcada «NO borrar»). Cierra con «Cuando lo
>    borres, borra también este aviso».
> 3. En el resumen a Alberto, enlaza la papelera y di cuántos avisos hay pendientes.
> 4. **Auto-verificación (cada pasada, ANTES de crear avisos nuevos):** `search_files` en la papelera y,
>    por cada aviso existente, comprueba con `get_file_metadata` el `<id>` del fichero/carpeta que enlaza.
>    Si el `get_file_metadata` ya NO lo encuentra (Alberto lo borró), el aviso es **zombi**: como el MCP
>    no borra, NO puedes eliminarlo tú → lístalo en el resumen como «✅ ya resuelto, puedes borrar el
>    aviso: <título>». Los avisos cuyo fichero SÍ sigue existiendo son borrados reales aún pendientes.
>    Así la papelera no acumula avisos muertos aunque el agente no pueda vaciarla.
> Cuando Alberto borra el fichero real, borra también el aviso — así la papelera queda a cero cuando
> todo está limpio. (Origen: pauta de Alberto 10/07/2026 — quería una única bandeja de duplicados a
> borrar; auto-verificación de zombis añadida el mismo día.)

## Paso 2 — Clasificar (mismas reglas que `apps/plataforma/lib/categorizar.ts`)
`destino` ∈ { turistico_pisos, turistico_duplex, seguros, personal } (traspaso_interno no aplica aquí).

- **turistico_pisos (deducible):** BOOKING, EXPEDIA, AIRBNB, STRIPE, SMOOBU, PRICELABS, IONOS
  (dominios), IKEA/LEROY/BRICO/FERRETER (mobiliario pisos), TASKRABBIT (montaje/instalación en pisos),
  SIQUE (limpieza), EMASESA (agua), ENDESA/TOTALENERGIES (luz), DIGI (internet),
  DIMITRI (mantenimiento), D CULTO (comida empresa).
- **turistico_duplex (deducible):** COMUNIDAD, PASAJE FRANCISCO, **PASAJE/FRANCISCO MOLINA**,
  **VILLASÍS** y suministros del dúplex. ⚠️ El **dúplex = "Villasís"** son el **mismo piso** (Pasaje
  Villasís 1 / Pasaje Francisco Molina 4, dos accesos); tributa en el **IRPF personal de Alberto**.
- **seguros (correduría, deducible):** compañías de seguros (Generali, Allianz, Mapfre, Caser, Anthropic Ireland — API Claude…), **CABIFY** (desplazamientos de la correduría — el recibo llega de `no-reply@mgx.cabify.com` con asunto `Alberto, tu viaje por X €`; incluye origen/destino/importe), **GOOGLE** (Google Workspace, Google One, Google Drive, suscripciones de Google usadas para el negocio — factura/recibo de Google o PayPal a Google), **PETROPRIX** (gasolineras — repostajes de la correduría; TODAS las facturas de Petroprix son de la correduría, confirmado por Alberto 11/07/2026), **FAL.AI / withorb.com** (SaaS de IA vía Orb/Stripe, factura "fal - Features & Labels, Inc." — confirmado deducible correduría por Alberto 11/07/2026).
- **personal (NO deducible):** Círculo Mercantil / natación / gimnasio / colegio / vacunas /
  compras de familia (**Pilar = la esposa**, los hijos, Carmen…), IBI y **suministros de la vivienda
  habitual Monte Carmelo** (luz — Energía XXI/Endesa, agua, gas…), y **trading** (FTMO / retos de
  bróker, cuenta Interactive Brokers).
  - ⚠️ **Guardería = personal PERO genera deducción de cuota (20/07/2026):** la **EI Estrella Polar /
    Grupo Workandlife** (recibos `RECIBO ESCUELA INFANTIL` mensuales + `GRUPO WORKANDLIFE … CONCEPTOS
    ANUALES`) es la guardería de los 2 peques <3. Va a `personal` (NO baja base), pero lleva
    `deduccion_cuota_tipo='guarderia'` → incremento de la deducción por maternidad (hasta €1.000/hijo) en
    la renta de **Pilar**. Reglas de comercio ya sembradas (auto-marca los futuros). Sus facturas/recibos
    **SÍ conviene archivarlas** como justificante de la deducción. Detalle completo en `perfil-fiscal`.
  - ⚠️ **DIGI = internet de TRES sitios, y va ENTERO a los pisos (26/08/2026).** `DIGI Spain Telecom,
    S.A.U.` (NIF **A84919760**), **76,00€/mes** (76,50€ en feb-2026), cargo a fin de mes en Kutxabank.
    La factura desglosa **2× Fibra 300Mb a 25,00€ + 1× Fibra SMART 1Gb a 20,00€ + móvil 100GB a 6,00€**,
    que cubren **Socorro 24, los dos pisos de Bustos Tavera 22 (comparten una fibra) y Monte Carmelo**
    (vivienda habitual). Alberto dicta que **se imputa el 100% a `turistico_pisos` /
    `prop_multi_apartamentos` / SUMINISTROS** aunque la parte de Monte Carmelo no corresponda — no lo
    prorratees por tu cuenta ni lo mandes a `personal`. ⚠️ **El Dúplex NO es DIGI**: tiene otro proveedor
    (20,90€) y otra cuenta (BBVA). Titularidad: ver el caveat de la SL más abajo.

  - ⚠️ **ENERGIA XXI = SIEMPRE la luz de Monte Carmelo → personal** (confirmado por Alberto,
    02/07/2026): es la comercializadora **regulada** de Endesa y solo la tiene la vivienda habitual.
    Sus correos/facturas → `personal`, NO archivar en Drive, NO conciliar como deducible. No confundir
    con la luz de los pisos: **ENDESA ENERGIA** (mercado libre, Kutxa → `turistico_pisos`) y la del
    dúplex (**TE/TotalEnergies o Endesa** en BBVA → `turistico_duplex`). En banco ya es automático:
    regla `ENERGIA XXI` en `banca_destino_reglas` + detección determinista auto-confirmada en
    `apps/plataforma/lib/destino.ts`. Si aprendes reglas de luz, clave ESPECÍFICA — nunca «ENERGIA»
    ni «ELECTRICIDAD» a secas (arrastran la ENDESA de los pisos).

> ⚠️ **Factura a nombre de PUNTO Y COMA GESTION SL ≠ factura ajena.** La SL (NIF **B90446683**) está
> **dormida desde finales de 2025** y desde 2026 todos los pisos tributan en el IRPF personal de Alberto,
> pero varios proveedores siguen emitiendo a nombre de la SL porque el contrato nunca se cambió. Alberto
> ya dictó el criterio con los 4 recibos de Endesa de Bustos Tavera (03/07/2026): **se deducen y archivan
> como suyos**, dejando el caveat en `comentario`. Aplica igual a **DIGI** (26/08/2026). La SL está en
> `sociedades`, así que `receptor.ts` la reconoce como titular y NO la descarta como ajena — si alguna vez
> vuelve a salir «ajena», comprueba esa fila antes que el extractor. **Pendiente de fondo (no lo cierres tú):**
> el cambio de titular con cada proveedor —con DIGI está pedido desde el 01/02/2026 y seguía incompleto el
> 08/07/2026— y confirmar con Asecon el tratamiento de las facturas aún tituladas a la SL.

> ⚠️ **La dirección fiscal del cliente en una factura ≠ lugar de uso del artículo.** Alberto usa
> "Monte Carmelo 68" (vivienda habitual) como dirección de facturación en muchos proveedores, incluso
> cuando compra material para los pisos turísticos. Ejemplo: CREATE ventilador de techo (jun-2026)
> venía dirigido a Monte Carmelo 68 pero era para Casa Socorro → `turistico_pisos`. Regla: si el
> proveedor vende **material físico** (muebles, electrodomésticos, herramientas, ferretería, CREATE…),
> **preguntar siempre** si va a un piso turístico o a la vivienda habitual antes de clasificar. Solo
> `personal` automático si el concepto o descripción del artículo es inequívocamente del hogar
> (colchón matrimonial, ropa de cama talla familiar, electrodoméstico de cocina doméstica, etc.).

### Reenvíos de Pilar (pilar.pina.franco@gmail.com) — regla especial
Los reenvíos de Pilar pueden ser tanto personales como de pisos. **NUNCA auto-clasificar** si el
concepto puede ir a cualquier lado. Regla:
- Círculo Mercantil, natación, colegio, farmacia, supermercado → **personal** (auto).
- Taskrabbit, fontanero, electricista, tiendas de muebles/hogar, Amazon, ferretería → **"Para tu decisión"** (pregunta siempre: ¿es para los pisos o personal?).
- Proveedores claramente de pisos (IKEA con dirección de piso, Sique, Emasesa…) → **turistico_pisos** (auto solo si el concepto lo deja claro).

> Contexto fijo: Dúplex (= **Villasís**) = **Pasaje Francisco Molina / Pasaje Villasís** (no Monte
> Carmelo, que es la vivienda habitual). Pisos turísticos en Kutxa; Dúplex + correduría en BBVA.
> Detalle en `apps/sivra/docs/contabilidad.md`.
>
> **Tratamiento fiscal (IRPF) → skill `perfil-fiscal`.** Resumen de lo que NO es "destino" sino
> tributación: **Socorro** y el **dúplex/Villasís** tributan en el **IRPF personal** de Alberto
> (Socorro 50/50 con Pilar) aunque cobren en cuentas de la **sociedad Punto y Coma SL**. **⛔ Amortización:
> NUNCA de oficio** (regla dictada por Alberto 02/07/2026, canónica en `perfil-fiscal`): todo
> gasto deducible va como gasto corriente del año al 100% salvo que Alberto ordene amortizar
> ESA factura — su criterio es meter el máximo gasto posible cada año. Excepción que sigue:
> **notaría/registro de compraventa** = coste de adquisición (no gasto del año). Los pagos
> al Ayto. de ~19,5 € son **tasa de basura**, no IBI.

## Paso 3 — Archivar en Drive (solo deducibles)
Estructura real para **2026**: `FACTURAS Apartamentos / 2026 / <MM-MesNombre-2026>` (ahora anidada en
`CENTRAL/03 · FACTURAS Y GASTOS/apartamentos/`; el `fileId` no cambia, ver `docs/DRIVE-ESTRUCTURA.md`).
- Carpeta raíz 2026: ID `1M7PwjU3MSJ7zb83rhlXzTx1O2RlTad3O`.
- Subcarpetas ya creadas (por mes): `01-Enero-2026` (`1L8D9la1lqb9DY2IDX6dXJWwfuDxVmE9w`), `02-Febrero-2026` (`1GcREzRoLElDB1_wpyk0nbJ55Oxpxp2-_`), `03-Marzo-2026` (`1Eaasm2mb4kWY-9E6c1u4osBkcyVcNYtE`), `04-Abril-2026` (`1gGiTOpU1YmXVZGvJGpAE4uU4BxrnPz_d`), `05-MAYO-2026` (`1AmGqd-ffk1Zjkg-O5jlfZZrnFFTdH-ky`), `06-Junio-2026` (`1kL7ZXMIH9uf63H63X9Vkb7SvDvuY5LUu`), `07-Julio-2026` (`13PxwtWOWx4nmIAOX00x6FikF97RcNTA9` — canónica).
- **Antes de crear la carpeta del mes, comprueba SIEMPRE si ya existe** (`search_files` por título dentro
  de la raíz 2026): si existe, REUSA esa; si hay **varias con el mismo nombre** (pasó en julio-2026 con
  dos `07-Julio-2026`), usa la **más antigua como canónica**, copia a ella lo que falte de las otras, y
  registra las sobrantes en la papelera `_DUPLICADOS_BORRAR`. Solo crea una nueva si NO existe ninguna.
- Nombre del fichero: `YYYY-MM-DD_emisor_importe.pdf` (ej. `2026-06-08_pricelabs_64.96USD.pdf`).
- ⚠️ Los MCP Drive disponibles **no incluyen "mover"** (solo `copy_file`). Para organizar hay que copiar y luego Alberto borra el original de la raíz manualmente.
- Si el correo trae **PDF/imagen adjunta** → súbela. Si el justificante es solo **cuerpo HTML**
  (p. ej. Círculo Mercantil) → guarda el cuerpo como documento (`create_file`) con el mismo nombre.
- Los **personales NO se archivan** (no hacen falta para el gestor).

