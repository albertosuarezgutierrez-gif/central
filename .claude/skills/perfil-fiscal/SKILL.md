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
  en `lib/fiscal-deducciones.ts`.
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
| **Busto Reform** | `prop_busto_reform` | Punto y Coma SL hasta dic-2025; **desde 2026 personal (Alberto)** |
| **Luxury Busto** | `prop_luxury_busto` | Punto y Coma SL hasta dic-2025; **desde 2026 personal (Alberto)** |
| **Monte Carmelo 68** | — | **Vivienda habitual** (no es turístico; su IBI = personal) |

> **Riesgo recurrente — Socorro:** las plataformas (Booking/Airbnb) ingresan en una **cuenta de
> Punto y Coma SL**, pero **ingresar ahí ≠ tributar ahí**: **no hay contrato** de cesión piso→SL y
> la sociedad no calculó sus pagos a cuenta sobre esos ingresos. Por tanto Socorro **debe
> declararse en el IRPF personal** (50/50). Si se deja en la sociedad sin contrato, la AEAT puede
> exigir el contrato y **regularizar** (riesgo de paralela). Ya pasó en la Renta 2024.

## Reglas de clasificación de gasto (para `facturas-correo` y la renta)
- **Trading** (FTMO / retos de bróker, operativa **Interactive Brokers**) → **personal, NO deducible**.
- **Notaría + Registro** de una **compraventa** → **coste de adquisición** del inmueble (suma al
  valor para amortizar), **no** gasto corriente del año.
- **Mobiliario y obras** (IKEA, aire acondicionado, fachada, etc.) → **a amortizar**, no gasto del
  año al 100%.
- **Pagos al Ayto. de Sevilla de ~19,5 €** (varios al año) → **tasa de basura**, **no** el IBI.
- **Seguros de hogar de los pisos** → deducibles del alquiler del piso que aseguran (cada póliza a su
  piso; no confundir el de Socorro con el del dúplex).
- **Seguro salud ASISA (póliza 009460888)** → `destino='seguros'` (bucket **negocio**, gasto deducible
  actividad económica). Art. 30.2.5ª LIRPF: primas de seguro de enfermedad del autónomo en estimación
  directa, deducibles hasta **€500/persona/año** (Alberto + Pilar + hijos <25 → máx. ~€1.500/año).
  Las primas de Kutxa están en `movimientos_bancarios` con `destino='seguros'`+`destino_confirmado=true`.
- **Gimnasio — Círculo Mercantil Sevillano** → `personal` (bucket `no_deducible`) pero con deducción
  autonómica **Andalucía**: D.A. 1ª Ley 7/2021: **15% gastos deportivos, máx. €100/año de base →
  deducción máxima €15/año** en cuota IRPF autonómica. Se anota vía `movimientos_bancarios.comentario`,
  NO cambia el `destino`. Sin límite de renta. Aplica a gastos del contribuyente, cónyuge o dependientes.
- **Donativos — Fundación Sagrados Corazones** → `personal` (bucket `no_deducible`) pero deducción
  directa en cuota: **Ley 49/2002 mecenazgo: 80% primeros €150 + 35% del resto** en cuota IRPF.
  Requiere **certificado Modelo 182** anual de la entidad. Se anota vía `comentario`; el `destino`
  permanece `personal`. Los recibos están anotados en `movimientos_bancarios.comentario` (30/06/2026).

### Reglas por COMERCIO dictadas por Alberto (23/06/2026) — viven en `banca_destino_reglas`
El panel aprende por **nombre de comercio** (no solo por código de referencia): reclasificar un cargo
graba la regla `comercio → destino` y se aplica a los iguales (pasados y futuros). Sembradas:
- **Correduría** (`seguros`, gasto de actividad): **IONOS** (hosting), **PETROPRIX** y **PRIMAPRIX**
  (gasolina — usa el coche para la correduría).
- **Pisos** (`turistico_pisos`): **NETFLIX** (TVs de los pisos), **GUTIERREZ ALCALA** (alquiler de los
  subarrendados Luxury + Busto Reform; vienen 2 cargos/mes, el mayor = Luxury, el menor = Busto Reform).
- **Bizum** → SIEMPRE **personal** (regla pura en `lib/destino.ts`, auto-confirmado → no pide revisión).
- **GENERALI seguro coche** → lo mete en **correduría** como gasto (decisión de Alberto), pero **SIN
  regla global** (GENERALI es nombre de aseguradora; una regla rompería la detección de comisiones):
  se reclasifica solo ese recibo.
- **PriceLabs/DynaPrice** → pisos (ya auto). Mandan **factura por email en PDF** → deben archivarse
  TODAS en Drive (justificante, vía `facturas-correo`).
- **PENDIENTE:** «Sueldo −1.440 € por la baja» (Kutxa) — falta saber de quién es la nómina (correduría /
  pisos / empleado de Pilar) y si es pago delegado de IT (reembolso de la SS).

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
