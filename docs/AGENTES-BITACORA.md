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
- **2026-07-06 · facturas-correo** · hizo: revisó 12 correos candidatos (ventana 2 días) — 6 son de Anthropic Ireland/Stripe (1 recibo nuevo 217,80€ factura 9BF0758D-3548869 + 5 credit notes ~3,78€ con refund a tarjeta -0341, ~18,90€ total, sin cargo bancario localizado), 1 aviso de factura de impuestos de Stripe para la cuenta propia de ia.rest (no es gasto personal, descartado) y 1 ack de soporte de Booking.com (ruido); los 12 etiquetados `Facturas/Procesada`; Paso 1-bis: revisó ~36+ ficheros sueltos en la raíz de Drive `FACTURAS Apartamentos/2026` — verificó una muestra (4 Endesa Dúplex feb-jun, Dimitri/impermeabilización Socorro 907,50€, CREATE ventilador 123,45€) y **todos ya estaban archivados y conciliados** en pasadas previas (son duplicados de subida, no gasto nuevo); dudas: no se archivó el recibo Anthropic 217,80€ en Drive (herramienta `create_file` de Google-Drive devolvió "Internal error" 4 veces seguidas, incluso con archivo trivial sin carpeta — parece caída puntual del conector, no de datos) → queda pendiente para la próxima pasada; **corte de la Vía B (Apps Script→`_buzon_pdf`) sigue activo y ha empeorado: último PDF copiado sigue siendo 23/06/2026, ya 13 días sin copias** (el 02/07 se detectó con 9 días) — bloquea leer el PDF de facturas nuevas con adjunto; fallos: create_file de Google-Drive con error interno repetido; ~36 ficheros sueltos en la raíz de Drive son limpieza pendiente para Alberto (duplicados ya procesados, borrar original); PRs/commits: — (solo memoria, sin cambios de código)
- **2026-07-03 · facturas-correo** · hizo: procesó 4 facturas Endesa de luz de Bustos Tavera 22 (uploads de Alberto, a nombre de Punto y Coma SL) — clasificadas `turistico_pisos` y conciliadas (`conciliado=true`) en los 4 cargos del banco; **corrigió un intercambio Reform↔Luxury** en `propiedad_id` (la asignación del 02/07 por correlación de ocupación estaba al revés; los PDF traen CUPS+dirección+nº factura = concepto bancario → prueba documental); arregló la tabla LUZ de la skill (contratos 130139655504=IZQ/Reform, 130139685932=DCHA/Luxury) y el estado; dudas: subida binaria a Drive no factible por MCP (PDF ~700KB → base64 inline) → archivado en Drive queda a Alberto; caveat fiscal: facturas a nombre de la SL pero deducidas en IRPF personal de Alberto (pisos a personal desde 2026) → recomendado cambiar titular Endesa a su nombre; fallos: —; PRs/commits: rama `claude/account-name-transfer-52o8b1`
- **2026-07-03 · agentes-entrenador** · hizo: primera pasada manual de validación — revisó PRs #709/#712/#715/#716 + bitácora + feedback; diagnosticó los 7 agentes programados: sin evidencia (ninguno ha corrido aún, sistema activado hoy 03/07/2026); pasada silenciosa; actualizó Última poda + CONTEXTO-SESIONES.md; dudas: —; fallos: —; PRs/commits: #716 (contexto)
<!-- Los agentes insertan aquí. Ejemplo:
- **2026-07-05 · facturas-correo** · hizo: 12 correos revisados, 3 facturas archivadas en
  Drive, 2 conciliadas con banca; dudas: recibo de Endesa sin CIF visible (a "Para tu
  decisión"); fallos: —; PRs/commits: —
-->

## Última poda

2026-07-03 · primera pasada (manual, validación) · 0 entradas de agentes procesadas (ningún agente había corrido aún — sistema activado hoy); auto-informe del entrenador añadido como entrada pendiente para la siguiente pasada.
