# Pasos 4–5 — Conciliación bancaria, resumen y protocolo de cierre

## Paso 4 — Conciliar con el banco (Supabase)

> **Política de auto-confirmación (decisión de Alberto: «auto-confirma si cuadra exacto»).**
> El cron de plataforma (`expenses/agent/scan`) ya imputa a `gastos`; tú confirmas la conciliación
> contra el banco. Regla:
> - **Auto-confirma (marca `conciliado=true`) SOLO si:** la extracción es **limpia** (leíste emisor,
>   fecha e importe sin huecos de OCR) **Y** el importe casa **exacto** con un único movimiento
>   bancario (`abs(mb.importe + importe_factura) < 0.02`) dentro de ±7 días. Un único candidato, sin
>   ambigüedad. Esto cubre el grueso: SaaS, suministros, proveedores recurrentes con importe redondo.
> - **NUNCA auto-confirmes — deja toque a Alberto (resumen «Para tu decisión» + no marcar
>   `conciliado`) si:** es **Booking** (la liquidación trae varias reservas + comisión + IVA en un
>   PDF: casi nunca cuadra a un solo cargo exacto → confírmala a mano), o hay **varios movimientos
>   candidatos**, o el importe **no casa exacto** (cambio de divisa, redondeo, cargo agrupado como el
>   Endesa dúplex), o la extracción tiene **dudas** (importe/fecha ilegibles). Ante CUALQUIER duda,
>   no auto-confirmes: es más barato preguntar que descuadrar la contabilidad.
> - En plataforma, las liquidaciones de **Booking** ya llegan a la **bandeja de revisión** (el cron
>   las manda con `motivo="Booking: confirma la liquidación"` + aviso Telegram), nunca auto-imputadas:
>   tu trabajo es abrir el PDF en Drive y validar que el neto liquidado cuadra con el ingreso.

Por cada factura, busca su cargo:
```sql
SELECT mb.id, mb.fecha_operacion, mb.importe, mb.concepto, mb.destino, mb.conciliado, mb.duplicado_estado
FROM movimientos_bancarios mb
JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
WHERE cb.cuenta_id = '<cuenta_id de Alberto>'::uuid
  AND abs(mb.importe + <importe_factura>) < 0.02          -- gasto del mismo importe
  AND mb.fecha_operacion BETWEEN <fecha_factura>::date - 7 AND <fecha_factura>::date + 7
  AND (mb.duplicado_estado IS NULL OR mb.duplicado_estado != 'ignorado')
ORDER BY abs(mb.fecha_operacion - <fecha_factura>::date) LIMIT 3;
```
- **Encontrado** → factura ↔ movimiento casados. **Marca el justificante en el movimiento** para que
  el panel de Gastos (`/finanzas?tab=gastos`) muestre el badge **📎 con factura** (lee `conciliado` /
  `factura_ref`):
  ```sql
  UPDATE movimientos_bancarios mb
  SET conciliado = true,
      factura_ref = <enlace o fileId de Drive del justificante>,
      destino = <destino clasificado si difiere y es seguro>,
      propiedad_id = <prop_… si la factura es inequívocamente de UN piso, si no NULL>
  FROM cuentas_bancarias cb
  WHERE cb.id = mb.cuenta_bancaria_id AND cb.cuenta_id = '<cuenta_id de Alberto>'::uuid
    AND mb.id = '<id del movimiento casado>'::uuid;
  ```
  (Si el `destino` no coincide con la clasificación, corrígelo en el mismo UPDATE; scoped por `cuenta_id`.)
- **Imputa `propiedad_id` cuando la factura es de UN piso concreto (no solo la luz).** Si la dirección
  de suministro/obra o el concepto identifican inequívocamente un apartamento — climatización,
  mobiliario, reparación, EMASESA, luz — fija el `propiedad_id` en el mismo UPDATE para que las cuentas
  por piso salgan bien. Valores: `prop_house_sevillana` (Casa Socorro, C/ Socorro 24),
  `prop_busto_reform` (Bustos Tavera 22 Bajo IZQ), `prop_luxury_busto` (Bustos Tavera 22 Bajo DCHA),
  `prop_duplex_center` (Dúplex/Villasís, PJ Francisco Molina 4 1C). Si el gasto es transversal (varios
  pisos, SaaS, comisión de portal), déjalo en `NULL`. Ejemplo real: la factura Castuera 055/2026 (2
  splits en Socorro 24) → `prop_house_sevillana`.
- **No encontrado** → el cargo aún no ha entrado en el banco (factura pagada hoy / extracto sin subir).
  Déjalo en "pendiente de que entre el movimiento" (no marques `conciliado`).

> **Conciliación inversa por banco (cuando el PDF NO se puede leer — corte de vías / escaneo sin texto).**
> Si sabes que es un gasto claro (emisor + fecha por el cuerpo/asunto) pero te falta el **importe** porque
> ninguna vía de PDF lo da, no lo bloquees: **búscalo por el banco**. Corre la query del cargo SIN el
> filtro de importe (solo emisor por concepto + ventana de fecha ±7d):
> ```sql
> SELECT mb.id, mb.fecha_operacion, mb.importe, mb.concepto, mb.destino, mb.conciliado
> FROM movimientos_bancarios mb
> JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
> WHERE cb.cuenta_id = '<cuenta_id de Alberto>'::uuid
>   AND mb.importe < 0                                        -- es un gasto
>   AND mb.concepto ILIKE '%<pista del emisor>%'
>   AND mb.fecha_operacion BETWEEN <fecha_factura>::date - 7 AND <fecha_factura>::date + 7
>   AND (mb.duplicado_estado IS NULL OR mb.duplicado_estado != 'ignorado')
> ORDER BY abs(mb.fecha_operacion - <fecha_factura>::date) LIMIT 3;
> ```
> - **Un único cargo** que casa por emisor+fecha → el euro del banco **es** el importe del gasto. Confírmalo
>   (`conciliado=true`, `destino`, `propiedad_id`) y toma el importe del banco como bueno para cuadrar. El PDF
>   sigue haciendo falta como **justificante** para el gestor → deja el hilo en `Facturas/PDF-pendiente` con
>   nota «importe cuadrado por banco, falta archivar PDF» hasta que alguna vía te deje leer/archivar el PDF.
> - **Varios cargos** candidatos, o el concepto no identifica al emisor → NO adivines: `Facturas/Revisar` +
>   «Para tu decisión». La conciliación inversa solo aplica cuando hay UN cargo inequívoco.
> - Con esto, un corte de extracción deja de bloquear el **cuadre** del gasto; solo queda pendiente el
>   documento, no el número.
- **PriceLabs (y demás SaaS que facturan por email): al 100%.** Sus facturas llegan SIEMPRE como PDF
  por correo (no como cargo con concepto rico) → archívalas TODAS en Drive y concílialas con el cargo
  `PriceLabs`/`DynaPrice` del banco para encender su 📎. Si una no casa por importe (cambio USD→EUR),
  empareja por fecha + emisor y deja nota. ⚠️ **PriceLabs DE BAJA 09/08/2026**: no esperes facturas
  nuevas — como mucho una última (agosto); si no llega, NO es una factura que falta.

### Patrón especial — ENDESA DÚPLEX (dos facturas en un cargo)
Las facturas de Endesa del **Dúplex** (PJ Francisco Molina 4 1C, contrato 130139482171, BBVA ES34)
incluyen **siempre DOS facturas en un único cargo bancario**:
1. **Factura de Electricidad** (nº `P26CONxxxxxxxx`) — el importe del PDF.
2. **Factura de Servicios "Electric Protección 360 Plus"** (contrato OR-0046183234) — €5,78/mes
   (base €4,78 + IVA 21% €1,00). Nº factura empieza por `X326NC`.

El banco domicilia AMBAS en un único débito (suma = factura PDF + €5,78). **No es un error**: es el
plan de mantenimiento/asistencia del hogar contratado con Endesa. Ambas son deducibles `turistico_duplex`.
Al conciliar, acepta la diferencia de ~€5,78 entre importe de factura PDF e importe bancario.
La factura PDF ya muestra el "RESUMEN TOTAL" con las dos partidas al final del documento.

### Patrón especial — LUZ por piso (CUPS → apartamento)
Fuente: **`CUP electricidad NUEVO.pdf`** en Drive (`FACTURAS Apartamentos/2026`, fileId
`1iFpKQHHoY2JvdwOq-8TgBEJCy_5EfxiJ`, 02/07/2026 — sustituye al xlsx de 2024 que tenía titular
Punto y Coma SL). Toda factura de luz trae el **CUPS y la dirección de suministro** → identifica
el piso con esta tabla y pon `propiedad_id` en el movimiento al conciliar:

| CUPS | Dirección de suministro | Piso | `propiedad_id` | Contrato Endesa | Cargo en |
|---|---|---|---|---|---|
| ES0031101905443002ED0F | Bustos Tavera 22 **Bajo IZQ** (3,45 kW) | Busto Reform | `prop_busto_reform` | 130139655504 ✅ | Kutxabank ****0855 |
| ES0031101905443004EB0F | Bustos Tavera 22 **Bajo DCHA** (4,4 kW) | Luxury Busto | `prop_luxury_busto` | 130139685932 ✅ | Kutxabank ****0855 |
| ES0031102278830001BV0F | Socorro 24 (5,196 kW, titular Pilar) | Casa Socorro | `prop_house_sevillana` | 130139486193 ✅ | Kutxabank ****0855 |
| ES0031102657263050CJ0F | PJE Francisco Molina 4, 1C (3,45 kW) | Dúplex/Villasís | `prop_duplex_center` | 130139482171 ✅ | BBVA ****1175 |

- El concepto bancario de Kutxa trae el **nº de CONTRATO** (no el CUPS): `RECIBO ENDESA ENERGIA …
  FACTURA DE ELECTRICIDAD P26CONxxxxxxxx CONTRATO <nº>`. Usa la columna Contrato para mapear.
- ✅ **Bustos, contrato↔piso CORREGIDO con los PDF oficiales (03/07/2026):** la pareja contrato↔piso
  se había deducido por correlación factura↔ocupación (2 periodos coherentes) y Alberto la confirmó
  («ES OK»), pero estaba **intercambiada Reform↔Luxury**. Las facturas de Endesa (uploads de Alberto
  el 03/07) traen **CUPS + dirección de suministro + nº de factura** que coincide con el concepto
  bancario → prueba documental que MANDA sobre la correlación. Correcto: contrato **130139655504**
  = CUPS ...443002ED0F = **BJO IZQ = Busto Reform**; contrato **130139685932** = CUPS ...443004EB0F
  = **BJO DCHA = Luxury Busto** (Luxury/DCHA consume más en ambos periodos, coherente). Los 4 cargos
  ya reimputados con el `propiedad_id` correcto y `conciliado=true`.
- **Energía XXI contrato 130138945299** (Kutxa ****0855) = **vivienda habitual Monte Carmelo →
  `personal`**, NO imputar piso. Ídem cualquier suministro de DE LAS CRUCES 13 (Sanlúcar).
- El histórico: Fenie Energía → TotalEnergies (titular Punto y Coma SL) → **Endesa desde feb-2026**
  (titulares según el PDF NUEVO). Las facturas de TotalEnergies "Gas y Electricidad España"
  (portal Empresas) son de los contratos VIEJOS de la SL; las finales de 2026 se cargan a la
  cuenta de la SL (no está en `movimientos_bancarios`).
- Etiqueta Gmail **`Luz pendiente 2026`** (`Label_12`): la usa Alberto para marcar facturas de luz
  pendientes de imputar — revísala en cada pasada y quítala al dejar el cargo imputado/conciliado.
- Endesa NO manda email de factura para los contratos de Bustos (solo Socorro y Dúplex) — sus
  cargos aparecen solo en el banco; impútalos por nº de contrato.
- **Estado a 03/07/2026:** TODOS los cargos de luz de pisos de ene–jun 2026 en Kutxa/BBVA están
  imputados con `propiedad_id` (Socorro: −66,98 · −53,37 · −49,40 · −53,93 € | Reform (BJO IZQ):
  −38,54 · −100,00 € | Luxury (BJO DCHA): −71,42 · −133,71 €). ⚠️ Reform/Luxury estaban
  intercambiados hasta el 03/07 — corregidos con los PDF oficiales (ver nota de arriba). Desde
  jul-2026 imputa cada cargo nuevo al llegar. Las 4 facturas Endesa Bustos feb–may 2026 tienen PDF
  (uploads de Alberto 03/07); pendientes de archivar en Drive (subida binaria no factible por MCP en
  esa pasada → Alberto las suelta en la carpeta del mes).

**Otros CUPS conocidos (NO son gasto de pisos — del histórico `CUP electricidad.xlsx` 2024):**

| CUPS | Dirección de suministro | Qué es | Tratamiento |
|---|---|---|---|
| ES0031102227887014EY0F | Monte Carmelo 68, 1º IZQ (Pilar, 4,4 kW) | Vivienda habitual | `personal` — Energía XXI, contrato 130138945299, Kutxa ****0855 |
| ES0031102092195001FN0F | De las Cruces 13, Sanlúcar de Bda. (Alberto, 5,5 kW) | Casa familiar Sanlúcar | `personal` |
| ES0031102276296001FL0F | San Luis 9, Bajo-3 (3,45 kW) | Ex-suministro Punto y Coma SL | Contrato viejo de la SL — se carga a la cuenta de la SL (fuera de `movimientos_bancarios`); NO conciliar aquí |
| ES0031102276296016PB0F | San Luis 9, 1-012 (3,45 kW) | Ex-suministro Punto y Coma SL | Ídem San Luis |
| ES0031102276296009PG0F | San Luis 9, 1-010 (3,45 kW) | Ex-suministro Punto y Coma SL | Ídem San Luis |
| ES0031102403299001ZD0F | CR Sevilla-Huelva s/n, Espartinas (María Alcalá, 15 kW) | Suministro de un tercero | NO es gasto de Alberto — descartar |

- Historial de comercializadoras: Fenie Energía → TotalEnergies → **Endesa** (pisos, desde feb-2026).
  Las facturas «Facturación Total Gas y Electricidad España» (portal Empresas) que sigan llegando
  son de los contratos viejos de la SL (Bustos/San Luis) o finales tras la baja — cuenta de la SL,
  no las concilies contra Kutxa/BBVA; déjalas en «Para tu decisión» si dudas.

### Patrón especial — EMASESA (facturas bimestrales)
EMASESA factura **cada 2 meses** por piso (contratos y pisos mapeados en `facturas_drive`):
| Contrato (Nº Suministro) | Piso | `proveedor` en BD | `propiedad_id` |
|---|---|---|---|
| 0104785292 | Casa Socorro (C/ Socorro 24) | `emasesa-socorro` | `prop_house_sevillana` |
| 0105137440 | Luxury Busto (C/ Bustos Tavera 22 Bajo DER) | `emasesa-luxury` | `prop_luxury_busto` |
| 0105185751 | Busto Reform (C/ Bustos Tavera 22 Bajo IZQ) | `emasesa-reform` | `prop_busto_reform` |
| 0105329645 | Luxury Busto — 2º suministro (C/ Bustos Tavera 22 **1º DER**) · ⚠️ **INACTIVO desde sep-2025, no factura en 2026** | `emasesa-luxury-1der` | `prop_luxury_busto` |

Ciclos: meses 1, 3, 5, 7, 9, 11. No esperar facturas en meses pares. "Derecha siempre Luxury" (confirmado por Alberto).

**🔑 Cómo imputar el piso a un cargo EMASESA del banco (procedimiento definitivo — el agente DEBE hacerlo cada pasada).**
El concepto bancario **solo trae la referencia del recibo** (`RECIBO EMASESA … EMASEPE26XXXXXXXX`, que es el
nº de factura `PE26XXXXXXXX`), **NO el nº de contrato** → desde el concepto solo NO se puede saber el piso.
La fuente que sí lo da es el **correo e-factura de EMASESA**, que llega puntual cada ciclo:
- Remitente **`Servicio.eFacturas@emasesa.com`**, asunto `Factura electrónica EMASESA del contrato de CALLE …`.
  El cuerpo trae **`Nº Suministro <contrato>` + dirección de suministro + el importe** (p.ej.
  `Nº Suministro 0104785292 CALLE SOCORRO, 24 … 117,99`). Búscalos con `from:Servicio.eFacturas@emasesa.com newer_than:20d`.

Para cada cargo `RECIBO EMASESA` sin `propiedad_id` en `movimientos_bancarios`:
1. Casa el cargo con su correo e-factura **por importe exacto** (el mismo ciclo trae 3 importes distintos → no colisionan).
2. Lee el `Nº Suministro` del correo → mapea a piso con la tabla de arriba.
3. `UPDATE movimientos_bancarios SET propiedad_id=<prop_…>, destino='turistico_pisos', destino_confirmado=true,
   conciliado=true, factura_ref='EMASESA e-factura <PE26…> · Nº Sum. <contrato> · <dirección>'` (scoped por `cuenta_id`).
4. Registra la factura en `facturas_drive` (`proveedor='emasesa-<piso>'`, `anio`, `mes`, `importe`,
   `nombre_archivo=<PE26…>`, `fuente='manual'`; sin `drive_url` — EMASESA es solo portal, no manda PDF adjunto).
   Inserta solo si no existe ya la fila `(proveedor, anio, mes)`.

**Fallback si el correo no está** (borrado, aún no llegado): el **ranking de importe entre pisos es estable** —
Socorro es SIEMPRE el más alto, Luxury el medio, Reform el más bajo. Histórico 2026: Socorro 84–166€,
Luxury 59–91€, Reform 33–57€. Ciclo julio-2026 (confirmado por correo): **Socorro 117,99€ · Luxury 80,26€ ·
Reform 50,48€**. Úsalo solo como red de seguridad; el correo (contrato→dirección) es la prueba que manda.

⚠️ **Bustos Tavera 22, 1º DER (contrato 0105329645) = Luxury Busto (`prop_luxury_busto`), PERO INACTIVO desde
sep-2025 — NO se está pagando en 2026 (verificado 22/07/2026).** Físicamente es un 2º suministro del edificio
Luxury (planta 1ª DER), pero como contrato de agua está parado: sus últimas e-facturas fueron **may/jul/sep 2025**
(a titular NO personal — saludo `Hola, .` vacío, mismo patrón que los ex-suministros de la SL en San Luis 9) y
**no hay ninguna factura ni cargo bancario suyo en 2026**. Comprobación clave: en el banco (Kutxa ****0855) cada
ciclo bimestral de 2026 trae **exactamente 3 recibos EMASESA** (Socorro + Luxury Bajo DER + Reform Bajo IZQ) —
nunca un 4º. Por tanto NO se está pagando factura ajena.
- **Regla para el agente:** con 3 cargos EMASESA por ciclo, todo cuadra; **no esperes un 4º**. Si algún día
  reaparece un cargo/e-factura del 0105329645, NO lo imputes/pagues en automático: primero **verifica el titular**
  (venía a nombre de Punto y Coma SL, que está dormida desde finales de 2025) y avisa a Alberto — podría ser un
  suministro que ya no debería facturar. Si Alberto confirma que es suyo y del piso Luxury, entonces sí →
  `prop_luxury_busto`, y en `facturas_drive` usa `proveedor='emasesa-luxury-1der'` para no colisionar con
  `emasesa-luxury` del mismo mes.

### Patrón especial — SIQUE (Si Que Brilla SL, NIF B22992523)
SIQUE emite factura mensual a fin de mes por todas las limpiezas del mes (LUXURY, DUPLEX, BUSTOS
REFORMA, CASA SOCORRO). Alberto la paga mediante transferencia Kutxabank **1-3 días después** de la
fecha de factura. Todas las líneas → `destino = 'turistico_pisos'` (nota fiscal: DUPLEX y SOCORRO
tributan en IRPF personal de Alberto, pero el `destino` es igual para todas las líneas — la distinción
fiscal se gestiona fuera de este campo).

**Concepto bancario:** `TRANSF. 2100 LIMPIEZA APARTAMENTOS [MES]` (a veces solo `TRANSF. 2100`
sin el nombre del mes — misma cuenta origen Kutxabank ****0855, IBAN destino
ES48 2100 2112 1802 0121 0426).

**Al conciliar SIQUE:** si aparecen dos movimientos con el mismo importe y fecha (duplicado de
importación), usa el que tiene `duplicado_estado IS NULL`; el que tiene `duplicado_estado='ignorado'`
es el descartado. Busca por importe exacto ±5 días de la fecha de factura.

**Verificar nº de limpiezas contra reservas (opcional pero recomendado):** cruza las unidades de
cada línea de la factura con los checkouts del mes en la tabla `incomes` (JOIN `properties`):
```sql
SELECT p.name AS piso, COUNT(*) AS salidas
FROM incomes i JOIN properties p ON p.id = i."propertyId"
WHERE i."checkOut" >= '<YYYY-MM-01>' AND i."checkOut" < '<YYYY-MM+1-01>'
GROUP BY p.name ORDER BY p.name;
```
Mapeo de nombres factura → BD: LUXURY = `Luxury Busto`, DUPLEX = `Duplex Center`,
CASA SOCORRO = `House sevillana`, BUSTOS REFORMA = `Busto Reform`.

**Reglas de cuadre:**
- `incomes` solo contiene **reservas reales** (portal=BOOKING/AIRBNB…). Los bloqueos de Smoobu
  **no se importan** — no los cuentes como limpieza.
- Si el último checkout del mes cae muy a fin de mes (ej. 30/31), SIQUE puede facturarlo en el
  mes siguiente. Una diferencia de ±1 unidad en el último día del mes es normal y esperada.
- Diferencia > 1 o en pisos que no son el último día → preguntar a Alberto.

**Facturas en Drive:** se guardan en `FACTURAS Apartamentos/<año>/<mes>/` con nombre
`<YYYY-MM-DD>_SiQueBrella_<importe>EUR.pdf`. Las de 2026 que ya están conciliadas:
- Enero (798,60 €) — banco 2026-02-01, Drive `14eDOiWG9SZKlP2p6tOWukm-8NK9_rgPw`
- Febrero (1.093,84 €) — banco 2026-03-02, Drive `1dQ4PiPSoofLCSX71XRLit9KwbN4phaq0`
- Marzo (1.074,48 €) — banco 2026-04-03, Drive `1K5zwYMVu4jTDLVlbpJZp2mx4h65BcQA5`
- Abril (1.439,90 €) — banco 2026-04-30, Drive `10RKLS_FRa4gGq0hvPMh9OBsHDbjL3SUh`
- Mayo (1.360,04 €) — banco 2026-06-02 (`c9f835ee`), Drive `1HNRrPy4L35ESjjOSdTtoczVUt6l-isYz`
- Junio (902,65 €) — banco 2026-06-30 (`b0f31471`), Drive `16NKosRE-eEkOVwRSqZjC2oF3EG9_eqFf` — ✅ conciliado (02/07/2026).

## Paso 5 — Etiquetar y resumir
- `label_message` `Facturas/Procesada` en cada correo **cerrado** (idempotencia). NO lo pongas en hilos
  que dejes en `PDF-pendiente`/`Revisar` (Paso 0) — esos se reprocesan en la siguiente pasada.
- Si hay corte de extracción (Paso 0), **abre el resumen con la alerta 🔴** (N días caída · M en cola ·
  cómo arreglarlo) antes de los bloques.
- Resumen a Alberto, en bloques:
  1. **Deducibles archivados** — emisor · importe · negocio · enlace Drive · conciliación (✅/⏳).
  2. **Personales** — emisor · importe · a nombre de quién (no archivado).
  3. **Para tu decisión** — los ambiguos, con la duda concreta (además, etiquétalos `Facturas/Revisar`).
  4. **En cola persistente** — hilos en `PDF-pendiente`/`Revisar`, con los **días pendientes** de cada uno.
- NO escribas en `movimientos_bancarios` salvo conciliaciones/correcciones de `destino` seguras; lo dudoso
  se pregunta.

## Trigger (paso MANUAL de Alberto, 1 sola vez)
Claude Code web → crear **trigger programado diario** que lance una sesión con el prompt:
«Ejecuta la skill `facturas-correo`». El entorno debe tener conectados los MCP de Gmail, Google
Drive y Supabase (los mismos de esta sesión). Sin el trigger, la skill solo corre cuando Alberto la pide.

## Límites v1
- Entorno efímero → es por pasadas, no vigilancia continua. El backlog que debe sobrevivir vive en
  **etiquetas de Gmail** (`PDF-pendiente`/`Revisar`) y en `agente_salud` (Supabase), no en el resumen.
- **Adjuntos de Gmail:** el conector gestionado no baja el contenido de los PDF (solo cuerpo + IDs).
  Se cubre con la **cadena de vías** (§ "Leer importes dentro de PDF"): B (Apps Script→Drive) → A (MCP
  `gmail-adjuntos`) → OCR/lectura visual → conciliación inversa por banco → `PDF-pendiente`. **NUNCA se
  inventa el importe.** Cuando todas las vías de PDF fallan pero hay UN cargo bancario claro, el importe
  se cuadra por banco y solo queda pendiente **archivar** el PDF.
- Multi-tenant: toda query de banco SIEMPRE scoped por `cuenta_id`.

## Auto-informe (obligatorio al terminar la pasada)

Antes de cerrar, añade UNA entrada arriba del todo de la sección "Entradas pendientes de
procesar" de `docs/AGENTES-BITACORA.md` (3-5 líneas máx.):

`- **YYYY-MM-DD · <nombre-de-esta-skill>** · hizo: …; dudas: …; fallos: …; PRs/commits: …`

- Sin dudas ni fallos → `dudas: —; fallos: —` (el "todo bien" también es señal).
- Commitea la entrada con el resto de tu trabajo (o en un commit propio a `main` si la
  pasada no tocó el repo). La consume el `agentes-entrenador` (semanal) para mejorar este
  prompt; si no queda escrita, esta pasada no existió para él.

## Canal de aviso — protocolo común

**Preflight AL ARRANCAR** (no al final, cuando ya tengas algo que contar):
`GET {PLATAFORMA_URL}/api/internal/alerta` con `Authorization: Bearer {ALERTA_TOKEN}`.

- `200` → el canal está vivo, sigue con tu pasada.
- `401` → el canal está **mudo** (el token de ESTE entorno no coincide con el de Vercel `plataforma`;
  hay un entorno por rutina y se desincronizan de uno en uno). El cuerpo trae `causa` y `remedio`.
  Entonces, según `docs/AVISOS-AGENTES.md`: avisa por el **push nativo** de la sesión empezando por
  `🔇 SIN TELEGRAM (401):` y deja el aviso **entero** en `docs/AGENTES-BITACORA.md` (`fallos:`).

Nunca te inventes el token, nunca uses `CRON_SECRET` en el prompt, y **nunca falles en silencio**.
