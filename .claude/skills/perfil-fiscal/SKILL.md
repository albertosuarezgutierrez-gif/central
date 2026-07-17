---
name: perfil-fiscal
description: Router de contexto FISCAL y PATRIMONIAL de Alberto (persona física) + la sociedad Punto y Coma SL. Úsalo SIEMPRE que Alberto pida algo de su renta/IRPF, declaración, gastos deducibles, qué piso tributa dónde, su asesoría, o cuando trabajes con `facturas-correo`, `fiscal-novedades` o el módulo `/finanzas`. NO duplica los datos personales (esos viven en la BD `fiscal_perfil`/`fiscal_descendientes`); aquí está la ESTRUCTURA: qué entidad declara qué, las reglas de gasto y los caveats. Sin cifras ni datos sensibles.
---

# Perfil fiscal / patrimonial — Alberto (casa de marcas)

Mapa de **quién tributa qué** y reglas para no equivocarse al clasificar gastos o calcular la
renta. **Los datos sensibles (fechas de nacimiento, ingresos, importes, nº de cuenta del bróker,
IBAN) NO están aquí**: viven en la BD (`fiscal_perfil` + `fiscal_descendientes`, Supabase
`wswbehlcuxqxyinousql`, por `cuenta_id`) y en el borrador de la AEAT. Esto es solo la estructura.

## ⚠️ Declaración 2025 ya presentada (30/06/2026)
La declaración IRPF 2025 de Alberto (y Pilar) **ya está presentada**. No tocar datos de 2025 ni
reclasificar movimientos del año anterior. **Solo importa 2026 en adelante** para cualquier análisis
fiscal, clasificación de gastos, o revisión de movimientos bancarios. Los movimientos anteriores a
2026-01-01 en `movimientos_bancarios` ya están con `destino_confirmado=true` y `requiere_revision=false`.

## Entidades
- **Personas físicas:** **Alberto Suárez Gutiérrez** y su esposa **María del Pilar Piña Franco**
  (casados, separación de bienes). ⚠️ El cónyuge es **Pilar**, no "Carmen". **3 hijos** →
  **familia numerosa general** (título solicitado en 2025; sus efectos se retrotraen a la fecha de
  solicitud, así que aplica a la Renta 2025).
- **Pilar es autónoma** — su actividad tiene su propia sección `/finanzas/pilar` en la plataforma.
  Sus cuentas bancarias se importan con `titular='conyuge'` y sus movimientos van a `destino='actividad_pilar'`.
  Sus datos fiscales (ingresos brutos, gastos deducibles, cuota autónomos, retenciones) se guardan
  en `fiscal_perfil` (campos `conyuge_*`). Modelo 130 trimestral calculado automáticamente
  (`rendimiento_neto × 0.20 − retenciones_15%`). Para comparar conjunta vs separada: `compararDeclaracion()`
  en `lib/fiscal-deducciones.ts` (⚠️ desde PR #686 recibe las retenciones REALES del titular y la base
  SIN la reducción por conjunta — ver caveats del módulo abajo).
- **Sociedad:** **Punto y Coma SL** — ⚠️ **dejada DORMIDA / INACTIVA desde finales de 2025** (NO
  disuelta ni liquidada: la SL **sigue existiendo**, solo cesa la actividad — es más barato que
  liquidarla formalmente). En 2025 operó hasta el cese; **desde 2026 no opera nada por ella** → lo
  que tributaba por la sociedad pasa a **personal** (o nueva estructura, a confirmar). Al estar
  dormida mantiene **obligaciones formales mínimas** (baja de actividad en Hacienda/036, **IS de la
  sociedad inactiva** a cero, depósito de cuentas) pero **SIN** evento de liquidación (no hay cuota
  de liquidación ni ganancia/pérdida patrimonial por disolución). Lo lleva la asesoría.
  **➡️ Desde 2026, TODOS los pisos van a nombre de Alberto (IRPF personal): nada por la sociedad.**
- **Asesoría:** **Asecon Consultores** (renta personal **y** la sociedad). Interlocutora habitual:
  Marta (`malbarran@` / `rentas@aseconconsultores.com`).

## Mapa propiedad → quién tributa (IRPF personal vs sociedad)
| Piso (como lo dice Alberto) | Alias en sistemas | Tributa en |
|---|---|---|
| **Socorro** (C/ Socorro 24) | House Sevillana / `prop_house_sevillana` | **IRPF personal**, 50/50 Alberto+Pilar |
| **Villasís** = **el Dúplex** | Duplex Center / `prop_duplex_center` · Pasaje Villasís 1 = Pasaje Francisco Molina 4 (mismo piso) | **IRPF personal** (Alberto) |
| **Busto Reform** (C/ Bustos Tavera 22, **izquierda**) | `prop_busto_reform` | Punto y Coma SL hasta dic-2025; **desde 2026 personal (Alberto)** |
| **Luxury Busto** (C/ Bustos Tavera 22, **derecha**) | `prop_luxury_busto` | Punto y Coma SL hasta dic-2025; **desde 2026 personal (Alberto)** |
| **Monte Carmelo 68** | — | **Vivienda habitual** (no es turístico; su IBI = personal) |

### Referencias catastrales (para casar IBI / Ayto. Sevilla caso a caso)
| Piso | Referencia catastral |
|---|---|
| **Socorro** (House Sevillana / `prop_house_sevillana`) | **`5732032TG3453B0001PK`** (confirmada por Alberto 17/07/2026) |
| Villasís / Dúplex (`prop_duplex_center`) | *pendiente* |
| Monte Carmelo 68 (vivienda habitual) | *pendiente* |

> ⚠️ La referencia catastral **NO viaja en el concepto del feed PSD2** (solo aparece en el detalle de
> la app del banco / recibo). Sirve para que Alberto identifique el inmueble, **no** para auto-casar el
> movimiento — los IBI seguirán casándose a mano por importe/fecha/cuenta (ver LANDMINE del IBI abajo).

> **Riesgo recurrente — Socorro:** las plataformas (Booking/Airbnb) ingresan en una **cuenta de
> Punto y Coma SL**, pero **ingresar ahí ≠ tributar ahí**: **no hay contrato** de cesión piso→SL y
> la sociedad no calculó sus pagos a cuenta sobre esos ingresos. Por tanto Socorro **debe
> declararse en el IRPF personal** (50/50). Si se deja en la sociedad sin contrato, la AEAT puede
> exigir el contrato y **regularizar** (riesgo de paralela). Ya pasó en la Renta 2024.

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
  - **Socorro 24** (House Sevillana, ref. catastral `5732032TG3453B0001PK`) → **`turistico_pisos` + `propiedad_id='prop_house_sevillana'`** + `subcategoria='ibi'`, **deducible** del alquiler. ⚠️ **El IBI de Socorro TAMBIÉN se debita desde BBVA ****1175** (no solo el del Dúplex): el recibo de **242,93€** (02/06/2026, `Adeudo nº 2026153000286371`) se auto-clasificó como `turistico_duplex` **por descarte de cuenta** y Alberto lo corrigió a Socorro el 17/07/2026. **Moraleja: "domiciliado en BBVA 1175" NO implica Dúplex** — casar por importe/ref, no por la cuenta.
  - **Villasís/Dúplex** (Pje. Francisco Molina 4) → **`turistico_duplex` + `propiedad_id='prop_duplex_center'`**, **deducible**. También se domicilia en **BBVA ****1175** (concepto `Impuesto municipal`/`RECAUDACION MUNICIPAL`; incluye la **tasa de basura ~19,50€**). ⚠️ La misma cuenta domicilia Socorro Y Dúplex → no basta la cuenta para distinguirlos.
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

- **⚠️ LANDMINE — el "seguros por descarte" de BBVA NO es un gasto deducible confirmado (17/07/2026):**
  la BBVA ****1175 **es** la cuenta de la correduría, así que `lib/destino.ts` mandaba TODO cargo de BBVA que
  no casara el Dúplex a `destino='seguros'` (bucket **negocio → deducible**) con `revisar=true`. Eso es una
  **conjetura "por si acaso"**, NO una afirmación: para las **compras de consumo personal** (bar, ropa, súper)
  es casi siempre **falsa** y pintaba un ✅ deducible engañoso. Reglas nuevas:
  - **Consumo personal claro en BBVA → `personal` por defecto (NO deducible).** `destino.ts::RE_CONSUMO_PERSONAL`
    enruta `RESTAURANTE|CAFETERIA|GRANDES SUPERFICIES|SUPERMERCAD|HIPERMERCAD|MODA|PELUQUER|PERFUMERIA|JUGUETER|ZAPATER`
    a personal. Si un gasto de esos SÍ es de la actividad, Alberto lo sube a `seguros` y se aprende la regla del comercio.
  - **Gasolineras NO entran ahí:** el carburante de la correduría **sí** es deducible (autónomo) → sigue en `seguros`.
  - **Bizum de salida de BBVA = "Enviado: <nombre>"** (sin la palabra BIZUM) → `personal` confirmado (`destino.ts`).
  - Lo que NO casa ningún patrón sigue cayendo a `seguros`+`revisar` (backlog de "Adeudo nº …" sin comercio → los confirma Alberto).
  - Cuando Alberto reporte un cargo mal clasificado, corregir el movimiento **y** aprender la regla por comercio
    (`banca_destino_reglas`, clave específica vía `claveComercio`; nunca una clave genérica tipo "COMERCIO"/"GRANDES").

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
- **PriceLabs/DynaPrice** → pisos (ya auto). Mandan **factura por email en PDF** → deben archivarse
  TODAS en Drive (justificante, vía `facturas-correo`).
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
  (`facturas-correo` archiva los PDF de email en Drive y concilia; **PriceLabs al 100%**).
- **`movimientos_bancarios.amortizable`** (BOOLEAN): marca el cargo como inmovilizado (mobiliario/obra
  — ver regla de clasificación arriba). Los amortizables se **excluyen del gasto deducible del año** y
  se listan aparte (nota en base imponible + sección del CSV `/api/finanzas/gastos/export` para la
  asesoría). v1 NO calcula el % de amortización (3% inmueble / 10% mobiliario): solo separa y lista.

## Caveats del módulo `/finanzas` (motor `lib/fiscal-deducciones.ts`)
- **Maternidad sin prorrateo:** calcula €1.200 × hijos < 3 **sin** prorratear por mes de nacimiento
  → **sobreestima** en el año de nacimiento (un hijo de noviembre da ~€200, no €1.200). Es
  orientativo; el dato fino sale del borrador AEAT.
- **Guardería:** el incremento (hasta €1.000) exige **centro AUTORIZADO** (que presenta el
  **Modelo 233**); si el gasto figura en los datos fiscales, es señal de que el centro está autorizado.
  Se marca con `deduccion_cuota_tipo='guarderia'` en `movimientos_bancarios` (PR #647).
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
  Pilar (run-rate ×12/meses transcurridos); el escenario «Hoy» mantiene lo devengado real.
  **La IA ya NO está en la petición**: los patrones se proyectan por SQL (`detectarPatronesSQL`,
  todos proyectables) y las etiquetas legibles salen de la caché `patrones_recurrentes_cache`, que
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

<!-- verificado: 2026-07-13 -->
