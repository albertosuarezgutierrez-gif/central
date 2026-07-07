# Diseño — Reels de Instagram "mejores": Veo 3 Fast con audio nativo

> Fecha: 2026-07-07 · Estado: **propuesto (PR draft, pendiente ✅ Alberto)** ·
> Rama: `claude/instagram-video-improvements-m6avu9`
> Continúa el roadmap de `2026-06-04-instagram-reels-llamativos-design.md`
> (aquella era Fase 1/2; esto es la **Fase 3 real**: subir el motor de vídeo IA).

## Origen

Alberto: *"quiero mejores vídeos para instagram"* enlazando
`anil-matcha/open-generative-ai` (estudio open-source con 200+ modelos: Flux,
**Veo**, Sora, Kling, lip-sync, image-to-video). La señal: dar un salto de
calidad en el vídeo IA del Reel, mirando a los modelos punteros (Veo destaca).

## Estado de partida (lo que ya hay)

- **Miércoles** el cron (`api/cron/instagram`) genera un **Reel IA** con
  **Kling 2.5-turbo/pro** text-to-video (10s, vertical 9:16) vía la Edge Function
  `ig-video-gen` (fal.ai, asíncrona). Se aprueba por Telegram (🔄 Comprobar → ✅).
- El prompt de vídeo lo escribe NIM a partir del tema semanal (`generarPromptVideo`).
- `videoConSubtitulo` (Cloudinary) sobreimprime marca + título + endcard de marca.
- **El Reel IA sale MUDO** — Kling no genera audio, y la música royalty-free solo
  se aplicaba a los reels de slides (que ya se decidió NO publicar). Silencio.
- Lun/Vie → carrusel; resto → imagen. Fallback del Reel IA: si falla → imagen.

## Decisión

**Subir el motor del Reel IA de Kling → Veo 3 Fast (`fal-ai/veo3/fast`).**

Datos verificados (fal.ai, jul-2026):

| Motor | ID | Coste | Audio | 9:16 | Duración |
|---|---|---|---|---|---|
| Kling 2.5-turbo/pro (actual) | `fal-ai/kling-video/v2.5-turbo/pro/text-to-video` | $0.07/s → ~$0.70/reel | ❌ | ✅ | 5/10s |
| **Veo 3 Fast** (nuevo) | `fal-ai/veo3/fast` | $0.10/s → ~$0.80/reel | ✅ **nativo sincronizado** | ✅ | 4/6/**8s** |

Por **~€0.10 más por reel** (1 reel/semana ≈ €3/mes) se gana:
1. **Audio nativo sincronizado** — resuelve el "Reel IA mudo" SIN sembrar música
   royalty-free ni tocar Cloudinary. El 20% que ve con sonido ya no oye silencio.
2. **Realismo de Google Veo** — el salto de calidad "comercial de verdad" que pide
   el enlace del repo, mucho mejor que Kling para escenas de bar reales.

### Por qué es SEGURO por defecto (sin aprobación interactiva)

- **Human-in-the-loop:** TODO reel pasa por aprobación Telegram antes de publicarse.
  Nada llega a Instagram sin el ✅ de Alberto → un mal render nunca sale en abierto.
- **Cadena de degradación:** Veo falla → **Kling** (comportamiento previo) → **imagen**.
  El día nunca queda vacío. La lógica de fallback ya existe; solo se antepone Veo.
- **Un solo mando:** env `IG_VIDEO_ENGINE` (`veo3-fast` | `kling`). Default
  `veo3-fast`; poner `kling` en Vercel revierte al instante, sin redeploy de código.
- **Coste acotado:** 1 reel/semana; el patrón asíncrono y el gate de Telegram evitan
  bucles de gasto.

### Alternativas descartadas

- **Veo 3 (full) / Veo 3.1** — mejor aún pero 3-6× más caro; el "fast" ya da el salto.
- **Image-to-video partiendo de `ig-img producto`** — esa plantilla es una tarjeta
  tipográfica; animarla = póster en movimiento, no una escena real. Se deja la vía
  i2v cableada en la EF para el futuro (con foto real), pero el cron sigue en t2v.
- **Mantener Kling y solo mejorar prompts** — no aporta el audio ni el salto de motor.

## Cambios

### 1. Edge Function `ig-video-gen` (Supabase, Deno)
- Nuevo campo de entrada `engine: 'veo3-fast' | 'kling'` (default `kling` si ausente,
  para no romper llamadas crudas; el cron pasa siempre el suyo).
- Mapa engine → modelo t2v/i2v:
  - `veo3-fast` → `fal-ai/veo3/fast` (t2v) / `fal-ai/veo3/fast/image-to-video` (i2v).
  - `kling` → los actuales `fal-ai/kling-video/v2.5-turbo/pro/...`.
- **Payload por motor** (fal.ai difiere entre modelos):
  - Veo: `{ prompt, aspect_ratio, duration:'8s', resolution:'720p', generate_audio:true }`
    (Veo acepta `4s|6s|8s`; máx 8 — se clampa).
  - Kling: `{ prompt, aspect_ratio, duration:'5'|'10' }` (sin resolution/audio).
- La cola fal.ai (`request_id/status_url/response_url`) y la lectura del resultado
  (`output.video.url`) son **idénticas** entre modelos → `action=status` no cambia.

### 2. `src/lib/ai-video.ts`
- `startVideoIA(prompt, { imageUrl?, duration?, engine?, generateAudio? })` → pasa
  `engine`/`generateAudio` a la EF. Firma retrocompatible (campos opcionales).

### 3. `src/app/api/cron/instagram/route.ts`
- `const engine = process.env.IG_VIDEO_ENGINE === 'kling' ? 'kling' : 'veo3-fast'`.
- Llamada: `startVideoIA(promptVideo, { duration: 8, engine, generateAudio: true })`.
- `generarPromptVideo(tema, engine)`: cuando el motor es Veo, el prompt añade
  **dirección de audio** (sonido ambiente del local, sin diálogo/locución) y refuerza
  **"no on-screen text, no subtitles, no captions, no watermark"** (Veo tiende a quemar
  subtítulos si detecta palabras — gotcha conocido). Kling mantiene su prompt actual.
- Mensaje de Telegram: indica el motor usado (🎬 Veo 3 / Kling) para trazabilidad.
- Si `startVideoIA` con Veo lanza error → se reintenta **una vez con Kling** antes de
  caer a imagen (cadena Veo → Kling → imagen).

### 4. `src/app/api/ig-ai-video/route.ts` (disparo manual)
- Acepta `?engine=` (default el de env) para poder probar Veo a mano con `?tipo=...`.

## Manejo de errores
- Veo enqueue/gen falla → Kling → imagen (nunca día vacío; aviso Telegram del motivo).
- `generate_audio` no soportado / respuesta rara → la EF devuelve el error de fal.ai
  tal cual (mismo camino que hoy), el cron degrada.
- `videoConSubtitulo` no cambia: los overlays de texto y el endcard **preservan la
  pista de audio** de Veo (Cloudinary `q_auto` mantiene audio; el endcard añade 2s de
  cierre en silencio, aceptable como outro de marca).

## Verificación (evidencia, no afirmaciones)
- `npx tsc --noEmit` en `apps/ia-rest` → 0 errores.
- `next build` (regla del proyecto — reproduce Vercel) si el entorno lo permite.
- **Prueba real antes de fiarlo al cron:** `GET /api/ig-ai-video?tipo=voz&engine=veo3-fast`
  (Bearer/secret), esperar ~1-2 min, comprobar que el MP4 **reproduce con sonido** y
  sin subtítulos quemados. Luego `?formato=reel&manual=1` en el cron para un reel end-to-end.

## Acciones externas (Alberto)
- (Opcional) fijar `IG_VIDEO_ENGINE` en Vercel: por defecto `veo3-fast`; `kling` para revertir.
- Verificar que `FAL_API_KEY` (Supabase secret) tiene saldo/acceso a Veo 3 Fast.

## Criterios de éxito
- El miércoles el cron genera un Reel IA **con Veo 3 Fast y audio nativo**, como borrador,
  y lo manda a Telegram; el resto del calendario intacto.
- Si Veo falla, sale Kling; si Kling falla, imagen. Nada se queda sin publicar.
- `IG_VIDEO_ENGINE=kling` restaura el comportamiento anterior sin tocar código.
- `tsc` limpio.
