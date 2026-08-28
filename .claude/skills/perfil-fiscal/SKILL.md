---
name: perfil-fiscal
description: Router de contexto FISCAL y PATRIMONIAL de Alberto (persona física) + Punto y Coma SL. Úsalo SIEMPRE que Alberto pida algo de su renta/IRPF, declaración, gastos deducibles, qué piso tributa dónde, o su asesoría, y al trabajar con `facturas-correo`, `fiscal-novedades` o el módulo `/finanzas`. Sin cifras ni datos sensibles.
---

# Perfil fiscal / patrimonial — Alberto (router)

## Estructura en 6 líneas
- **Personas físicas:** Alberto + **Pilar** (cónyuge, autónoma con sección `/finanzas/pilar`), separación de bienes, 3 hijos → familia numerosa general.
- **Sociedad:** Punto y Coma SL, **dormida/inactiva desde finales de 2025** (no disuelta). **Desde 2026 TODOS los pisos tributan en IRPF personal de Alberto**; excepción dictada 20/07/2026: los ingresos de Socorro de 2025 sí fueron al IS de la SL.
- **Pisos:** Socorro/House Sevillana (50/50 Alberto+Pilar), Villasís=Dúplex, Busto Reform y Luxury Busto (personal desde 2026); Monte Carmelo 68 = vivienda habitual (no deducible).
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
- **Trading** (FTMO / retos de bróker, operativa **Interactive Brokers**) → **personal, NO deducible**.
- **⚠️ LANDMINE — NUNCA crear una `regla` global para `AYTO SEVILLA`/`RECIBO AYTO. SEVILLA`:** el mismo concepto vale para un piso turístico (deducible) y para la vivienda habitual (personal) → una regla por concepto clasificaría mal. Casar **caso a caso** por importe/fecha/cuenta.
- **Bizum** → SIEMPRE **personal** (regla pura en `lib/destino.ts`, auto-confirmado → no pide revisión).
- **GENERALI seguro coche** → lo mete en **correduría** como gasto (decisión de Alberto), pero **SIN
  regla global** (GENERALI es nombre de aseguradora; una regla rompería la detección de comisiones):
  se reclasifica solo ese recibo.

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
