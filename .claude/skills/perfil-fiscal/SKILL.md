---
name: perfil-fiscal
description: Router de contexto FISCAL y PATRIMONIAL de Alberto (persona física) + la sociedad Punto y Coma SL. Úsalo SIEMPRE que Alberto pida algo de su renta/IRPF, declaración, gastos deducibles, qué piso tributa dónde, su asesoría, o cuando trabajes con `facturas-correo`, `fiscal-novedades` o el módulo `/finanzas`. NO duplica los datos personales (esos viven en la BD `fiscal_perfil`/`fiscal_descendientes`); aquí está la ESTRUCTURA: qué entidad declara qué, las reglas de gasto y los caveats. Sin cifras ni datos sensibles.
---

# Perfil fiscal / patrimonial — Alberto (casa de marcas)

Mapa de **quién tributa qué** y reglas para no equivocarse al clasificar gastos o calcular la
renta. **Los datos sensibles (fechas de nacimiento, ingresos, importes, nº de cuenta del bróker,
IBAN) NO están aquí**: viven en la BD (`fiscal_perfil` + `fiscal_descendientes`, Supabase
`wswbehlcuxqxyinousql`, por `cuenta_id`) y en el borrador de la AEAT. Esto es solo la estructura.

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
