# 🧠 Memoria de sesiones — central (repo GitHub: ia.rest → renombrar)

> Contexto persistente entre sesiones de Claude Code. El entorno cloud es
> **efímero** (el contenedor se borra al acabar), así que lo único que sobrevive
> es lo commiteado aquí. Este archivo es el "estado vivo" del proyecto entre sesiones.
>
> **Cómo se mantiene:** al terminar cada sesión, Claude añade una entrada nueva
> arriba del todo y actualiza el estado si algo cambió. Un hook `Stop`
> (`.claude/hooks/persist-memoria.sh`) commitea y empuja este archivo automáticamente.
>
> **🚨 Regla de tamaño (ahorro de contexto):** cada entrada, **máximo ~8 líneas**:
> qué se hizo, decisiones, pendientes y nº de PR. El detalle ya vive en el PR y en
> el código — NO re-narrarlo aquí. Fecha SIEMPRE en la primera línea `(dd/mm/aaaa)`.
>
> **🔄 Rotación mensual:** aquí vive SOLO el mes corriente. Los meses cerrados se
> archivan en `docs/memoria/AAAA-MM.md` con `node scripts/rotar-memoria.mjs`
> (idempotente; lo dispara `/auditoria-diaria` a primeros de mes). La historia no
> se pierde: se lee de `docs/memoria/` solo cuando hace falta.
>
> Para arquitectura/módulos completos → skill `ia-rest-maestro`. Esto es solo el
> registro de qué se hizo y qué queda.

---

## 📌 Estado actual (lo más reciente arriba)

### ⚠️ PENDIENTE de Alberto: Luxury ¿motor activo o congelado hasta 01/09? (01/08/2026)
Dos decisiones del mismo día se contradicen: esta sesión activó el motor de Luxury con su OK explícito
(«Sí, activar ya», 08:52Z, `apply_enabled=true`, suelo 72€) y otra sesión anotó «Luxury sigue congelado
hasta el 01/09 (decisión de Alberto)». **Estado real en BD: ACTIVO** — el `apply-auto` mueve precios de
Luxury desde su próxima pasada. Alberto dijo «hablamos otra sesión mejor»: la próxima sesión que toque
pricing debe pedirle que lo zanje y corregir aquí la línea que quede obsoleta.

### 💸 PriceLabs: baja ejecutada en Busto+Luxury; Luxury reactivado en el motor propio (01/08/2026)
Alberto confirmó que **Busto Reform y Luxury ya están dados de baja de PriceLabs** (Dúplex/House siguen
en PL por decisión suya, transición en dos fases). El informe de decisión (BD 31/07) encontró a **Luxury
con `apply_enabled=false` desde el 28/07 20:34Z** → estaba SIN ningún motor (precios congelados en
Smoobu). Con OK explícito de Alberto: `apply_enabled=true` (suelo 72€, raíles ±20%/día) aplicado por
Supabase MCP; el `apply-auto` (3×/día) retoma en su próxima pasada. Estado piloto a 31/07: Busto rojo
(occ 11%, 19d sin reserva, base bajando 115→71 por raíles, 28 fechas de agosto ya al suelo 65€) y
Luxury rojo (occ 9%, 11d sin reserva). 0 reservas nuevas en Busto desde el cambio de suelo (28/07) —
solo lleva ~1 día por debajo del p50 de mercado (91€). Vigilar en `/sivra/pricing-auto`.

### 🏠 SIVRA: House cambió de categoría en 2024 y el ADR mezclado me hizo proponer regalarlo (01/08/2026)
Lo cazó Alberto: «Socorro está dando 1.500/2.000€ por un fin de semana». **ADR de House por año: 67·106·147·175
(2020-23) → 553·459·487 (2024-26)**, ticket medio 2026 **1.424€**. Yo había calculado «ADR de agosto 102€»
promediando las dos etapas y llegué a proponer bajarlo a 285€ — habría sido regalarlo. Mismo fallo que el de
los ADR del radar: número plausible, periodo equivocado, sin hueco que lo delate. **Al analizar House, usar
SOLO 2024 en adelante.** Suelo revertido a 300€ (llegué a bajarlo a 180€; no afectó, está en dry-run).
**Pero agosto sí está caro:** competencia REAL de Booking para 12 personas 16-23/08 → mediana **228€/noche**,
techo 443€; House pide 450-483€. La reserva que se canceló eran 334€/noche. Propuesta viva: **330-350€** para
ese hueco. **Y el corpus no tiene comps de 12 plazas frescos** (20 comps del 09/06 vs 136 de 8 plazas): el
sweep por aforo real (#1186) es SEMANAL (dom 03:00 UTC) y aún no ha corrido — la primera vez es el 02/08.
**🔴 Octubre, que es el mejor mes de Sevilla, va flojo a 2 meses vista:** Busto 7/31, Dúplex **0/31**, House
6/31, Luxury 4/31, y los precios publicados van a **2-4× el ADR realizado de octubre 2024-25** (Busto 307€ vs
77-86€ · Dúplex 194€ vs 90-100€ · Luxury 212€ vs 98-100€ · House 867€ vs 423-499€). Matiz que impide concluir:
el `createdAt` de las reservas de 2024-25 es la fecha de IMPORTACIÓN masiva, no la de reserva.
**PERO la curva SÍ se puede reconstruir — desde `rate_snapshots`, no desde `incomes`** (idea de Alberto: «¿por
qué no estudias cómo lo hace PriceLabs?»). Hay **65.725 snapshots diarios** de los 4 pisos desde el 10/05/2026:
cada vez que una fecha pasa de `available=1` a `0` entre dos snapshots es una reserva entrando, con su
antelación exacta. Medido: **Busto 108 días de mediana · Luxury 57 · House 32 · Dúplex 7**.
**Eso INVIERTE el diagnóstico de octubre:** Dúplex a 0/31 es su patrón normal (vende a 7 días) y House a 6/31
aún no ha entrado en su ventana (32 días); **el que va tarde de verdad es Busto**, que vende con 108 días de
antelación y a 60 días de octubre solo tiene 7/31. Muestra corta (78 días, 11-51 noches por piso): brújula, no
GPS. **Y PriceLabs NO hace last-minute:** House pasa de 460€ a 23 días a 428€ el mismo día (−7%) y se queda con
el 70% de las noches vacías; Busto ni baja, sube (94€→105€). Sirve como fuente de datos, no como modelo a
copiar. Luxury sigue congelado hasta el 01/09 (decisión de Alberto).

### 💓 El latido de facturas no faltaba: la pasada moría en 504 antes de escribirlo (31/07/2026)
Aviso «🧾 Escaneo de facturas: sin ninguna señal registrada» el mismo día de estrenar el vigía (#1184).
No era IMAP ni la app-password: `facturas-scan` corre a diario y **muere en 504 a los 60 s** (3 de sus
últimas 4 pasadas), a mitad del escaneo — ese 06:16 ya había insertado IONOS y Punto y Coma — sin llegar
nunca a `registrarLatido`, que estaba al final. Fix: `maxDuration` 60→300 **+ presupuesto de tiempo**
(deadline en el escaneo y en el listado IMAP, que devuelve `truncado`), **latido de intento al empezar**
y el definitivo justo tras el escaneo, y `evaluarLatido` con `ultimo_at`+`detalle` para separar «no se
dispara» de «se dispara y no termina». Verificado: tsc 0 · 702 tests · build OK · upsert probado en BD.
**01/08:** el PR sigue SIN mergear y la pasada de las 06:15 volvió a dar 504 (`agente_latidos` sigue vacía,
ninguna factura nueva desde el 31/07) — los logs añaden el porqué: los reintentos de `aiExtractInvoice`
(NIM timeout, Groq JSON truncado) son los que se comen los 60 s. PR #1194 pendiente de merge.

- **🗓️ Rotación mensual: julio archivado (01/08/2026).** `node scripts/rotar-memoria.mjs` movió las 321
  entradas de julio a `docs/memoria/2026-07.md` (auditoría diaria). Nota para la próxima pasada: el script
  solo reconoce entradas que empiezan por `- **`; una entrada con formato `### ` no se archivó sola y hubo
  que moverla a mano — si vuelve a pasar, vale la pena normalizar el formato de cabecera o enseñarle al
  script el patrón `### `.


