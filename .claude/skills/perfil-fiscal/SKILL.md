---
name: perfil-fiscal
description: Router de contexto FISCAL y PATRIMONIAL de Alberto (persona física) + Punto y Coma SL. Úsalo SIEMPRE que Alberto pida algo de su renta/IRPF, declaración, gastos deducibles, qué piso tributa dónde, o su asesoría, y al trabajar con `facturas-correo`, `fiscal-novedades` o el módulo `/finanzas`. Sin cifras ni datos sensibles.
---

# Perfil fiscal / patrimonial — Alberto (router)

## Estructura en 6 líneas
- **Personas físicas:** Alberto + **Pilar** (cónyuge, autónoma con sección `/finanzas/pilar`), separación de bienes, 3 hijos → familia numerosa general.
- **Sociedad:** Punto y Coma SL, **dormida/inactiva desde finales de 2025** (no disuelta). **Desde 2026 TODOS los pisos tributan en IRPF personal de Alberto**; excepción dictada 20/07/2026: los ingresos de Socorro de 2025 sí fueron al IS de la SL.
- **Pisos:** Socorro/House Sevillana (50/50 Alberto+Pilar), Villasís=Lasso de la Vega 4=Dúplex, Busto Reform y Luxury Busto (personal desde 2026); Monte Carmelo 68 = vivienda habitual (no deducible).
- **Declaración IRPF 2025 ya presentada (30/06/2026):** no tocar 2025 ni reclasificar movimientos anteriores a 2026-01-01; solo importa 2026 en adelante.
- **Datos sensibles NO aquí:** viven en BD `fiscal_perfil`/`fiscal_descendientes` (Supabase, por `cuenta_id`) y en el borrador AEAT. Asesoría: Asecon Consultores (Marta).

## 🚨 Reglas dictadas por Alberto — canónicas aquí
- **⛔ Amortización — SOLO con orden explícita de Alberto (dictado 02/07/2026):** NUNCA marcar un
  cargo como `amortizable` sin que Alberto lo diga expresamente para ESA factura. **Su criterio es
  meter el MÁXIMO gasto deducible posible cada año** → por defecto todo va como gasto corriente del
  año al 100% (aunque técnicamente fuera mobiliario/obra). El toggle `amortizable` existe en
  `/finanzas` para cuando él decida usarlo caso a caso. (Sustituye a la regla anterior que mandaba
  IKEA/obras a amortizar de oficio.)
- **⚠️ Pilar NO tiene gastos deducibles propios (criterio de Alberto, 18/07/2026):** todo gasto se
  imputa con retroactividad a Alberto (correduría/personal) — no crear movimientos `gasto_profesional`
  para ella salvo instrucción explícita. La cuota de autónomos (RETA) SÍ se registra siempre
  (`subcategoria='cuota_autonomos'`): es su cotización obligatoria, no una "deducción" opcional que se
  pueda desplazar a Alberto.
- **Extras cobrados al huésped (SIVRA — cuna+trona, 20€/estancia; dictado 28/08/2026):** Alberto dicta
  que **suman en contabilidad pero NO se declaran en renta**, y que van **sin IVA**. Decisión **CERRADA
  por él, sin pasar por Asecon**: se le planteó que «sin IVA» y «no tributa en IRPF» son preguntas
  distintas y la descartó (importes pequeños, cobro a su cuenta personal). Los agentes fiscales
  (`fiscal-novedades`, `facturas-correo`) **no suman estos ingresos al cálculo de IRPF**.
  Lo que SÍ se conserva pase lo que pase: cada extra queda **identificado uno a uno** en `incomes`
  (etiqueta de extra) y el tipo de IVA vive en `sivra_extras_catalogo.iva_pct` — nada cableado, nada
  borrado, así que revertir el criterio es editar una fila y los importes ya están todos ahí.
- **🚨 Comisiones de la correduría — hoy el borrador se COPIA, no se cuadra (medido 01/09/2026).** Son
  **rendimiento de actividad económica** de Alberto en estimación directa, con **retención del 15 %** que
  las compañías declaran en el **modelo 190** → por eso salen en los datos fiscales de la AEAT. En la
  renta 2025 la asesoría pidió el **libro registro de ingresos y gastos**, no lo había, y Alberto
  contestó «ingresos los que aparece en el borrador». **No existe libro registro propio**: mientras no
  lo haya, NO afirmes que la cifra de comisiones está verificada — está aceptada. El libro que lo
  arregla está **implementado desde el 01/09/2026** (`comisiones_devengo`, pestaña «Cuadre» de
  `/correduria`; alcance 2026 en adelante), pero **todavía NO alimenta el cálculo de IRPF** — ver el
  bullet siguiente.
- **🚨 La retención la practica y la ingresa LA COMPAÑÍA. Alberto cobra ya el neto** (dictado por él,
  01/09/2026: «ojo con las retenciones de comisiones, la compañía las hace ellos… yo solo recibo ya lo
  mío»). El retenedor es el pagador (art. 76 RIRPF), así que Alberto **no retiene ni ingresa nada** por
  esas comisiones. Tres consecuencias que se confunden con facilidad:
  - En la renta el **ingreso computable es el BRUTO**, no lo que entró en el banco.
  - La **retención es un PAGO A CUENTA**: se resta de la **CUOTA**, nunca del ingreso ni como gasto.
    Restarla dos veces (una porque el banco ya trae el neto, otra como gasto) es el error clásico.
  - Todo lo que hay en `movimientos_bancarios` con `destino='seguros'` es **NETO**.
    `lib/finanzas.ts:594` lo eleva al bruto con `neto × (0,15 / 0,85)` y trata el resultado como
    retenciones soportadas. Es correcto **como estimación a tanto alzado**, y ese es su límite: da por
    hecho que TODO abono de seguros es una comisión neta al 15 %. Un periodo **deudor** de Occident
    (comisión negativa, remesa 0) o un abono que no sea comisión rompen el supuesto. El bruto y la
    retención **reales** ya viven en `comisiones_devengo` (los trae el extracto de la compañía);
    **sustituir ahí la estimación por el dato real está PENDIENTE** — hasta entonces la cifra fiscal de
    comisiones es una estimación, dilo así.
- **Trading** (FTMO / retos de bróker, operativa **Interactive Brokers**) → **personal, NO deducible**.
- **⚠️ LANDMINE — NUNCA crear una `regla` global para `AYTO SEVILLA`/`RECIBO AYTO. SEVILLA`:** el mismo concepto vale para un piso turístico (deducible) y para la vivienda habitual (personal) → una regla por concepto clasificaría mal. Casar **caso a caso** por importe/fecha/cuenta.
- **Bizum** → SIEMPRE **personal** (regla pura en `lib/destino.ts`, auto-confirmado → no pide revisión).
- **GENERALI seguro coche** → lo mete en **correduría** como gasto (decisión de Alberto), pero **SIN
  regla global** (GENERALI es nombre de aseguradora; una regla rompería la detección de comisiones):
  se reclasifica solo ese recibo.

## 🚨 Requerimiento AEAT 2024 a Punto y Coma SL — ABIERTO (oct-2026)
- 2º requerimiento de Inspección Sevilla (29/09/2026; el 1º, de jul-2026, no se atendió): justificar ingresos 2024 de plataformas imputados a la SL (Booking, Airbnb, Agoda; ~9 inmuebles). Plazo 10 días hábiles; aviso DEHú caduca 09/10/2026. Lo contesta Asecon (Marta Albarrán).
- Todo el detalle (historia, cifras, riesgos, peticiones) vive en Drive, carpeta «Requerimiento AEAT 2024 - Punto y Coma» (https://drive.google.com/drive/folders/1aD1l_idUmNhq6hiTwtj5aGjtsTw3_Btn), subcarpeta 09. Léelo antes de opinar del tema.
- Antecedente CLAVE: en 2024 la Inspección ya revisó IS 2021-22 de la SL y se APORTARON contratos de cesión Socorro y Sanlúcar → SL a 500 €/mes/inmueble; IRPF 2023 los declaró así. ⛔ No argumentar «cesión gratuita»: contradice lo aportado.
- La SL era arrendataria de pisos de la madre de Alberto (edificio San Luis 9: pisos 3/10/12; Villasís hasta la donación de mayo-2024) y propietaria de Bustos Tavera 22. Lasso de la Vega 4 = Dúplex = Villasís.
- Hipoteca de Socorro (CaixaBank) cancelada 11/11/2024 con el dinero de la venta de Sanlúcar (03/09/2024).
- DESCARTADO (04/10/2026, probable): doble resta de comisiones. El DAC7 de Booking es BRUTO y la SL contabilizó los ingresos 2024 ya NETOS sin gasto de comisión aparte (solo queda sin desglosar la cuenta 629). IVA: Alberto dicta que alojamiento (sin servicios hoteleros) y mediación de seguros son exentos; abierto: modelo 309 por comisiones de Booking (inversión del sujeto pasivo) e IVA de las rentas que paga la SL.
- La BD no tiene movimientos bancarios de 2024 (empiezan 2025-01-01); `incomes` 2024 solo cubre Socorro, Bustos (Reform+Luxury) y Dúplex.
- La SL fue ARRENDATARIA de la familia en 2024: pagaba alquiler (cuenta 621, modelo 115) a la abuela (María Alcalá Maguilla) y a la madre (María Gutiérrez Alcalá); San Luis 9 es de SAN LUIS 9 CB (familia Gutiérrez Alcalá/Belascoain), ni Alberto ni Pilar ni la SL son comuneros. Villasís: donación de la madre a Alberto el 21/05/2024.
- Punto débil: Socorro y Sanlúcar se cobraban en cuentas PERSONALES (Caixa …7622 / común …0855) aunque Booking facturaba con el NIF de la SL; la hipoteca de Socorro se pagaba desde la …7622 y se canceló el 11/11/2024 tras entrar ahí la venta de Sanlúcar. En 2024 la SL no pagó los 500 €/mes de los contratos de cesión. ⚠️ Los .docx de esos contratos (fechados 2020) se crearon el 16/05/2024 y hay versiones incoherentes: no aportar contratos nuevos/rehechos; revisión por fiscalista.
- Resumen vigente: Doc «Resumen reunión Asecon v2 (04-10-2026) — VIGENTE» en la subcarpeta 09 de la carpeta Drive. Adjuntos de correo: Vía C (agente `lector-correo`).
- **Extractos 2024 leídos (05/10/2026)** — SL …9871 y personal …0855; detalle y cifras en el Drive del requerimiento (doc «Resumen reunión v3 — extractos bancarios», id 1ESNJt3_1rKNznDSru0s5pqCiI1O8w-juPGvaSi40b3w). Claves: la SL NO pagó los 500 €/mes de cesión en 2024; el IRPF solo recoge Socorro nov-dic (lo cobrado en …0855); Socorro ene-oct (…7622) y Sanlúcar ene-sep (…0855) solo quedarían cubiertos si están en el ajuste 705 del IS → primera pregunta a Asecon. Falta el extracto …7622. IVA: la actividad es exenta (Alberto), pero queda abierto el 309 por las comisiones de Booking NL (inversión del sujeto pasivo, coste no deducible).

## Reglas contables confirmadas (04/10/2026)

Decisiones de Alberto sobre clasificación de gastos por negocio. Guardianas del agente `jefe-contabilidad`:

- **Punto y Coma SL:** dormida, sin imputación automática
- **Negocios separados:** correduría Grupo ASegura, Dúplex (Villasís), pisos turísticos (Socorro/House Sevillana, Busto Reform, Luxury Busto). Cada gasto a su negocio; NO mezclar Dúplex ↔ correduría
- **Informática/IA** (Anthropic, Vercel, Supabase, OpenRouter, Fly, SaaS) → correduría
- **DIGI internet** → pisos turísticos (factura en transición). Internet Dúplex vía BBVA (proveedor distinto)
- **Asisa salud autónomo** → correduría, deducible. **Endesa:** Kutxabank → pisos; BBVA → Dúplex
- **Círculo Mercantil** → personal, NO deducible
- **Hipoteca (CUOTA PTMO)** vivienda habitual → personal, NO negocio
- **UE/USA sin IVA** → autoliquidación (303/349), informe a asesoría
- **Circulares, inscripciones, donativos, presupuestos** → NO son gasto
- **Pilar NO tiene gastos deducibles propios** (retroactivos a Alberto). RETA sí se registra (obligatorio)
- **Trading FTMO/retos bróker** → personal, NO deducible
- **Comisiones correduría:** bruto en renta (con retención 15% de compañía), no neto bancario

## Índice de `references/` — lee SOLO lo que necesite la tarea
- **`references/entidades-y-propiedades.md`** — quién tributa qué: entidades (Alberto/Pilar/SL dormida),
  Pilar autónoma (cómo cargar sus ingresos vía `movimientos_bancarios`, landmine `conyuge_*`, base
  imponible vs neto, prestación exenta), mapa piso→IRPF/SL con alias de sistemas, riesgo Socorro y la
  excepción del ejercicio 2025. Léelo para: declaración/renta, qué piso tributa dónde, alta de datos de Pilar.
- **`references/reglas-gasto-y-finanzas.md`** — reglas de clasificación de gasto (IBI por inmueble,
  seguros, RETA, ASISA, gimnasio, donativos, prestaciones exentas), reglas por comercio en
  `banca_destino_reglas` (sembradas y eliminadas), tarjeta Kutxabank de Pilar, Interactive Brokers +
  Modelo 720, pestaña «Gastos» de `/finanzas`, auditoría fiscal 18/07/2026, caveats del motor
  `lib/fiscal-deducciones.ts` (maternidad, guardería y su landmine del tope, `compararDeclaracion()`),
  datos vivos y relación con otras skills. Léelo para: clasificar facturas/movimientos, `facturas-correo`,
  `fiscal-novedades`, o cualquier cálculo del módulo `/finanzas`.

<!-- verificado: 2026-07-20 -->
