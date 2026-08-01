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

### 💸 PriceLabs: baja ejecutada en Busto+Luxury; Luxury reactivado en el motor propio (01/08/2026)
Alberto confirmó que **Busto Reform y Luxury ya están dados de baja de PriceLabs** (Dúplex/House siguen
en PL por decisión suya, transición en dos fases). El informe de decisión (BD 31/07) encontró a **Luxury
con `apply_enabled=false` desde el 28/07 20:34Z** → estaba SIN ningún motor (precios congelados en
Smoobu). Con OK explícito de Alberto: `apply_enabled=true` (suelo 72€, raíles ±20%/día) aplicado por
Supabase MCP; el `apply-auto` (3×/día) retoma en su próxima pasada. Estado piloto a 31/07: Busto rojo
(occ 11%, 19d sin reserva, base bajando 115→71 por raíles, 28 fechas de agosto ya al suelo 65€) y
Luxury rojo (occ 9%, 11d sin reserva). 0 reservas nuevas en Busto desde el cambio de suelo (28/07) —
solo lleva ~1 día por debajo del p50 de mercado (91€). Vigilar en `/sivra/pricing-auto`.

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


