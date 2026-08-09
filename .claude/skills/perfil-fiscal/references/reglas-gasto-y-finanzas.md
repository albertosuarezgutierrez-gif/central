# Reglas de gasto, inversión y módulo /finanzas

## Reglas de clasificación de gasto (para `facturas-correo` y la renta)
- **Trading** (FTMO / retos de bróker, operativa **Interactive Brokers**) → **personal, NO deducible**.
- **Notaría + Registro** de una **compraventa** → **coste de adquisición** del inmueble (suma al
  valor para amortizar), **no** gasto corriente del año.
- **⛔ Amortización — SOLO con orden explícita de Alberto (dictado 02/07/2026):** NUNCA marcar un
  cargo como `amortizable` sin que Alberto lo diga expresamente para ESA factura. **Su criterio es
  meter el MÁXIMO gasto deducible posible cada año** → por defecto todo va como gasto corriente del
  año al 100% (aunque técnicamente fuera mobiliario/obra). El toggle `amortizable` existe en
  `/finanzas` para cuando él decida usarlo caso a caso. (Sustituye a la regla anterior que mandaba
  IKEA/obras a amortizar de oficio.)
- **IBI (`RECIBO AYTO. SEVILLA` / `Impuesto municipal` / `RECAUDACION MUNICIPAL`) — deducibilidad POR INMUEBLE (03/07/2026):** el IBI se clasifica según de qué piso es, NO por el concepto (que es idéntico para todos):
  - **Socorro 24** (House Sevillana) → **`turistico_pisos` + `propiedad_id='prop_house_sevillana'`**, **deducible** del alquiler.
  - **Villasís/Dúplex** (Pje. Francisco Molina 4) → **`turistico_duplex` + `propiedad_id='prop_duplex_center'`**, **deducible**. Se domicilia en **BBVA ****1175** (concepto `Impuesto municipal`/`RECAUDACION MUNICIPAL`; incluye la **tasa de basura ~19,50€**). Ya venían auto-clasificados en turistico_duplex.
  - **Monte Carmelo 68** → **`personal`** (vivienda habitual, **NO deducible**). Domiciliado; su 2s 2025 se cobró 03/11/2025.
  - **⚠️ LANDMINE — NUNCA crear una `regla` global para `AYTO SEVILLA`/`RECIBO AYTO. SEVILLA`:** el mismo concepto vale para un piso turístico (deducible) y para la vivienda habitual (personal) → una regla por concepto clasificaría mal. Casar **caso a caso** por importe/fecha/cuenta.
  - **Recargo de apremio / intereses** (cuando el recibo va en ejecutiva, p.ej. Socorro pagado 17/02/2026 a 282,07€ = 251,79 principal + recargo) → estrictamente **NO deducible** (solo el principal). El sistema no hace split; se anota en `comentario`.
- **Pagos al Ayto. de Sevilla de ~19,5 €** (varios al año) → **tasa de basura**, **no** el IBI. Sigue el destino del inmueble al que pertenece (p.ej. la basura del Dúplex → `turistico_duplex`).
- **Seguros de hogar de los pisos** → deducibles del alquiler del piso que aseguran (cada póliza a su
  piso; no confundir el de Socorro con el del dúplex).
- **Cuota autónomos (RETA / TGSS) en BBVA** → `destino='seguros'`, `subcategoria='cuota_autonomos'`,
  **deducible** actividad correduría (Art. 30.2.1ª LIRPF). Clasificación automática en `lib/destino.ts`
  (PR #627, 01/07/2026). Concepto típico: "ADEUDO DE CUOTA DE LA SEGURIDAD SOCIAL // PAGO DE IMPUESTO".
  ⚠️ La RETA de Pilar va a `actividad_pilar` (su cuenta Kutxabank, `titular='conyuge'`), nunca aquí.
  ⚠️ **Ya se ha roto DOS veces** (18/07/2026 por `destino_confirmado` zombie; 01/08/2026 por la regla
  aprendida `CUOTA → personal`, que se aplica por substring y gana a `destino.ts`). Si Alberto ve un ❌
  en una cuota de la Seguridad Social de BBVA, mira primero `banca_destino_reglas` y el flag
  `destino_confirmado`, no `lib/destino.ts` (que lleva la regla correcta desde el PR #627).
- **Seguro salud ASISA (póliza 009460888)** → `destino='seguros'` (bucket **negocio**, gasto deducible
  actividad económica). Art. 30.2.5ª LIRPF: primas de seguro de enfermedad del autónomo en estimación
  directa, deducibles hasta **€500/persona/año** (Alberto + Pilar + hijos <25 → máx. ~€1.500/año).
  Las primas de Kutxa están en `movimientos_bancarios` con `destino='seguros'`+`destino_confirmado=true`.
- **Gimnasio — Círculo Mercantil Sevillano** → `personal` (bucket `no_deducible`) pero con deducción
  autonómica **Andalucía**: D.A. 1ª Ley 7/2021: **15% gastos deportivos, máx. €100/año de base →
  deducción máxima €15/año** en cuota IRPF autonómica. Se marca con `movimientos_bancarios.deduccion_cuota_tipo='deportiva_and'`
  (desde PR #647); `fiscal_perfil.gasto_deportivo_anual` acumula el total. Sin límite de renta.
  Aplica a gastos del contribuyente, cónyuge o dependientes.
- **Donativos — Fundación Sagrados Corazones** → `personal` (bucket `no_deducible`) pero deducción
  directa en cuota: **Ley 49/2002 mecenazgo: 80% primeros €150 + 40% del resto** en cuota IRPF.
  Requiere **certificado Modelo 182** anual de la entidad. Se marca con `deduccion_cuota_tipo='mecenazgo'`
  (desde PR #647); el `destino` permanece `personal`. Los recibos están anotados en `movimientos_bancarios.comentario` (30/06/2026).

### Reglas por COMERCIO dictadas por Alberto (23/06/2026) — viven en `banca_destino_reglas`
El panel aprende por **nombre de comercio** (no solo por código de referencia): reclasificar un cargo
graba la regla `comercio → destino` y se aplica a los iguales (pasados y futuros). Sembradas:
- **Correduría** (`seguros`, gasto de actividad): **IONOS** (hosting), **PETROPRIX** (gasolina —
  usa el coche para la correduría) y **PEPEPHONE** (fibra+móviles del suministro **San Juan de la
  Palma 28** — decisión de Alberto 02/07/2026; ⚠️ sus recibos NO aparecen en ninguna cuenta
  conectada del sistema: se pagan desde una cuenta externa, conciliación bancaria pendiente). ⚠️ La regla **PRIMAPRIX se ELIMINÓ el 02/07/2026**: Primaprix
  es un súper de descuento (compras familiares → `personal`), la confusión era con Petroprix.
- **Pisos** (`turistico_pisos`): **NETFLIX** (TVs de los pisos), **GUTIERREZ ALCALA** (alquiler de los
  subarrendados Luxury + Busto Reform; vienen 2 cargos/mes, el mayor = Luxury, el menor = Busto Reform),
  y desde la pasada IA del 03/07/2026: **SMOOBU** (channel manager), **SI QUE BRILLA** (limpiezas),
  **LAVANDERIA EL GIRANDILLO** y **DIGI SPAIN TELECO** (fibra de los pisos, Kutxa).
- **Personal** (03/07/2026): **GALOS CMI** (bar del Círculo Mercantil) y **RECIBO CIRCULO MERCAN**
  (cuotas de socio, con `deduccion_cuota_tipo='deportiva_and'`).
- **⚠️ Regla ELIMINADA (03/07/2026): `TE ELECTRICIDAD Y GAS ESPANA → turistico_duplex`** — era una
  mina: los recibos TE (TotalEnergies) de **Kutxa** son el gas de **Monte Carmelo (vivienda habitual
  → personal**, CUPS ES0031102227887014EY0F); el Dúplex ya va con **Endesa por BBVA**. NO re-crearla:
  la luz se imputa por CUPS/contrato (tabla en la skill `facturas-correo`).
- **Bizum** → SIEMPRE **personal** (regla pura en `lib/destino.ts`, auto-confirmado → no pide revisión).
- **GENERALI seguro coche** → lo mete en **correduría** como gasto (decisión de Alberto), pero **SIN
  regla global** (GENERALI es nombre de aseguradora; una regla rompería la detección de comisiones):
  se reclasifica solo ese recibo.
- **PriceLabs/DynaPrice** → pisos (ya auto). ⚠️ **PriceLabs DE BAJA 09/08/2026** (los 4 pisos
  tarifican con el motor propio): no se esperan facturas nuevas — como mucho una última en agosto,
  que se archiva en Drive como siempre. Los cargos históricos del banco siguen clasificándose a
  pisos (la regla `PRICELABS|DYNAPRICE` de `lib/destino.ts` se queda para el histórico).
- **Prestaciones EXENTAS de IRPF (12/07/2026, PR #843) — resuelve el pendiente de la «baja»:** la
  prestación por nacimiento y cuidado del menor (paternidad) que Alberto cobra como autónomo llega a
  la correduría (BBVA, `destino='seguros'`) pero está **EXENTA** (Art. 7.h LIRPF): se marca
  `subcategoria='exento'` y `getResumenFinanciero` la **excluye de la base imponible** y de los
  trimestres (M130), pero la sigue sumando al cobrado real (caja) con una línea aparte "Prestaciones
  exentas (no tributan)". 5 abonos marcados (5.474,28€). El agente contable conoce la regla (prompt +
  `contexto.fiscal.exento`).

### Tarjeta común Kutxabank de Pilar (visa dual 4662032019650302)
Es la tarjeta **FAMILIAR** (compras del día a día), **NO** de la actividad de autónoma de Pilar →
sus movimientos van a `personal` por descarte (no a `actividad_pilar`). Vive en `cuentas_bancarias`
como **`💳 Tarjeta Kutxabank Pilar`** (`****0302`, `tipo='tarjeta'`, `titular='titular'`, oculta;
detalle importado de PDF el 02/07/2026). Sus liquidaciones mensuales aparecen como
`TARJ.CRDTO 4662032019650302` en la corriente Kutxa ****0855 → `traspaso_interno` (el gasto real
está en el detalle de la tarjeta; NO contar dos veces). No confundir con la tarjeta de Alberto
(…750300, cuenta `💳 Tarjeta Kutxabank` ****0300 vía PSD2). ⚠️ Esta tarjeta NO está conectada a
Enable Banking: si algún día se conecta por PSD2, deduplicar el histórico antes del primer sync.

## Inversión — Interactive Brokers
- Cuenta de **trading** activa. **IBKR NO informa a la AEAT** → sus **ganancias/pérdidas y
  dividendos NO salen en el borrador** y hay que **declararlos** (base del ahorro). El "FX
  worksheet" es solo la parte de divisa; hace falta el **informe de actividad anual completo**.
- **Revisar siempre el Modelo 720** (declaración de bienes en el extranjero): obligatorio si la
  cuenta superó **50.000 €**. Sanciones serias si se omite.

## Control de gastos en `/finanzas` (pestaña «Gastos»)
`/finanzas` tiene 3 pestañas (`?tab=ingresos|gastos|fiscal`). La pestaña **Gastos** es el control de
deducibilidad: bandeja **«Por revisar»** + buckets derivados de `movimientos_bancarios.destino`
(**negocio**=`seguros` · **renta**=`turistico_*` · **no deducible**=`personal` · fuera=`traspaso_interno`).
Por cargo: reclasificar (aprende regla y la reaplica a los iguales), confirmar, toggle **amortizable**,
sugerencia IA y badge de justificante (📎 con factura / ❗ sin justificante → buscar en Gmail).
- **Bandeja «Por revisar» = solo lo DUDOSO** (`requiere_revision AND NOT destino_confirmado`, ≠traspaso),
  no "todo lo no confirmado". En la práctica = cargos de **BBVA** (cuenta del negocio) que caen a
  `seguros` por descarte (se contarían como correduría → confirmar). Lo reconocido por patrón/regla
  (luz, Booking, comunidad, Bizum, comercios con regla…) y los cargos personales de Kutxa por descarte
  **NO** entran en la bandeja (siguen en su bucket). 23/06/2026 bajó de **963 → 135**.
- **Aprendizaje por comercio:** `lib/correduria.ts` `claveComercio()` extrae el comercio del concepto;
  `/api/banca/destino` aprende la regla; `lib/categorizar.ts` aplica las reglas de `banca_destino_reglas`
  por **substring** (prioridad sobre la detección automática → anula "seguros solo BBVA" para esos
  comercios; NO se aplican a cuentas del cónyuge).
- **Siguientes fases (pendientes):** agrupar la bandeja por comercio (1 decisión = todos los iguales),
  sugerencia IA en bloque + auto-proponer reglas recurrentes, y justificante automático
  (`facturas-correo` archiva los PDF de email en Drive y concilia; PriceLabs de baja 09/08/2026 —
  solo quedan sus facturas históricas).
- **`movimientos_bancarios.amortizable`** (BOOLEAN): marca el cargo como inmovilizado (mobiliario/obra
  — ver regla de clasificación arriba). Los amortizables se **excluyen del gasto deducible del año** y
  se listan aparte (nota en base imponible + sección del CSV `/api/finanzas/gastos/export` para la
  asesoría). v1 NO calcula el % de amortización (3% inmueble / 10% mobiliario): solo separa y lista.

## Auditoría fiscal 18/07/2026 (PR de «fiscalidad 100% OK») — correcciones aplicadas
Auditoría a fondo del módulo fiscal. Correcciones al cálculo REAL (no solo presentación):
- **🔴 Proyección «Fin de año» — doble conteo turístico eliminado + coste variable restado
  (`lib/proyeccion-fiscal.ts`):** el ingreso de reservas futuras se contaba DOS veces (tabla `incomes`
  + patrones de payouts de Booking del banco proyectados) y entraba SIN su coste deducible variable
  → la base proyectada se inflaba ~11.800€ (varios miles de € de «a pagar» fantasma). Ahora el
  turístico futuro se proyecta SOLO desde `incomes` y en NETO (`ingresosFuturos × (1−margen)`, margen =
  `pisos.total.gastos/pisos.total.ingresos`, cap [0,0.6]); los patrones recurrentes proyectados quedan
  SOLO para `seguros` (correduría, sin equivalente en `incomes`). `gastos-recurrentes.ts` calcula el
  run-rate como `SUM/COUNT(DISTINCT mes)` (antes `AVG` por transacción, infravaloraba).
- **🔴 FN autonómica de Andalucía con límite de renta (`lib/fiscal-deducciones.ts`):** la deducción
  andaluza por familia numerosa (200/400€) tiene límite **suma de bases ≤ 25.000€ individual /
  30.000€ conjunta**; el código la aplicaba SIEMPRE. Con la base de Alberto (~46k) **NO le corresponde**
  → ahora se gatea (`andaluciaFamiliaNumerosaLimiteIndividual/Conjunta` en `IMPORTES_POR_ANIO`,
  vigilados por `fiscal-novedades`). La deducción por **nacimiento** NO tiene límite (Ley 8/2025) y solo
  aplica el año del nacimiento — eso ya estaba bien.
- **Maternidad AHORA prorrateada** por meses en el año de nacimiento (ver abajo).
- **`tipoEfectivo` corregido** (`lib/finanzas.ts`): antes aplicaba la tarifa a toda la base SIN restar el
  mínimo personal/familiar (salía ~26% cuando el real ~19%). Ahora = `cuotaIntegra/base` (método español).
- **Tramos IRPF de fuente ÚNICA:** `finanzas.ts` y `proyeccion/ProyeccionClient.tsx` consumen
  `importesDe(year).tramos` (antes 3 copias hardcodeadas que podían desincronizarse).
- **Transparencia UI:** línea de ingreso `exento` (base < caja explicada), nota de maternidad, disclaimer
  completo en el segmento 🧾 Fiscal, tope del 10% de base en mecenazgo.

## Caveats del módulo `/finanzas` (motor `lib/fiscal-deducciones.ts`)
- **Maternidad prorrateada por mes (corregido 18/07/2026):** en el AÑO de nacimiento cuenta solo los
  meses desde el nacimiento (€100/mes; un hijo de noviembre da ~€200, no €1.200); los hijos < 3 de años
  anteriores dan el año completo. ⚠️ Sigue **sin topar por las cotizaciones de la madre** ese periodo
  (dato que no tenemos) → orientativo; el borrador AEAT manda.
- **Guardería:** el incremento (hasta €1.000) exige **centro AUTORIZADO** (que presenta el
  **Modelo 233**); si el gasto figura en los datos fiscales, es señal de que el centro está autorizado.
  Se marca con `deduccion_cuota_tipo='guarderia'` en `movimientos_bancarios` (PR #647). Va en la renta de
  **Pilar** (madre trabajadora autónoma) porque el incremento cuelga de la deducción por maternidad, que
  es de la madre.
  - **Centro concreto (20/07/2026):** los 2 peques (nac. **11/04/2024** y **10/11/2025**, ambos <3) van a
    la **EI Estrella Polar (Grupo Workandlife)** — la MISMA guardería aparece con dos textos de recibo en
    Kutxa: el mensual escueto **`RECIBO ESCUELA INFANTIL`** (~300€/mes) y los **`RECIBO GRUPO WORKANDLIFE
    EIESTRELLA POLAR CONCEPTOS ANUALES`** (matrícula anual; mensuales del nuevo curso desde septiembre).
    Ambos textos tienen **regla de comercio** en `banca_destino_reglas` (`RECIBO ESCUELA INFANTIL` y
    `GRUPO WORKANDLIFE`) → `destino='personal'` + `subcategoria='colegio'` + `deduccion_cuota_tipo='guarderia'`,
    así que los recibos futuros se **auto-marcan** en la ingesta (`analizarMovimientos` aplica el
    `deduccion_cuota_tipo` de la regla a los movimientos NO confirmados). Los 8 recibos de 2026 (2.405,60€
    hasta julio) ya quedaron marcados a mano. ⚠️ Confirmar la autorización del centro (Modelo 233) con la
    gestoría / contra el borrador AEAT.
  - **🔴 LANDMINE — el código topa la guardería en €1.000 TOTAL, pero legalmente es €1.000 POR HIJO <3:**
    `lib/finanzas.ts` suma TODOS los movimientos `guarderia` y `lib/agente-movimientos.ts:272` hace
    `Math.min(total, 1000)` → con 2 hijos <3 la app INFRAVALORA (tope real hasta ~€2.000, uno por peque,
    limitado por el gasto no subvencionado de cada uno vía Modelo 233). Es orientativo (el borrador AEAT
    manda), pero conviene un PR que tope por `nº de hijos <3 con guardería` en vez de €1.000 plano.
    Pendiente de decisión de Alberto (no tenemos el desglose de gasto por hijo desde el banco; el reparto
    real lo da el Modelo 233 del centro).
- **`compararDeclaracion()` (contrato corregido en PR #686, 02/07/2026):** recibe `retencionesTitular`
  (las retenciones REALES — antes estimaba 15% de TODA la base e inventaba miles de € de pagos a
  cuenta: el 15% solo aplica a comisiones de correduría, el capital inmobiliario no lleva retención)
  y `baseTitular` debe llegar **SIN** la reducción por conjunta de €3.400 (la aplica la función;
  pasarla ya reducida la duplicaba). En separada, los mínimos por descendientes se quedan al 100%
  en el titular (en la realidad se prorratean 50/50) — el TOTAL separada no cambia, el reparto
  titular/cónyuge es aproximado. La cabecera de `/finanzas/fiscal` y la comparativa pueden diferir
  legítimamente: la comparativa suma el rendimiento y retenciones de Pilar.
- **Estimación «fin de año»** (bloque «🧾 Mi declaración» de `/finanzas/fiscal`): la calcula
  `lib/comparativa-declaracion.ts` (`calcularEstadoDeclaracion`) usando `lib/proyeccion-fiscal.ts`
  (reservas futuras sivra + patrones recurrentes de 3 meses). Desde 03/07/2026 (PR #721) el
  escenario «Fin de año» **anualiza** las retenciones del titular y el rendimiento/retenciones de
  Pilar (run-rate ×12/meses transcurridos); el escenario «Hoy» mantiene lo devengado real. **Turístico
  futuro = SOLO desde `incomes` y en NETO** (18/07/2026, ver auditoría arriba): los patrones recurrentes
  proyectados quedan SOLO para `seguros` (correduría) para no duplicar el ingreso de pisos.
  **La IA ya NO está en la petición**: los patrones se proyectan por SQL (`detectarPatronesSQL`) y las
  etiquetas legibles salen de la caché `patrones_recurrentes_cache`, que
  rellena el cron `/api/cron/patrones-fiscal-refresh`. La comparativa se renderiza en SSR (sin
  spinner «Calculando…»).
- El módulo es **orientativo** (no sustituye a la asesoría) y solo cubre la persona física; **no**
  modela la sociedad, las propiedades ni el bróker.

## Datos vivos (NO en git)
- Perfil y deducciones reales → BD `fiscal_perfil` + `fiscal_descendientes` (por `cuenta_id` de
  Alberto). Edítalos por `app/api/finanzas/perfil` o Supabase MCP, **no** los escribas aquí.
- Borrador/datos fiscales reales → AEAT (Renta WEB).

## Relación con otras skills
- **`facturas-correo`** clasifica gastos por *destino* (turístico/dúplex/seguros/personal) y concilia
  con el banco; usa el mapa de arriba.
- **`fiscal-novedades`** mantiene los importes legales (`IMPORTES_POR_ANIO`) sincronizados con BOE/BOJA.
- **`/finanzas`** (plataforma) calcula la renta orientativa con el perfil de la BD.

<!-- verificado: 2026-07-20 -->
