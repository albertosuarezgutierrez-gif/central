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
- **2026-07-10 · facturas-correo** · hizo: ventana ampliada a 8 días (última pasada real fue 03/07, no diaria); archivó en Drive + concilió (`conciliado=true`) la factura de climatización Castuera Melgar 1.691,58€ (Casa Socorro, `turistico_pisos`); verificó que Dimitri (907,50€), EMASESA Reform (57,09€), CREATE ventilador (123,45€) y las 4 facturas Endesa Dúplex (78,91/65,88/62,66/95,47€) ya estaban conciliadas y archivadas por pasadas previas; etiquetó como ruido (Zara, Teya, mensajes de huésped Booking) 4 hilos; dudas: **corte de la vía B (Apps Script `Facturas a Drive`) sigue activo — último PDF copiado a `_buzon_pdf` es del 23/06, ya 17 días sin copiar** → factura Petroprix, invoice Orb/fal.ai ($20) y Lavandería Giraldillo AFV-11758 sin importe legible, quedan "Para tu decisión"; ~25 ficheros sueltos en la raíz de Drive `FACTURAS Apartamentos/2026` son duplicados de facturas ya archivadas (Bustos x4, Dúplex x4, CREATE, Dimitri, Leroy Merlin, EMASESA Reform x10) — pendientes de que Alberto los borre; hallazgo sin clasificar: CamScanner Leroy Merlin (papel pintado, 51,75€ neto tras rectificativa) facturado a Monte Carmelo — ya estaba archivado como deducible por una pasada anterior, no se tocó; fallos: —; PRs/commits: rama `claude/inspiring-gauss-kcl6x2`
- **2026-07-03 · facturas-correo** · hizo: procesó 4 facturas Endesa de luz de Bustos Tavera 22 (uploads de Alberto, a nombre de Punto y Coma SL) — clasificadas `turistico_pisos` y conciliadas (`conciliado=true`) en los 4 cargos del banco; **corrigió un intercambio Reform↔Luxury** en `propiedad_id` (la asignación del 02/07 por correlación de ocupación estaba al revés; los PDF traen CUPS+dirección+nº factura = concepto bancario → prueba documental); arregló la tabla LUZ de la skill (contratos 130139655504=IZQ/Reform, 130139685932=DCHA/Luxury) y el estado; dudas: subida binaria a Drive no factible por MCP (PDF ~700KB → base64 inline) → archivado en Drive queda a Alberto; caveat fiscal: facturas a nombre de la SL pero deducidas en IRPF personal de Alberto (pisos a personal desde 2026) → recomendado cambiar titular Endesa a su nombre; fallos: —; PRs/commits: rama `claude/account-name-transfer-52o8b1`
- **2026-07-03 · agentes-entrenador** · hizo: primera pasada manual de validación — revisó PRs #709/#712/#715/#716 + bitácora + feedback; diagnosticó los 7 agentes programados: sin evidencia (ninguno ha corrido aún, sistema activado hoy 03/07/2026); pasada silenciosa; actualizó Última poda + CONTEXTO-SESIONES.md; dudas: —; fallos: —; PRs/commits: #716 (contexto)
<!-- Los agentes insertan aquí. Ejemplo:
- **2026-07-05 · facturas-correo** · hizo: 12 correos revisados, 3 facturas archivadas en
  Drive, 2 conciliadas con banca; dudas: recibo de Endesa sin CIF visible (a "Para tu
  decisión"); fallos: —; PRs/commits: —
-->

## Última poda

2026-07-03 · primera pasada (manual, validación) · 0 entradas de agentes procesadas (ningún agente había corrido aún — sistema activado hoy); auto-informe del entrenador añadido como entrada pendiente para la siguiente pasada.
