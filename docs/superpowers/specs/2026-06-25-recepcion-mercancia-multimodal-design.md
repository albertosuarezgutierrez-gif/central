# Recepción de mercancía multi-modal (cocina central) — Diseño

**Fecha:** 2026-06-25
**Vertical:** `apps/ia-rest` — módulo Cocina Central (`/produccion`)
**Piloto:** Catering Joaquín Jaén (Carmen, rol `cocina` / `cocina_rol = responsable`)
**Rama:** `claude/information-extraction-orls7m`

---

## 1. Contexto y problema

La pantalla **Recepción de mercancía** de `/produccion` permite hacer una foto de una
etiqueta/albarán y, vía IA de visión, autorrellenar una tabla de productos que el
usuario revisa antes de registrar (`recPendientes` → "Registrar todo").

Hoy ese pipeline **lee mal**. Caso real (multipack de atún de Mercadona, 24/06/2026):

- **`producto`** salió como un fragmento ("…PORTE").
- **`lote`** = "30g (6x8…)" → el modelo confundió el **formato/peso** con el lote.
- **`proveedor`** vacío.

Causas (verificadas en el código):

1. **Por diseño** el endpoint solo extrae 6 campos de recepción/APPCC
   (`producto · codigo_barras · lote · caducidad · temperatura · conforme`), no datos
   de marketing (fabricante, EAN completo, nutrición). Correcto para su propósito.
2. **Modelo de visión flojo:** `callAIVision` solo usa **NIM `llama-3.2-11b-vision`**
   (sin fallback; Gemini solo está cableado para búsqueda web, no visión).
3. **Compresión brutal:** NIM rechaza imágenes inline > ~180 KB, así que
   `fotoAJpegPequeno` machaca la foto **hasta ≤170 KB** (reescala a 700 px, calidad
   JPEG hasta 0.4). La letra pequeña (lote codificado, caducidad) se vuelve ilegible.

El objetivo de Catering JJ es que la recepción **sirva para todo**: packs de súper
(con EAN limpio), albaranes de distribuidor (multilínea) y etiquetas de mayorista.

## 2. Objetivos / No-objetivos

**Objetivos**

- Identificar el producto de forma fiable en packs de retail (vía **escáner EAN**).
- Leer bien **lote/caducidad/Tª** en albaranes y etiquetas (vía **mejor motor OCR**).
- Cubrir la obligación **APPCC** en recepción: temperatura, prueba documental, control
  de caducidades.
- Mantener intacto el flujo existente: las 3 vías alimentan la **misma cola de revisión
  humana** antes de registrar.

**No-objetivos**

- No extraer datos de marketing (nutrición, ingredientes, fabricante) salvo el EAN.
- No cruzar lo recibido contra lo pedido para un evento (*esperado vs recibido*) — se
  documenta como futuro (§12), necesita una "lista esperada" que hoy no existe.
- No control por voz en recepción (descartado en brainstorming: baja relación
  valor/esfuerzo con ruido de cocina).

## 3. Arquitectura general

La pantalla pasa de 2 entradas (📷 Foto · ✍️ Manual) a **3 vías** que vuelcan en la
cola `recPendientes` existente:

```
🔢 Escanear EAN ─┐
📷 Foto         ─┼──► cola de revisión (recPendientes) ──► "Registrar todo"
✍️ Manual       ─┘                                          └► persiste en cocina_recepciones
```

Cada fila de la cola gana un campo **`codigo_barras`** (opcional) y conserva
`producto · proveedor · lote · caducidad · temperatura · conforme · observaciones`.

Entrega **por fases independientes y desplegables sueltas**:

| Fase | Contenido | Toca core compartido |
|---|---|---|
| **A** | Escáner EAN (cliente) + catálogo propio | No |
| **B** | Motor Gemini Vision | Sí (`@central/core-ai`) |
| **C** | Captura lote/caducidad enfocada + persistir EAN | No (migración BD) |
| **2** | Temperatura por foto de la sonda | Reusa B |
| **3** | Foto-albarán archivada (prueba APPCC) | Reusa `@central/core-storage` |
| **4** | FEFO on-screen para Carmen | No |
| **5** | Escaneo continuo multi-EAN | Reusa A |

## 4. Fase A — Escáner de código de barras (cliente)

**UI:** botón nuevo **🔢 Escanear código** junto a "Añadir foto" / "+ Manual" en
`/produccion`. Abre un visor de cámara a pantalla completa.

**Tecnología de lectura (cliente, sin IA, sin límite de tamaño):**
- API nativa **`BarcodeDetector`** cuando está disponible (Chrome/Android — el entorno
  real de Catering JJ).
- *Fallback* a **`@zxing/browser`** para navegadores sin soporte (iOS/Safari).
- Formatos: EAN-13, EAN-8, UPC-A/E.

**Resolución del nombre** — nueva ruta `GET /api/cocina/recepciones/ean?code=<ean>`,
con cadena de fallback:

1. **Catálogo propio:** EAN visto antes en `cocina_recepciones` (de este local). →
2. **Open Food Facts:** se extrae el helper `nombrePorEan` (hoy embebido en
   `reconocer/route.ts`) a `lib/recepcion-ean.ts` y se reutiliza. →
3. **Desconocido:** la fila se crea con `producto = "Código <ean>"`; el usuario teclea
   el nombre **una vez** y, al registrar, queda asociado al EAN → la próxima vez se
   resuelve solo (construye el catálogo de marca blanca de Mercadona de forma orgánica).

**Salida:** añade una fila a `recPendientes` con `producto` + `codigo_barras` rellenos;
el usuario completa lote/caducidad (manual o foto enfocada, §6).

**Archivos:** `produccion/page.tsx` (botón + visor + handler), nuevo
`api/cocina/recepciones/ean/route.ts`, nuevo `lib/recepcion-ean.ts` (helper extraído),
`package.json` (dep `@zxing/browser`).

## 5. Fase B — Motor de lectura Gemini Vision

**Núcleo compartido:** añadir `geminiVision()` a `packages/core-ai/src/gemini.ts`,
con el mismo endpoint REST que `geminiSearch`
(`generativelanguage.googleapis.com/v1beta/models/<model>:generateContent`) usando
partes `inlineData` (base64). Gemini Flash es muy superior en OCR y **acepta imágenes
grandes** (muy por encima del tope de 180 KB de NIM). Exportar desde `index.ts`.

**Cliente de IA (`apps/ia-rest/src/lib/ai-client.ts`):** `callAIVision` pasa a ordenar:

```
pasarela (gatewayVision) → Gemini (si GEMINI_API_KEY) → NIM → error
```

Es un **fallback real que hoy no existe** (NIM va "sin fallback" porque Groq no tiene
visión; Gemini sí). ⚠️ **Cambia el comportamiento de TODOS los consumidores de visión**
del proyecto → se marca explícitamente para code-review y se valida que ningún otro
caller dependa del formato exacto de salida de NIM.

**Compresión (`fotoAJpegPequeno` en `produccion/page.tsx`):** deja de limitar a 170 KB.
Sube a **~2 MB / 2000 px** de lado (el endpoint `reconocer` ya admite hasta 4 MB). Se
conserva una rama de compresión agresiva **solo** como último recurso si Gemini no está
disponible y hay que caer a NIM.

**Prompt:** se mantiene el actual de `reconocer/route.ts`, subiendo `maxTokens` (de 1200
a ~2000) para albaranes multilínea largos.

**Archivos:** `packages/core-ai/src/gemini.ts`, `packages/core-ai/src/index.ts`,
`apps/ia-rest/src/lib/ai-client.ts`, `produccion/page.tsx`,
`api/cocina/recepciones/reconocer/route.ts`.

## 6. Fase C — Lote/caducidad enfocado + persistir EAN

- **Captura cercana opcional de lote/caducidad:** tras identificar el producto (escáner
  o foto), el usuario puede hacer una **foto de cerca** de la zona del lote/caducidad,
  procesada por Gemini con un prompt **acotado solo a `lote · caducidad · temperatura`**.
  Alternativa siempre disponible: teclear (ya existe).
- **Persistir el EAN:** migración que añade `codigo_barras text` (+ índice) a
  `cocina_recepciones`. El endpoint de registro (`recepciones/route.ts` POST) lo guarda;
  la ruta `ean` lo consulta para el catálogo propio (§4).

**Migración (schema `iarest`, aditiva):**

```sql
ALTER TABLE iarest.cocina_recepciones
  ADD COLUMN IF NOT EXISTS codigo_barras text;
CREATE INDEX IF NOT EXISTS idx_cocina_recepciones_ean
  ON iarest.cocina_recepciones (local_id, codigo_barras)
  WHERE codigo_barras IS NOT NULL;
```

## 7. Idea 2 — Temperatura por foto de la sonda

Recepcionar refrigerado/congelado **obliga a registrar la Tª** (APPCC). En la fila de la
cola, un botón **🌡️ Foto Tª** captura el display del termómetro/sonda → Gemini con prompt
mínimo (`{ "temperatura": number|null }`) → rellena el campo `temperatura`. Reusa el
motor de la Fase B; cero infra nueva.

**Archivos:** `produccion/page.tsx` (botón + handler por fila), nuevo endpoint ligero
`api/cocina/recepciones/temperatura/route.ts` (o parámetro `modo=temperatura` en
`reconocer`).

## 8. Idea 3 — Foto-albarán archivada (prueba documental APPCC)

En una inspección APPCC piden el **albarán físico/escaneado**, no una tabla. La imagen
**original** del albarán/etiqueta (antes de comprimir para la IA) se sube a un bucket de
**Supabase Storage** (patrón existente de `documentos_escaneados`/SmartScanFAB) y se
guarda su ruta junto a la recepción.

- Bucket `recepciones` (privado). Ruta `<local_id>/<fecha>/<uuid>.jpg`.
- Migración: `ADD COLUMN IF NOT EXISTS evidencia_url text` en `cocina_recepciones`.
- Visualización: enlace/preview en el listado de recepciones del día, vía URL firmada
  (`signStorageObject` de `@central/core-storage`).

**Archivos:** `produccion/page.tsx` (subida de la imagen original), endpoint de subida
(o ampliar `recepciones/route.ts` POST para aceptar `evidencia`), migración.

## 9. Idea 4 — FEFO on-screen para Carmen

Aviso de caducidad **en la propia pantalla `/produccion`** (no Telegram a Carmen). Regla
de notificaciones del proyecto: *Telegram solo para el operador (Alberto); a usuarios
finales no se les satura el Telegram/email con alertas internas*. Carmen es usuaria final.

- **Banner FEFO** (First-Expired-First-Out) en `/produccion`: lista de productos
  recepcionados **caducados** o **que caducan pronto** (umbral configurable, p. ej. ≤3
  días), ordenados por caducidad ascendente.
- Fuente de datos: `cocina_recepciones` con `caducidad` no nula del local.
- Nueva ruta `GET /api/cocina/recepciones/caducidades?dias=3` (server, service_role).
- **Telegram opcional solo para Alberto** (operador) como resumen, vía `tgAlert()`,
  detrás de un flag — no es el canal principal.

**Archivos:** nuevo `api/cocina/recepciones/caducidades/route.ts`,
`produccion/page.tsx` (componente banner FEFO).

## 10. Idea 5 — Escaneo continuo multi-EAN

Modo del visor de la Fase A que **no se cierra entre lecturas**: el usuario pasa varios
packs seguidos y cada EAN reconocido **acumula una fila** en la cola (con dedupe por EAN
en la misma sesión para no duplicar si la cámara relee el mismo código). Botón "Hecho"
para cerrar. Ideal para vaciar una caja de la compra del súper.

**Archivos:** `produccion/page.tsx` (estado del visor + acumulación + dedupe).

## 11. Manejo de errores y casos límite

| Caso | Comportamiento |
|---|---|
| Sin permiso de cámara | Cae a 📷 Foto / ✍️ Manual; mensaje claro |
| `BarcodeDetector` no soportado | Fallback a `@zxing/browser`; si falla, manual |
| EAN no resuelto en ninguna fuente | Fila `Código <ean>`; el usuario lo nombra → se memoriza |
| EAN marca blanca no en Open Food Facts | Igual que arriba; el catálogo propio lo aprende |
| Gemini caído | Fallback a NIM (degradado pero funciona); si ambos caen → manual |
| Albarán multilínea | Prompt ya soporta varios productos; `maxTokens` subido |
| Foto borrosa / `confianza` baja | La fila se marca para revisión (la cola ya es revisión humana) |
| Imagen original muy grande para evidencia | Se sube la original aparte; a la IA va la comprimida |
| Relectura del mismo EAN en escaneo continuo | Dedupe por EAN en la sesión del visor |

## 12. Futuro (fuera de este spec) — Esperado vs recibido

Cruzar lo recibido contra lo **pedido** para un evento (`cocina_eventos` /
`cocina_evento_elaboraciones`) y marcar lo que falta o sobra. Mucho valor, pero requiere
una "lista esperada" (pedido/orden de compra) que hoy no existe formalmente en el modelo.
Se aborda como proyecto propio cuando exista esa fuente.

## 13. Pruebas

- **Unit:** adaptador `geminiVision` (mock `fetch`, valida construcción de `inlineData` y
  parseo); helper `nombrePorEan` y ruta `ean` (mock Open Food Facts + cache hit/miss);
  ruta `caducidades` (umbral de días, orden FEFO).
- **Manual:** escanear el EAN del atún `8480000180186` → resuelve o pide nombre y lo
  recuerda; foto de un albarán real → multilínea con lote/caducidad; foto de una sonda →
  temperatura; comprobar banner FEFO con una recepción caducada de prueba.
- **Build:** `npx tsc --noEmit` (0 errores) **y** `next build` con deps (reproduce el
  build de Vercel; `tsc` solo no basta).

## 14. Orden de entrega sugerido

1. **A** (escáner EAN) — aislado, alto valor, cero riesgo. Resuelve ya el caso Mercadona.
2. **B** (Gemini Vision) — salto de calidad para albaranes/etiquetas.
3. **C** (lote/caducidad + persistir EAN) — completa el núcleo.
4. **2** (Tª por foto) y **3** (evidencia) — esenciales APPCC sobre B.
5. **4** (FEFO) y **5** (escaneo continuo) — cierre y pulido de UX.

Cada paso es desplegable por separado y deja la pantalla en estado usable.
