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
  Modelo 130 trimestral calculado automáticamente (`rendimiento_neto × 0.20 − retenciones_15%`). Para
  comparar conjunta vs separada: `compararDeclaracion()` en `lib/fiscal-deducciones.ts` (⚠️ desde PR #686
  recibe las retenciones REALES del titular y la base SIN la reducción por conjunta — ver caveats del
  módulo abajo).
  - **🚨 LANDMINE — `fiscal_perfil.conyuge_*` NO alimenta ninguna pantalla (18/07/2026, PR #991→#993):**
    hay 4 columnas (`conyuge_ingresos_brutos`/`conyuge_gastos_deducibles`/`conyuge_cuota_autonomos`/
    `conyuge_retenciones`) que **parecen** el sitio obvio para anotar sus ingresos, pero **ningún código
    las lee** salvo `GET /api/finanzas/perfil` (que ni siquiera las expone en un formulario). Tanto
    `/finanzas/pilar` como la comparativa "Mi declaración" calculan `getResumenPilar()` **en vivo desde
    `movimientos_bancarios`** (`cb.titular='conyuge' AND mb.destino='actividad_pilar'`). Escribir solo en
    `fiscal_perfil` (como hizo el PR #991) **no cambia nada visible** — hay que crear su fila en
    `cuentas_bancarias` (si no existe) + insertar los `movimientos_bancarios` reales (ver bullet siguiente).
  - **Cómo cargar sus ingresos de verdad — vía `cuentas_bancarias`+`movimientos_bancarios`, NUNCA solo
    `fiscal_perfil` (18/07/2026, PR #993):** si Pilar no está conectada por PSD2 (comprobar primero si
    ya existe una fila `titular='conyuge'` en `cuentas_bancarias`), créala (`sociedad_id` = la de Alberto
    persona física, `tipo='corriente'`, `iban`/`iban_mascara` NOT NULL → usar un placeholder si no se tiene
    el IBAN real) e inserta un `movimientos_bancarios` por cobro/gasto (`origen='xls-kutxa'`/`'xls-bbva'`
    según banco, `dedupe_hash` único por fila, `destino='actividad_pilar'`, `destino_confirmado=true`,
    `subcategoria` = `cobro_cliente`/`cuota_autonomos`/`gasto_profesional`).
    **⚠️ El `importe` de un `cobro_cliente` debe ser la BASE IMPONIBLE (sin IVA, sin retención), NO el neto
    recibido en banco:** `getResumenPilar()` calcula `retenciones = cobros × 0.15` (constante
    `RETENCION_AUTONOMO` en `lib/finanzas.ts`, SIEMPRE 15% fijo, no lee ninguna retención real guardada) y
    `rendimientoNeto = cobros − gastos − cuotaAutonomos` — si metes el neto bancario (p.ej. 1.050€ ya con
    la retención del cliente descontada) el sistema le vuelve a aplicar el 15% por encima y todo sale mal.
    Para pasar de "neto cobrado en banco" a base imponible: `Base = Neto / (1 + %IVA − %retención)`,
    asumiendo por defecto **IVA 21% + retención 15%** salvo que Alberto confirme otro tipo (p.ej. 7% si a
    Pilar aún le aplica la retención reducida de nueva autónoma) — **confirmar siempre el % con Alberto
    antes de grabar, no asumir en silencio.** Deja el supuesto en `movimientos_bancarios.comentario` de la
    fila: `ResumenPilar.notas` (nuevo campo, PR #993) lo recoge y `PilarClient.tsx` lo muestra como aviso
    📝 en pantalla, para que no se pierda que es una estimación pendiente de confirmar contra la factura real.
  - **⚠️ Pilar NO tiene gastos deducibles propios (criterio de Alberto, 18/07/2026):** todo gasto se
    imputa con retroactividad a Alberto (correduría/personal) — no crear movimientos `gasto_profesional`
    para ella salvo instrucción explícita. La cuota de autónomos (RETA) SÍ se registra siempre
    (`subcategoria='cuota_autonomos'`): es su cotización obligatoria, no una "deducción" opcional que se
    pueda desplazar a Alberto.
  - **Prestación de maternidad/nacimiento propia de Pilar → EXENTA igual que la de Alberto, pero SIN
    columna dedicada:** en su extracto bancario aparece como concepto `PENSION SS-<referencia>`, pagos
    mensuales decrecientes durante la baja. Es la misma exención Art. 7.h LIRPF que ya está codificada
    para Alberto (`subcategoria='exento'` en `movimientos_bancarios`, PR #843) — pero como su actividad NO
    pasa por `movimientos_bancarios` (no está en el sync bancario), aquí no hay campo que lo marque.
    **NO sumarlo a `conyuge_ingresos_brutos`** (no es rendimiento de actividad): anotarlo aparte en
    `docs/CONTEXTO-SESIONES.md` para que no se pierda de cara al borrador AEAT.
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
| **Socorro** (C/ Socorro 24, 41003) | House Sevillana / `prop_house_sevillana` | **IRPF personal**, 50/50 Alberto+Pilar — ⚠️ EXCEPCIÓN ejercicio 2025: tributó en Punto y Coma SL (ver nota abajo) |
| **Villasís** = **el Dúplex** | Duplex Center / `prop_duplex_center` · Pasaje Villasís 1, Es:2 Pl:01 Pt:C, 41003 = Pasaje Francisco Molina 4 (dos accesos del mismo piso; el registral es Villasís) | **IRPF personal** (Alberto) |
| **Busto Reform** (C/ Bustos Tavera 22, **bajo izquierda**, 41003) | `prop_busto_reform` | Punto y Coma SL hasta dic-2025; **desde 2026 personal (Alberto)** |
| **Luxury Busto** (C/ Bustos Tavera 22, **bajo derecha**, 41003) | `prop_luxury_busto` | Punto y Coma SL hasta dic-2025; **desde 2026 personal (Alberto)** |
| **Monte Carmelo 68** | — | **Vivienda habitual** (no es turístico; su IBI = personal) |

> **Riesgo recurrente — Socorro:** las plataformas (Booking/Airbnb) ingresan en una **cuenta de
> Punto y Coma SL**, pero **ingresar ahí ≠ tributar ahí**: **no hay contrato** de cesión piso→SL y
> la sociedad no calculó sus pagos a cuenta sobre esos ingresos. Por tanto Socorro **debe
> declararse en el IRPF personal** (50/50). Si se deja en la sociedad sin contrato, la AEAT puede
> exigir el contrato y **regularizar** (riesgo de paralela). Ya pasó en la Renta 2024.
>
> **⚠️ EXCEPCIÓN — ejercicio 2025 (dictado de Alberto, 20/07/2026):** en el año del cese, los
> ingresos de Socorro (y el Airbnb cobrado en la cuenta de la SL) **SÍ se metieron en la sociedad**:
> el IS 2025 los incluye en su cifra de negocios (63.565,26€ = todos los abonos de plataformas de la
> cuenta BBVA ****9871) y el IRPF 2025 personal se presentó sin ellos (confirmación formal de Asecon
> pedida en el hilo "Impuesto de Sociedades 2025"). La regla «Socorro → IRPF personal» aplica
> **desde 2026** (cuando además TODOS los pisos pasan a nombre de Alberto). El riesgo estructural
> (sin contrato de cesión piso→SL) sigue existiendo para 2025.
