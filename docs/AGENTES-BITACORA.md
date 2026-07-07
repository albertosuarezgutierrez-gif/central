# Bitácora de auto-informes de agentes — `central`

> **Para qué.** Cada agente programado (skill de `docs/SKILLS.md` § "Agentes programados")
> deja aquí UNA entrada por ejecución: qué hizo, qué dudó, qué falló. Es la materia prima
> del `agentes-entrenador` (rutina semanal) para mejorar los prompts por RENDIMIENTO real,
> no por intuición. El contenedor es efímero: si no queda escrito aquí, no existió.
>
> **Cómo se mantiene.** Los agentes SOLO añaden entradas arriba del todo (3-5 líneas máx.,
> en el mismo commit/PR de su pasada, o en un commit propio a `main` si su pasada no tocó
> el repo). El `agentes-entrenador` PODA las entradas ya procesadas en su pasada semanal
> (git guarda el histórico; este archivo no engorda). Nadie más borra aquí.
>
> **Formato por entrada (una línea de lista, multilinea si hace falta):**
> `- **YYYY-MM-DD · <skill>** · hizo: …; dudas: …; fallos: …; PRs/commits: #xxx / SHA / —`
> Sin dudas ni fallos → escribir `dudas: —; fallos: —` (el "todo bien" también es señal).

## Entradas pendientes de procesar (lo más reciente arriba)
- **2026-07-07 · facturas-correo** · hizo: pasada diaria — 4 candidatos Gmail (PriceLabs aviso de cobro 64,96 USD archivado como texto + Procesada; Mercadona/Amazon clasificados `personal` auto + Procesada; Booking.com fwd de Pilar dejado sin marcar por PDF ilegible); **detectó que el corte del Apps Script `Facturas a Drive` sigue activo** (última copia en `_buzon_pdf` sigue en 23/06, ya 14 días parado — bloquea lectura de PDFs de facturas nuevas incl. la de Booking); revisó el backlog de ~45 ficheros sueltos en la raíz de Drive `FACTURAS Apartamentos/2026` y confirmó por muestreo (8 Endesa Bustos+Dúplex, Dimitri, CREATE, Leroy Merlin+rectificativa, 1 EMASESA) que **ya están archivados y conciliados** bajo otros fileId — son copias sueltas sin borrar, no trabajo pendiente; dudas: Alberto debería borrar esas ~45 copias sueltas de la raíz (dejar solo `CUP electricidad NUEVO.pdf`) y revisar por qué el Apps Script dejó de copiar el 23/06 (probable expiración OAuth); detectó además movimientos bancarios duplicados en BD para los mismos cargos Endesa Dúplex (mismo importe/fecha, un duplicado clasificado `seguros` sin conciliar) — fuera de alcance de esta skill, para auditoría; fallos: —; PRs/commits: docs (esta entrada + CONTEXTO-SESIONES.md)
- **2026-07-03 · facturas-correo** · hizo: procesó 4 facturas Endesa de luz de Bustos Tavera 22 (uploads de Alberto, a nombre de Punto y Coma SL) — clasificadas `turistico_pisos` y conciliadas (`conciliado=true`) en los 4 cargos del banco; **corrigió un intercambio Reform↔Luxury** en `propiedad_id` (la asignación del 02/07 por correlación de ocupación estaba al revés; los PDF traen CUPS+dirección+nº factura = concepto bancario → prueba documental); arregló la tabla LUZ de la skill (contratos 130139655504=IZQ/Reform, 130139685932=DCHA/Luxury) y el estado; dudas: subida binaria a Drive no factible por MCP (PDF ~700KB → base64 inline) → archivado en Drive queda a Alberto; caveat fiscal: facturas a nombre de la SL pero deducidas en IRPF personal de Alberto (pisos a personal desde 2026) → recomendado cambiar titular Endesa a su nombre; fallos: —; PRs/commits: rama `claude/account-name-transfer-52o8b1`
- **2026-07-03 · agentes-entrenador** · hizo: primera pasada manual de validación — revisó PRs #709/#712/#715/#716 + bitácora + feedback; diagnosticó los 7 agentes programados: sin evidencia (ninguno ha corrido aún, sistema activado hoy 03/07/2026); pasada silenciosa; actualizó Última poda + CONTEXTO-SESIONES.md; dudas: —; fallos: —; PRs/commits: #716 (contexto)
<!-- Los agentes insertan aquí. Ejemplo:
- **2026-07-05 · facturas-correo** · hizo: 12 correos revisados, 3 facturas archivadas en
  Drive, 2 conciliadas con banca; dudas: recibo de Endesa sin CIF visible (a "Para tu
  decisión"); fallos: —; PRs/commits: —
-->

## Última poda

2026-07-03 · primera pasada (manual, validación) · 0 entradas de agentes procesadas (ningún agente había corrido aún — sistema activado hoy); auto-informe del entrenador añadido como entrada pendiente para la siguiente pasada.
