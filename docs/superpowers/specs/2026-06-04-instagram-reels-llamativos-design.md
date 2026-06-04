# Diseño — Instagram: posts más llamativos + reels automáticos con música

> Fecha: 2026-06-04 · Estado: aprobado (Alberto) · Rama: `claude/elegant-dirac-DJLHF`
> Alcance: **Fase 1 + Fase 2** del roadmap de mejora del agente de Instagram.

## Objetivo

Subir el nivel del contenido que publica el agente de Instagram de ia.rest en dos frentes:

1. **Más llamativos** — rediseñar las plantillas de imagen (`/api/ig-img`) con
   mejor jerarquía, color/icono por módulo y acentos visuales. Como los slides
   del reel reutilizan la plantilla `slide`, el reel mejora a la vez.
2. **Reels automáticos** — que el cron decida formato y monte el reel solo
   (el motor `/api/ig-reel` ya existe), con **motion** (Ken Burns) y **música**
   royalty-free, manteniendo el flujo de aprobación por Telegram.

## Fuera de alcance (otras fases del roadmap, NO en este spec)

- Fase 3 — Imágenes IA generativas (Gemini) como fondo.
- Fase 4 — Voice-over TTS en el reel.
- Carrusel multi-imagen (`publicarCarrusel` existe pero sin uso; se deja igual).

## Estado actual (punto de partida)

- **Imagen:** `src/app/api/ig-img/route.tsx` — `ImageResponse` de `next/og`,
  1080×1080, 3 estilos (`editorial`/`brutalist`/`humano`), 7 tipos
  (`pregunta`/`stat`/`tip`/`comparativa`/`cita`/`producto`/`slide`). Solo
  tipografía + color; sin imágenes generativas.
- **Reel:** `src/app/api/ig-reel/route.ts` — Cloudinary, monta N slides
  (`/api/ig-img?tipo=slide`) en MP4 vertical 1080×1920, 3 s/slide, crossfade
  800 ms, sobre `BASE_VIDEO='iarest_base_dark'`. **Solo se dispara a mano** desde
  callback de Telegram; siempre estilo editorial; **sin audio**.
- **Cron:** `src/app/api/cron/instagram/route.ts` — lun+vie; hoy **solo genera
  imagen**, nunca decide reel.
- **Publicación:** `src/lib/instagram.ts` — `publicarEnInstagram(imageUrl, caption)`,
  `publicarReel(videoUrl, caption)`, `obtenerMetricas`, `renovarToken`.
- **BD:** `instagram_borradores` (campos `plantilla`, `titulo`, `sub`, `dato`,
  `unidad`, `ctx`, `items`, `caption`, `image_url`, `tema_elegido`,
  `modulo_relacionado`, `estado`, `telegram_msg_id`) y `instagram_posts`
  (incluye `tipo: 'imagen' | 'reel'` y métricas).

## Enfoque elegido

**Evolucionar en sitio** (recomendado). Se mantiene `next/og` para imágenes y
Cloudinary para reels; se añaden capas encima. Alternativas descartadas:
(B) pipeline FFmpeg propio — lento en Vercel + nueva infra; (C) API de vídeo de
pago (Shotstack/Creatomate) — pulido pero dependencia de pago y lock-in.

---

## Parte 1 — Plantillas más llamativas (`ig-img`)

### 1.1 Theming por módulo

Nuevo mapa `MODULO_THEME` en `ig-img` (acento + glifo por módulo), usando el
parámetro `modulo` (de `modulo_relacionado`, que ya viaja en el borrador).
Mantiene la base oscuro/crema de marca; **solo cambia el acento** → variedad sin
romper identidad.

Mapeo inicial (colores del design system `src/lib/colors.ts`):

| Módulo (`modulo_relacionado`) | Acento | Glifo |
|---|---|---|
| `voz` / `brain` / (default) | `#D9442B` (rojo) | ● |
| `qr` | `#3F7D44` (verde) | ▢ |
| `verifactu` / `contabilidad` | `#E8A33B` (ámbar) | § |
| `almacen` / `compras` | `#9C8E7E` (tostado) | ▣ |
| `eventos` | `#785F4B` (marrón) | ◆ |

El acento se aplica a: banda de cabecera/kicker, número destacado, CTA y acentos
de slide. Si el módulo no está en el mapa → acento rojo (default actual).

### 1.2 Jerarquía y legibilidad

- Tamaño de fuente **responsive por longitud** en **todas** las plantillas
  (hoy solo en algunas) → hooks grandes y legibles a velocidad de scroll.
- Kicker (etiqueta pequeña arriba) + footer de marca consistentes en todas.
- Pesos más contrastados (titular bold/News, cuerpo Inter).

### 1.3 Acentos visuales

- Textura/grano sutil de fondo (overlay muy bajo) para dar cuerpo.
- Forma de acento consistente (regla diagonal o bloque de esquina) en color de
  módulo.
- Grid coherente entre plantillas.

### 1.4 Reutilización (clave que une Fase 1 ↔ 2)

La plantilla `slide` hereda el theming → **los slides del reel se ven mejor sin
tocar el reel**. El parámetro `modulo` debe propagarse a `?tipo=slide`.

---

## Parte 2 — Reels automáticos con música y motion

### 2.1 Decisión de formato en el cron

En `cron/instagram`, añadir selección de formato:

- **viernes → reel**, **lunes → imagen** (1 reel/semana fijo).
- Implementado con una función `formatoDelDia()` (día de la semana) aislada y
  testeable.
- Cuando es reel: NIM genera `{ titulo, p1, p2, p3, caption }` (título ≤55,
  puntos ≤70), se llama a `generarReel(...)`, se guarda borrador con
  `plantilla='reel'` e `image_url`=MP4, y se manda a Telegram con los mismos
  botones de aprobación (✅ Publicar / 🗑️ Descartar).

### 2.2 Motion (Ken Burns)

Mejorar `buildReelUrl` en `ig-reel`: además del crossfade actual, añadir
zoom/pan sutil por slide con transformación Cloudinary (`e_zoompan` o animación
de escala). Salida sigue siendo MP4 1080×1920.

### 2.3 Música (royalty-free, "automática")

- **Restricción real:** la música licenciada de Instagram **no** se puede
  añadir vía Graph API (solo in-app). Las pistas deben ser **royalty-free de uso
  comercial** (p. ej. Pixabay / YouTube Audio Library, licencia comercial sin
  atribución).
- **Siembra única (paso manual, una sola vez):** subir un pool pequeño (3–5) de
  pistas a Cloudinary con public IDs conocidos (`iarest_music_1..N`,
  `resource_type=video`).
- **Automático desde entonces:** el cron elige una pista al azar por reel.
- `buildReelUrl` añade capa de audio recortada a la duración del vídeo
  (`l_audio:iarest_music_X` + `fl_layer_apply`, volumen ajustado).
- **Fallback:** si no hay pool de música → reel **mudo** (no falla).
- **Trazabilidad:** guardar la pista usada (columna opcional `audio_pid` en
  `instagram_posts`/`instagram_borradores`, o en metadata).

### 2.4 Flujo de datos (reel)

```
cron/instagram (viernes)
  → NIM genera { titulo, p1, p2, p3, caption }
  → generarReel({ titulo, puntos, estilo, modulo })
      → slides temáticos vía /api/ig-img?tipo=slide&modulo=...
      → sube slides a Cloudinary
      → buildReelUrl con zoompan + audio (pista aleatoria)
      → MP4 1080×1920
  → guarda borrador (plantilla='reel', image_url=MP4)
  → Telegram (aprobación)
  → aprobar → publicarReel(mp4, caption)
```

## Manejo de errores

- **Fallo al generar el reel** (timeout Cloudinary, etc.) → **fallback a imagen**
  ese día + aviso por Telegram. Nunca se salta la publicación del día.
- **Pool de música ausente** → reel mudo (degradación elegante).
- **Subida de slides a Cloudinary** → retry + backoff (patrón ya usado en el
  proyecto).

## Verificación (evidencia, no afirmaciones)

- `npx tsc --noEmit` con 0 errores.
- `next build` (regla del proyecto — no basta `tsc`, debe reproducir el build de
  Vercel).
- Disparo manual `?manual=1` que genere: (a) imágenes temáticas de varios
  módulos y (b) un reel completo, para revisarlos a ojo (MP4 reproduce, audio
  presente, colores de módulo correctos) **antes** de fiarlo al cron.

## Dependencias / acciones externas

- **Siembra de música:** subir 3–5 pistas royalty-free a Cloudinary una vez
  (`iarest_music_1..N`). Hasta entonces, reels mudos (no bloquea el resto).
- Posible columna `audio_pid` (migración menor) — opcional, solo trazabilidad.

## Criterios de éxito

- El viernes el cron genera un **reel** (con motion y, si hay pool, música) como
  borrador y lo manda a Telegram; el lunes genera **imagen**.
- Las imágenes muestran **acento de color por módulo** y mejor jerarquía.
- Los slides del reel heredan el nuevo theming.
- Si el reel falla, sale imagen y llega aviso; nada se queda sin publicar.
- `tsc` y `next build` limpios.
