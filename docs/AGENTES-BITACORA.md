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
- **2026-07-12 · facturas-correo** · hizo: a petición de Alberto ("revisa y dame info") verificó en vivo el DOBLE CORTE de extracción de PDF (Vía B parada 19 días — `label:PDF-guardado`=0 en 30d, IONOS/ASECON/Booking/PriceLabs sin copiarse; Vía A `gmail-adjuntos` sin provisionar) y, como no hay fix de código para el corte (es reautorización OAuth de Alberto), construyó la RED DE SEGURIDAD: endureció la skill (`SKILL.md`) con **Paso 0** (health-check determinista + backlog persistente en etiquetas Gmail `Facturas/PDF-pendiente`/`Revisar` + backfill del hueco 23/06 + escalado Telegram con backoff vía `/api/internal/alerta` + estado persistido), **cadena de vías con fallback** (B→A→OCR/visual→**conciliación inversa por banco**→pendiente) y actualizó estado/Límites; en plataforma añadió **badge 🔴 de corte en `/finanzas`** (tabla nueva `agente_salud`, migración `2026-07-12_agente_salud.sql` **aplicada+sembrada en prod** por Supabase MCP, lectura tolerante en `lib/finanzas.ts`, banner en `FinanzasClient.tsx`); dudas: si Alberto prefiere provisionar Vía A (token OAuth como env) en vez de/además de publicar el Apps Script; el badge se lee global (agente sin `cuenta_id`) — vale para 1 dueño, revisar si entran más tenants; fallos: build de plataforma NO ejecutado (sin node_modules en el entorno efímero) — cambios aditivos y type-consistentes, pendiente de CI; entregó a Alberto 3 prompts de Claude para Chrome (reautorizar+publicar OAuth / provisionar Vía A / leer PDFs pendientes); PRs/commits: rama `claude/facturas-correo-pdf-extraction-x805fl` (PR nuevo)
- **2026-07-11 · facturas-correo** · hizo: pasada tras 8 días sin correr (última real 03/07, hueco cubierto ampliando a `newer_than:9d`) — revisó Gmail + Paso 1-bis (buzón manual/raíz FACTURAS 2026); encontró 13 PDFs sueltos en la raíz que resultaron ser solo 3 facturas distintas duplicadas 9+2+2 veces (EMASESA Reform 57,09€, EMASESA "Bustos 1º DER" 2025 ×2); archivó en Drive 11 facturas ya conciliadas en banco pero nunca filed (Dimitri Casa Socorro 907,50€, CREATE ventilador 123,45€, 4× Endesa Dúplex, 4× Endesa Bustos Reform/Luxury — quedaron pendientes de sesiones previas sin bitácora) + puso `propiedad_id` que faltaba en 7 movimientos; registró 4 avisos de duplicados en `_DUPLICADOS_BORRAR`; dudas: **Vía B (Apps Script→Drive) sigue cortada 18 días** (última copia 23/06, no autocorregida) → Petroprix/fal.ai/ASECON sin PDF legible, quedan "Para tu decisión"; Leroy Merlin (factura+abono, 51,75€ neto) sin decidir piso vs personal; EMASESA "Bustos Tavera 1º DER" contrato 0105329645 (facturas 2025, Punto y Coma SL) es una unidad NO mapeada en la tabla CUPS — ¿seguís con ella?; `Escaneado_20260707-1446.pdf` no se pudo leer (PDF sin texto extraíble); fallos: al menos 2 sesiones previas (entre 03/07 y hoy) hicieron trabajo real (conciliación bancaria, Castuera dedup) sin dejar entrada en esta bitácora — solo se supo por notas dentro del propio SKILL.md; PRs/commits: commit directo a `main` (SKILL.md + esta entrada)
- **2026-07-03 · facturas-correo** · hizo: procesó 4 facturas Endesa de luz de Bustos Tavera 22 (uploads de Alberto, a nombre de Punto y Coma SL) — clasificadas `turistico_pisos` y conciliadas (`conciliado=true`) en los 4 cargos del banco; **corrigió un intercambio Reform↔Luxury** en `propiedad_id` (la asignación del 02/07 por correlación de ocupación estaba al revés; los PDF traen CUPS+dirección+nº factura = concepto bancario → prueba documental); arregló la tabla LUZ de la skill (contratos 130139655504=IZQ/Reform, 130139685932=DCHA/Luxury) y el estado; dudas: subida binaria a Drive no factible por MCP (PDF ~700KB → base64 inline) → archivado en Drive queda a Alberto; caveat fiscal: facturas a nombre de la SL pero deducidas en IRPF personal de Alberto (pisos a personal desde 2026) → recomendado cambiar titular Endesa a su nombre; fallos: —; PRs/commits: rama `claude/account-name-transfer-52o8b1`
- **2026-07-03 · agentes-entrenador** · hizo: primera pasada manual de validación — revisó PRs #709/#712/#715/#716 + bitácora + feedback; diagnosticó los 7 agentes programados: sin evidencia (ninguno ha corrido aún, sistema activado hoy 03/07/2026); pasada silenciosa; actualizó Última poda + CONTEXTO-SESIONES.md; dudas: —; fallos: —; PRs/commits: #716 (contexto)
<!-- Los agentes insertan aquí. Ejemplo:
- **2026-07-05 · facturas-correo** · hizo: 12 correos revisados, 3 facturas archivadas en
  Drive, 2 conciliadas con banca; dudas: recibo de Endesa sin CIF visible (a "Para tu
  decisión"); fallos: —; PRs/commits: —
-->

## Última poda

2026-07-03 · primera pasada (manual, validación) · 0 entradas de agentes procesadas (ningún agente había corrido aún — sistema activado hoy); auto-informe del entrenador añadido como entrada pendiente para la siguiente pasada.
