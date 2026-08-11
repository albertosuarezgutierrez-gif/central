---
name: facturas-correo
description: Agente PROGRAMADO que revisa el Gmail de Alberto buscando facturas/justificantes de gasto, los clasifica (personal vs negocio deducible), archiva en Google Drive los deducibles y los concilia con los movimientos bancarios de plataforma. Úsala cuando Alberto pida "revisa mis correos/facturas", o cuando la dispare el trigger diario de Claude Code web. NO es un proceso 24/7: se despierta, hace una pasada sobre lo nuevo y deja un resumen.
---

# Agente de facturas por correo — router

Pasada diaria (trigger de Claude Code web) o a petición: revisa el Gmail de Alberto, separa
**gasto de negocio deducible** de lo **personal**, archiva los justificantes deducibles en
Google Drive (`FACTURAS Apartamentos/2026/<MM-Mes-2026>`) y los concilia contra
`movimientos_bancarios` en Supabase (`wswbehlcuxqxyinousql`). Entorno efímero: cada ejecución
es una pasada completa e idempotente (etiqueta Gmail `Facturas/Procesada` para no reprocesar).
Flujo: Paso 0 (salud+backlog) → 1/1-bis (candidatos Gmail + subidas manuales Drive) →
2 (clasificar) → 3 (archivar) → 4 (conciliar banco) → 5 (etiquetar+resumen) → auto-informe.

## 🚨 No romper / crítico

- **IDs de Drive: NO cambian aunque las carpetas se muevan** (reorg 16/07/2026 bajo
  `CENTRAL/03 · FACTURAS Y GASTOS/`). Siguen válidos: `_buzon_pdf`
  `1lQXsajYn-7zkupIpEwvA_Sdr2BI95pbh` · raíz `2026` `1M7PwjU3MSJ7zb83rhlXzTx1O2RlTad3O` ·
  `_subir_aqui` `1JlK9JXIpqlbDlOawtAFlk4_X7bn0Onjf` · `_DUPLICADOS_BORRAR`
  `1Au-_pFEPqvwZN_a7xKNZzVZOWGMAAO7Z`. Mapa en `docs/DRIVE-ESTRUCTURA.md`.
- **NUNCA inventes un importe.** Si el PDF no se puede leer: cadena de vías (B Apps Script→
  `_buzon_pdf` → A MCP `gmail-adjuntos` → OCR/visual → conciliación inversa por banco →
  etiqueta `Facturas/PDF-pendiente`).
- **Si Vía B "no trae nada": revisa la `QUERY` del Apps Script `Facturas a Drive`, NO es OAuth**
  (lección del corte 23/06→12/07/2026). Forma actual y permanente (orden de Alberto 18/07/2026):
  `newer_than:3d has:attachment filename:pdf -label:PDF-guardado`. Mapfre-comisiones NO se
  captura por Vía B (PDF cifrado, por diseño).
- **Fallo técnico de extracción ≠ «no era factura» (02/08/2026, PR #1219):** si la IA no pudo LEER
  un correo (NIM timeout, JSON truncado), el cron lo cuenta como `sinLeer`, lo etiqueta
  `Facturas/Extraccion-fallida` y sale con ⚠️ en el latido (`resumen-escaneo.ts`) — no se afirma
  «0 facturas nuevas» sin haberlos leído. Ventana de escaneo 7 días: lo que falle 7 días seguidos
  queda para revisión a mano.
- **Etiqueta `Facturas/Procesada` (Label_11): nombre real en femenino** — usa la existente, no
  crees `Procesado`. NUNCA la pongas en hilos con `PDF-pendiente`/`Revisar` (quedarían
  excluidos de la query base y no se reprocesarían jamás).
- **Auto-confirma conciliación SOLO si** la extracción es limpia Y el importe casa exacto
  (±0,02) con UN único movimiento en ±7 días. **Booking NUNCA se auto-confirma** (liquidación
  multi-reserva). Ante duda → «Para tu decisión» + `Facturas/Revisar`.
- **Reglas dictadas por Alberto:** ENERGIA XXI = SIEMPRE luz de Monte Carmelo → `personal`
  (02/07); Petroprix = SIEMPRE correduría (11/07); guardería Estrella Polar/Workandlife =
  `personal` PERO `deduccion_cuota_tipo='guarderia'` y SÍ se archiva (20/07); **amortización
  NUNCA de oficio** — todo gasto corriente al 100% salvo orden expresa (02/07); dirección de
  facturación Monte Carmelo ≠ lugar de uso (material físico → preguntar piso vs hogar);
  reenvíos ambiguos de Pilar → preguntar, no auto-clasificar.
- **Toda query de banco SIEMPRE scoped por `cuenta_id`.** No escribas en
  `movimientos_bancarios` salvo conciliaciones/correcciones de `destino` seguras.
- **Auto-informe OBLIGATORIO** en `docs/AGENTES-BITACORA.md` en TODA sesión que archive,
  concilie o etiquete algo — aunque sea ad-hoc o quede a medias.

## Índice de references/ — lee SOLO el archivo que necesite la tarea

- **`references/01-extraccion-y-salud.md`** — Herramientas MCP, cadena de vías para leer PDFs
  (Vía B/A/OCR/inversa) y su historial, idempotencia, Paso 0 completo (health-check,
  backlog `PDF-pendiente`/`Revisar`, escalado Telegram, `agente_salud`, backfill). Léelo al
  ARRANCAR toda pasada y siempre que un PDF no se deje leer.
- **`references/02-triaje-clasificacion-archivo.md`** — Pasos 1–3: query de candidatos Gmail,
  subidas manuales a Drive y papelera `_DUPLICADOS_BORRAR`, reglas de clasificación por
  destino (pisos/dúplex/seguros/personal, reenvíos de Pilar) y archivo en Drive (carpetas de
  mes, nombre normalizado). Léelo para clasificar o archivar cualquier justificante.
- **`references/03-conciliacion-y-cierre.md`** — Pasos 4–5: SQL de conciliación e inversa,
  patrones especiales (ENDESA dúplex, CUPS luz por piso, EMASESA, SIQUE), resumen a Alberto,
  trigger, límites v1, auto-informe y protocolo del canal de aviso (preflight `/api/internal/alerta`).
  Léelo para conciliar contra banco o cerrar la pasada.
