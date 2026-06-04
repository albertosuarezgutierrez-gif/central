# Instagram: posts más llamativos + reels automáticos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar acento de color/icono por módulo a las plantillas de Instagram y hacer que el cron genere reels automáticamente (con motion y música) los viernes, manteniendo la aprobación por Telegram.

**Architecture:** Se evoluciona lo existente. `next/og` sigue generando imágenes (`ig-img`), Cloudinary sigue montando reels (`ig-reel`). Se añaden 2 libs puras (`instagram-theme`, `instagram-music`), se inyecta theming por módulo en `ig-img`, se enriquece `buildReelUrl` (audio + motion) y se añade al cron una rama de formato (viernes→reel) con fallback a imagen.

**Tech Stack:** Next.js (App Router, runtime edge para `ig-img`), Cloudinary video transformations, NVIDIA NIM vía `lib/ai-client`, Supabase, Telegram. Sin runner de tests: verificación con `npx tsc --noEmit`, `npx next build`, `npx eslint` y smoke-scripts `npx tsx`.

**Spec:** `docs/superpowers/specs/2026-06-04-instagram-reels-llamativos-design.md`

---

## File Structure

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `src/lib/instagram-theme.ts` | Crear | Mapa `MODULO_THEME` (acento+glifo) + `temaModulo()`. Puro, sin deps. |
| `src/lib/instagram-music.ts` | Crear | Pool de pistas (env `CLOUDINARY_MUSIC_IDS`) + `pickMusicTrack()`. Puro. |
| `src/app/api/ig-img/route.tsx` | Modificar | Parsear `modulo`, calcular acento/glifo y aplicarlo a `slide` + `stat`/`pregunta` editorial. |
| `src/app/api/ig-reel/route.ts` | Modificar | `buildReelUrl` con audio+motion; `generarReel` acepta `modulo` y `audioPid`. |
| `src/app/api/cron/instagram/route.ts` | Modificar | `formatoDelDia()`, rama reel (viernes) con fallback a imagen. |
| `.env.example` | Modificar | Documentar `CLOUDINARY_MUSIC_IDS`. |

**Convención del proyecto (CLAUDE.md):** archivos completos al editar, español en nombres, `npx tsc --noEmit` 0 errores antes de cada commit, NUNCA `git pull --rebase`. Commits frecuentes.

---

## Task 1: Lib de theming por módulo

**Files:**
- Create: `src/lib/instagram-theme.ts`
- Smoke: `scripts/smoke-instagram-theme.ts`

- [ ] **Step 1: Escribir la lib**

`src/lib/instagram-theme.ts`:

```ts
// Acento de color + glifo por módulo para las plantillas de Instagram.
// Mantiene la base oscuro/crema de marca; solo cambia el acento por módulo.
// Colores alineados con src/lib/colors.ts (RED/green/amber/tostado/marrón).
export type ModuloTheme = { accent: string; glifo: string }

const DEFAULT_THEME: ModuloTheme = { accent: '#D9442B', glifo: '●' } // rojo marca

const THEMES: Record<string, ModuloTheme> = {
  voz:          { accent: '#D9442B', glifo: '●' },
  brain:        { accent: '#D9442B', glifo: '●' },
  qr:           { accent: '#3F7D44', glifo: '▢' },
  verifactu:    { accent: '#E8A33B', glifo: '§' },
  contabilidad: { accent: '#E8A33B', glifo: '§' },
  almacen:      { accent: '#9C8E7E', glifo: '▣' },
  compras:      { accent: '#9C8E7E', glifo: '▣' },
  eventos:      { accent: '#785F4B', glifo: '◆' },
}

export function temaModulo(modulo?: string | null): ModuloTheme {
  if (!modulo) return DEFAULT_THEME
  return THEMES[modulo.trim().toLowerCase()] || DEFAULT_THEME
}
```

- [ ] **Step 2: Escribir el smoke-script**

`scripts/smoke-instagram-theme.ts`:

```ts
import { temaModulo } from '../src/lib/instagram-theme'

const cases: Array<[string | null | undefined, string]> = [
  ['qr', '#3F7D44'],
  ['VeriFactu', '#E8A33B'],   // case-insensitive
  ['  almacen ', '#9C8E7E'],  // trim
  ['desconocido', '#D9442B'], // fallback
  [null, '#D9442B'],
  [undefined, '#D9442B'],
]
let ok = true
for (const [input, expected] of cases) {
  const got = temaModulo(input).accent
  const pass = got === expected
  if (!pass) ok = false
  console.log(`${pass ? 'PASS' : 'FAIL'} temaModulo(${JSON.stringify(input)}) = ${got} (esperado ${expected})`)
}
if (!ok) { console.error('SMOKE THEME FALLÓ'); process.exit(1) }
console.log('SMOKE THEME OK')
```

- [ ] **Step 3: Ejecutar el smoke (debe pasar)**

Run: `npx tsx scripts/smoke-instagram-theme.ts`
Expected: 6 líneas `PASS` y `SMOKE THEME OK`, exit 0.

- [ ] **Step 4: tsc limpio**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/lib/instagram-theme.ts scripts/smoke-instagram-theme.ts
git commit -m "feat(ig): lib de theming por módulo (acento+glifo)"
```

---

## Task 2: Theming por módulo en `ig-img`

Aplica el acento del módulo a la plantilla `slide` (la del reel) y a `stat`/`pregunta` editorial. Es cambio visual: se verifica renderizando, no con asserts.

**Files:**
- Modify: `src/app/api/ig-img/route.tsx`

- [ ] **Step 1: Parsear `modulo` y calcular acento**

En `src/app/api/ig-img/route.tsx`, añadir el import al principio (junto a los otros imports, líneas 1-2):

```tsx
import { temaModulo } from '@/lib/instagram-theme'
```

Tras la línea `const punto = p.get('punto') || ''` (línea 40), añadir:

```tsx
  const modulo = p.get('modulo') || ''
  const { accent: AC, glifo: GL } = temaModulo(modulo)
```

- [ ] **Step 2: Usar el acento en `slide` (portada, cierre e intermedia)**

En el bloque `if (tipo === 'slide')` (líneas 194-241), sustituir los usos de `RED` por `AC` y añadir el glifo al kicker. Reemplazar el bloque COMPLETO `if (tipo === 'slide') { ... }` por:

```tsx
  if (tipo === 'slide') {
    const esPortada=num===1,esCierre=num===total
    if (esPortada) return R(
      <div style={{width:S,height:S,background:DARK,display:'flex',flexDirection:'column',justifyContent:'space-between',padding:90,fontFamily:'News'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',fontFamily:'Inter'}}>
          <span style={{fontSize:12,letterSpacing:'0.14em',textTransform:'uppercase',color:AC}}>{GL} Blog · ia.rest</span>
          <span style={{fontSize:12,letterSpacing:'0.1em',color:I3}}>1 / {total}</span>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:24}}>
          <div style={{width:50,height:4,background:AC,borderRadius:2}}/>
          <div style={{fontStyle:'italic',fontSize:titulo.length>55?52:64,color:CR,lineHeight:1.15}}>{titulo}</div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:12,fontFamily:'Inter'}}>
          <div style={{fontSize:13,color:I3}}>Desliza para ver →</div>
          <div style={{flex:1,height:1,background:'#2E2720'}}/>
          <div style={{fontSize:13,color:I3}}>www.iarest.es</div>
        </div>
      </div>)
    if (esCierre) return R(
      <div style={{width:S,height:S,background:AC,display:'flex',flexDirection:'column',justifyContent:'space-between',padding:90,fontFamily:'News'}}>
        <span style={{fontSize:12,letterSpacing:'0.14em',textTransform:'uppercase',color:'rgba(246,241,231,0.5)',fontFamily:'Inter'}}>{num} / {total}</span>
        <div style={{display:'flex',flexDirection:'column',gap:20}}>
          <div style={{fontStyle:'italic',fontSize:56,color:CR,lineHeight:1.15}}>¿Lo probamos en tu restaurante?</div>
          <div style={{fontSize:22,color:'rgba(246,241,231,0.7)',fontFamily:'Inter'}}>14 días gratis · Sin contrato · Sin comisión</div>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:12,fontFamily:'Inter'}}>
          <div style={{fontSize:18,color:'rgba(246,241,231,0.6)',letterSpacing:'0.05em'}}>www.iarest.es</div>
          <div style={{fontSize:13,color:'rgba(246,241,231,0.4)',letterSpacing:'0.1em',textTransform:'uppercase'}}>TPV por voz para hostelería · 59€/mes</div>
        </div>
      </div>)
    const numStr=String(num)
    const bg=num%2===0?CR:DARK,textColor=num%2===0?INK:CR
    const numColor=num%2===0?'rgba(217,68,43,0.10)':'rgba(217,68,43,0.15)'
    return R(
      <div style={{width:S,height:S,background:bg,display:'flex',flexDirection:'column',justifyContent:'space-between',padding:90,fontFamily:'News'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',fontFamily:'Inter'}}>
          <span style={{fontSize:12,letterSpacing:'0.14em',textTransform:'uppercase',color:I3}}>{GL} ia.rest · Blog</span>
          <span style={{fontSize:12,color:I3}}>{num} / {total}</span>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:16}}>
          <div style={{fontStyle:'italic',fontSize:160,color:numColor,lineHeight:0.85}}>{numStr}</div>
          <div style={{fontStyle:'italic',fontSize:punto.length>80?44:54,color:textColor,lineHeight:1.3}}>{punto}</div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <div style={{width:40,height:3,background:AC}}/>
          <span style={{fontStyle:'italic',fontSize:16,color:I3}}>ia.rest</span>
        </div>
      </div>)
  }
```

> Nota: el número grande intermedio mantiene el tinte rojo translúcido (`numColor`) a propósito — es marca de fondo, no acento de módulo. El cambio de acento va en kicker, regla y glifo.

- [ ] **Step 3: Usar el acento en `stat` editorial**

En el bloque `if (tipo === 'stat')` editorial (líneas 104-118), reemplazar el chip y el número por la versión con `AC`/`GL`. Reemplazar el bloque COMPLETO `if (tipo === 'stat') return R( ... )` (editorial, el de líneas 104-118) por:

```tsx
  if (tipo === 'stat') return R(
    <div style={{width:S,height:S,background:DARK,display:'flex',flexDirection:'column',justifyContent:'space-between',padding:90,fontFamily:'Inter'}}>
      <span style={{fontSize:12,letterSpacing:'0.15em',textTransform:'uppercase',color:AC,background:'rgba(255,255,255,0.06)',padding:'4px 14px',borderRadius:100,alignSelf:'flex-start'}}>{GL} {sub||'Dato del sector'}</span>
      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        <div style={{fontStyle:'italic',fontSize:160,color:AC,lineHeight:1,fontFamily:'News'}}>{dato}</div>
        <div style={{fontStyle:'italic',fontSize:34,color:I2,fontFamily:'News'}}>{unidad}</div>
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:16,borderTop:'1px solid #2E2720',paddingTop:32}}>
        <div style={{fontSize:22,color:CR,lineHeight:1.5}}>{ctx}</div>
        <div style={{display:'flex',justifyContent:'space-between'}}>
          <span style={{fontStyle:'italic',fontSize:20,color:I3,fontFamily:'News'}}>ia<span style={{color:AC}}>.</span>rest</span>
          <span style={{fontSize:16,color:I3}}>www.iarest.es</span>
        </div>
      </div>
    </div>)
```

- [ ] **Step 4: Usar el acento en `pregunta` editorial**

Reemplazar el bloque COMPLETO `if (tipo === 'pregunta') return R( ... )` editorial (líneas 91-102) por:

```tsx
  if (tipo === 'pregunta') return R(
    <div style={{width:S,height:S,background:CR,display:'flex',flexDirection:'column',justifyContent:'space-between',padding:90,fontFamily:'News'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <span style={{fontStyle:'italic',fontSize:22,color:INK}}>ia<span style={{color:AC}}>.</span>rest</span>
        <span style={{fontSize:14,color:I2,fontFamily:'Inter'}}>{GL} {sub||'Hostelería · 2026'}</span>
      </div>
      <div style={{fontStyle:'italic',fontSize:titulo.length>55?58:70,color:INK,lineHeight:1.15,letterSpacing:'-1px'}}>{titulo}</div>
      <div style={{display:'flex',alignItems:'center',gap:14}}>
        <div style={{width:48,height:3,background:AC}}/>
        <span style={{fontSize:18,color:AC,letterSpacing:'0.1em',textTransform:'uppercase',fontWeight:600,fontFamily:'Inter'}}>Léelo en el blog →</span>
      </div>
    </div>)
```

- [ ] **Step 5: tsc + lint**

Run: `npx tsc --noEmit && npx eslint src/app/api/ig-img/route.tsx`
Expected: sin errores.

- [ ] **Step 6: Verificación visual (render real)**

Levantar el dev server y renderizar 3 variantes de módulo. En una terminal:

Run: `npx next dev` (déjalo corriendo)

En otra terminal, generar PNGs y abrirlos:

```bash
curl -s "http://localhost:3000/api/ig-img?tipo=slide&num=2&total=4&titulo=Prueba&punto=El%20camarero%20habla&modulo=qr" -o /tmp/ig_qr.png
curl -s "http://localhost:3000/api/ig-img?tipo=stat&dato=45&unidad=min/dia&ctx=Texto&modulo=verifactu" -o /tmp/ig_vf.png
curl -s "http://localhost:3000/api/ig-img?tipo=pregunta&titulo=¿Cuanto%20pierdes?&modulo=almacen" -o /tmp/ig_alm.png
file /tmp/ig_qr.png /tmp/ig_vf.png /tmp/ig_alm.png
```

Expected: los 3 son `PNG image data, 1080 x 1080`. Revisar a ojo: el acento (regla/glifo/número) debe ser **verde** en qr, **ámbar** en verifactu, **tostado** en almacen. Si `next dev` no puede cargar las fuentes (red bloqueada a `www.iarest.es/fonts/`), documentarlo y verificar en el preview de Vercel tras el push.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/ig-img/route.tsx
git commit -m "feat(ig-img): acento de color/glifo por módulo en slide, stat y pregunta"
```

---

## Task 3: Lib de música (pool desde env)

**Files:**
- Create: `src/lib/instagram-music.ts`
- Smoke: `scripts/smoke-instagram-music.ts`
- Modify: `.env.example`

- [ ] **Step 1: Escribir la lib**

`src/lib/instagram-music.ts`:

```ts
// Pool de pistas royalty-free sembradas en Cloudinary (resource_type=video).
// Config por env: CLOUDINARY_MUSIC_IDS="iarest_music_1,iarest_music_2,iarest_music_3".
// Si está vacío, los reels salen sin audio (degradación elegante).
export function musicTracks(): string[] {
  return (process.env.CLOUDINARY_MUSIC_IDS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
}

export function pickMusicTrack(): string | null {
  const tracks = musicTracks()
  if (tracks.length === 0) return null
  return tracks[Math.floor(Math.random() * tracks.length)]
}
```

- [ ] **Step 2: Escribir el smoke-script**

`scripts/smoke-instagram-music.ts`:

```ts
import { musicTracks, pickMusicTrack } from '../src/lib/instagram-music'

let ok = true
const check = (cond: boolean, msg: string) => { if (!cond) ok = false; console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`) }

// Sin env → pool vacío y pick null
delete process.env.CLOUDINARY_MUSIC_IDS
check(musicTracks().length === 0, 'pool vacío sin env')
check(pickMusicTrack() === null, 'pick null sin env')

// Con env → trims y filtra vacíos; pick siempre dentro del pool
process.env.CLOUDINARY_MUSIC_IDS = ' a , b ,, c '
const t = musicTracks()
check(t.length === 3 && t[0] === 'a' && t[2] === 'c', 'trim + filtra vacíos (3 pistas)')
for (let i = 0; i < 20; i++) check(t.includes(pickMusicTrack() as string), `pick dentro del pool #${i}`)

if (!ok) { console.error('SMOKE MUSIC FALLÓ'); process.exit(1) }
console.log('SMOKE MUSIC OK')
```

- [ ] **Step 3: Ejecutar el smoke (debe pasar)**

Run: `npx tsx scripts/smoke-instagram-music.ts`
Expected: todas `PASS` y `SMOKE MUSIC OK`, exit 0.

- [ ] **Step 4: Documentar la env**

En `.env.example`, en la sección de Cloudinary, añadir la línea:

```bash
CLOUDINARY_MUSIC_IDS=                # public_ids de pistas royalty-free en Cloudinary, separadas por coma (vacío = reels sin audio)
```

- [ ] **Step 5: tsc limpio**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add src/lib/instagram-music.ts scripts/smoke-instagram-music.ts .env.example
git commit -m "feat(ig): pool de música por env + pickMusicTrack"
```

---

## Task 4: `buildReelUrl` con audio + motion, y `generarReel` con módulo

**Files:**
- Modify: `src/app/api/ig-reel/route.ts`
- Smoke: `scripts/smoke-reel-url.ts`

- [ ] **Step 1: Importar la música y propagar `modulo`/`audioPid`**

En `src/app/api/ig-reel/route.ts`, añadir el import tras la línea 3 (`import { NextRequest, NextResponse } from 'next/server'`):

```ts
import { pickMusicTrack } from '@/lib/instagram-music'
```

- [ ] **Step 2: Reescribir `buildReelUrl` (motion + audio)**

Reemplazar la función COMPLETA `buildReelUrl` (líneas 32-40) por:

```ts
// MP4 vertical: splice de cada slide (c_pad) sobre el vídeo base, con crossfade.
// Motion: zoom sutil por slide (e_zoompan) — best-effort, ver verificación.
// Audio: pista opcional superpuesta y recortada a la duración total.
function buildReelUrl(pids: string[], audioPid?: string | null): string {
  const parts: string[] = [`w_${W},h_${H},c_fill`]
  pids.forEach((p, i) => {
    const fade = i === 0 ? '' : `,e_fade:${FADE}`
    const motion = `,e_zoompan:from_(g_center;zoom_1.0);to_(g_center;zoom_1.08)`
    parts.push(`l_${p}/c_pad,w_${W},h_${H},b_rgb:14110E/fl_splice,du_${DUR}${motion}/so_${i * DUR},fl_layer_apply${fade}`)
  })
  if (audioPid) parts.push(`l_audio:${audioPid}/fl_layer_apply`)
  return `https://res.cloudinary.com/${CLOUD}/video/upload/${parts.join('/')}/q_auto/${BASE_VIDEO}.mp4`
}
```

- [ ] **Step 3: `generarReel` acepta `modulo` y `audioPid`, propaga `modulo` a los slides**

Reemplazar la función COMPLETA `generarReel` (líneas 42-61) por:

```ts
// Genera el Reel a partir de slides de /api/ig-img y devuelve la URL del MP4 listo para publicar.
export async function generarReel(opts: { titulo: string; estilo?: string; puntos: string[]; modulo?: string; audioPid?: string | null }): Promise<string> {
  const { titulo, estilo = 'editorial', puntos, modulo = '' } = opts
  const audioPid = opts.audioPid !== undefined ? opts.audioPid : pickMusicTrack()
  const total = puntos.length + 2
  const t = encodeURIComponent(titulo)
  const e = encodeURIComponent(estilo)
  const m = modulo ? `&modulo=${encodeURIComponent(modulo)}` : ''
  const slideUrls = [`${ORIGIN}/api/ig-img?tipo=slide&estilo=${e}&num=1&total=${total}&titulo=${t}${m}`]
  puntos.forEach((p, i) => slideUrls.push(`${ORIGIN}/api/ig-img?tipo=slide&estilo=${e}&num=${i + 2}&total=${total}&titulo=${t}&punto=${encodeURIComponent(p)}${m}`))
  slideUrls.push(`${ORIGIN}/api/ig-img?tipo=slide&estilo=${e}&num=${total}&total=${total}&titulo=${t}${m}`)

  const stamp = Date.now()
  const pids: string[] = []
  for (let i = 0; i < slideUrls.length; i++) {
    const r = await fetch(slideUrls[i])
    if (!r.ok) throw new Error(`Slide ${i + 1} no disponible (${r.status})`)
    const buf = Buffer.from(await r.arrayBuffer())
    pids.push(await uploadSlide(buf, `iarest_reel_${stamp}_${i + 1}`))
  }
  return buildReelUrl(pids, audioPid)
}
```

- [ ] **Step 4: Pasar `modulo` desde el handler GET (test manual)**

En la función `GET` (líneas 63-76), tras `const puntos = [...]` (línea 69), leer también `modulo`, y pasarlo a `generarReel`. Reemplazar el cuerpo del `try` (líneas 70-75) por:

```ts
  const modulo = sp.get('modulo') || ''
  try {
    const reelUrl = await generarReel({ titulo, estilo, puntos, modulo })
    return NextResponse.json({ ok: true, reelUrl })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
```

(`const modulo` debe ir DENTRO de la función GET, justo antes del `try`.)

- [ ] **Step 5: Smoke del armado de URL (sin red)**

Para testear `buildReelUrl` sin tocar Cloudinary, se exporta temporalmente no es necesario: se valida con un script que replica la firma esperada vía la propia función. Como `buildReelUrl` no se exporta, el smoke valida `generarReel` indirectamente comprobando la propagación de `modulo`/audio a nivel de URL string mediante una copia local del builder. Crear `scripts/smoke-reel-url.ts`:

```ts
// Réplica de la lógica de buildReelUrl para verificar el formato del string (no llama a Cloudinary).
const W = 1080, H = 1920, DUR = 3, FADE = 800
const CLOUD = 'demo', BASE_VIDEO = 'iarest_base_dark'
function buildReelUrl(pids: string[], audioPid?: string | null): string {
  const parts: string[] = [`w_${W},h_${H},c_fill`]
  pids.forEach((p, i) => {
    const fade = i === 0 ? '' : `,e_fade:${FADE}`
    const motion = `,e_zoompan:from_(g_center;zoom_1.0);to_(g_center;zoom_1.08)`
    parts.push(`l_${p}/c_pad,w_${W},h_${H},b_rgb:14110E/fl_splice,du_${DUR}${motion}/so_${i * DUR},fl_layer_apply${fade}`)
  })
  if (audioPid) parts.push(`l_audio:${audioPid}/fl_layer_apply`)
  return `https://res.cloudinary.com/${CLOUD}/video/upload/${parts.join('/')}/q_auto/${BASE_VIDEO}.mp4`
}

let ok = true
const check = (c: boolean, m: string) => { if (!c) ok = false; console.log(`${c ? 'PASS' : 'FAIL'} ${m}`) }

const conAudio = buildReelUrl(['s1', 's2'], 'iarest_music_1')
check(conAudio.includes('l_audio:iarest_music_1/fl_layer_apply'), 'incluye capa de audio')
check(conAudio.includes('e_zoompan'), 'incluye motion zoompan')
check(conAudio.split('e_fade').length === 2, 'crossfade solo a partir del 2º slide')

const sinAudio = buildReelUrl(['s1', 's2'], null)
check(!sinAudio.includes('l_audio'), 'sin audio cuando audioPid=null')

if (!ok) { console.error('SMOKE REEL-URL FALLÓ'); process.exit(1) }
console.log('SMOKE REEL-URL OK')
```

- [ ] **Step 6: Ejecutar smoke + tsc**

Run: `npx tsx scripts/smoke-reel-url.ts && npx tsc --noEmit`
Expected: todas `PASS`, `SMOKE REEL-URL OK`, y tsc sin errores.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/ig-reel/route.ts scripts/smoke-reel-url.ts
git commit -m "feat(ig-reel): audio + motion en buildReelUrl y módulo en generarReel"
```

> ⚠️ La verificación REAL de que el MP4 renderiza con motion y audio es empírica (Cloudinary) y se hace en la Task 6. Si Cloudinary rechaza `e_zoompan` sobre capa spliced, revertir SOLO la parte `${motion}` (dejar `du_${DUR}`) y mantener audio+crossfade; documentarlo en el commit.

---

## Task 5: Rama de formato en el cron (viernes → reel, con fallback)

**Files:**
- Modify: `src/app/api/cron/instagram/route.ts`

- [ ] **Step 1: Imports y helper de formato**

En `src/app/api/cron/instagram/route.ts`, añadir tras la línea 7 (último import):

```ts
import { generarReel } from '@/app/api/ig-reel/route'
import { pickMusicTrack } from '@/lib/instagram-music'
```

Tras la definición de `POR_TONO` (línea 35), añadir el helper y el generador de contenido de reel:

```ts
// Formato del día: viernes (getUTCDay()===5) → reel; resto → imagen.
function formatoDelDia(d: Date = new Date()): 'reel' | 'imagen' {
  return d.getUTCDay() === 5 ? 'reel' : 'imagen'
}

async function generarReelContenido(tema: string, hashtags: string[]) {
  const prompt = `Eres el agente de Instagram de ia.rest (siempre "ia.rest", nunca "IA Rest").
PRODUCTO: TPV por voz para hostelería española. El camarero habla → la cocina recibe en <0,5s.
TONO: directo, sin palabrería, como un hostelero experimentado. PROHIBIDO nombrar competidores ni ciudades EN EL ARTE.
Crea un REEL de 3 slides sobre: "${tema}".
- titulo: portada, gancho corto (máx 55 chars).
- p1, p2, p3: tres ideas concretas que avanzan el argumento (máx 70 chars cada una).
- caption: 120-160 palabras. Primera línea = gancho sin emoji. Lenguaje natural de búsqueda (ej "TPV por voz", "reducir errores de comanda"). Cierra con www.iarest.es y EXACTAMENTE 4-5 hashtags (base #hosteleria #restaurante + ${hashtags.slice(0,3).join(' ')}).
SOLO JSON: {"titulo":"","p1":"","p2":"","p3":"","caption":""}`
  const raw = await callAI('Reel Instagram. SOLO JSON.', prompt, 600)
  return JSON.parse(cleanJSON(raw)) as { titulo: string; p1: string; p2: string; p3: string; caption: string }
}
```

- [ ] **Step 2: Insertar la rama reel en el `try` del handler**

En `GET`, dentro del `try` (líneas 132-155), tras obtener `const { tema, modulo, hashtags } = await elegirTemaConContexto(...)` (línea 136) y `const estilo = await estiloDeLaSemana(supabase)` — mover `estilo` arriba y añadir la rama. Reemplazar el bloque que va desde `const post = await generarPost(...)` (línea 137) hasta el `return NextResponse.json({ ok: true, plantilla, ... })` (línea 155) por:

```ts
    const estilo = await estiloDeLaSemana(supabase)
    const formato = tipoForzado ? 'imagen' : (req.nextUrl.searchParams.get('formato') as 'reel'|'imagen'|null) || formatoDelDia()

    // ── Rama REEL (viernes o ?formato=reel) con fallback a imagen ──────
    if (formato === 'reel') {
      try {
        const reel = await generarReelContenido(tema, hashtags)
        const puntos = [reel.p1, reel.p2, reel.p3].filter(Boolean)
        const audioPid = pickMusicTrack()
        const reelUrl = await generarReel({ titulo: reel.titulo, estilo, puntos, modulo, audioPid })
        const { data: bReel } = await supabase.from('instagram_borradores').insert({
          plantilla: 'reel', titulo: reel.titulo, caption: reel.caption, image_url: reelUrl,
          tema_elegido: tema, modulo_relacionado: modulo,
        }).select('id').single()
        if (bReel?.id) {
          await tgAlertButtons(
            `🎬 <b>Nuevo Reel listo</b>\n\n🎞️ <code>reel</code> · ${modulo||'—'}${audioPid?' · 🎵':' · 🔇'}\n\n<b>${reel.titulo?.slice(0,70)}</b>\n\n<i>${reel.caption?.slice(0,150)}...</i>`,
            'info',
            [[{ texto:'✅ Publicar', callback:`ig_aprobar:${bReel.id}` },{ texto:'🗑️ Descartar', callback:`ig_descartar:${bReel.id}` }],[{ texto:'✏️ Editar en /super', callback:`ig_editar:${bReel.id}` }]]
          )
        }
        return NextResponse.json({ ok: true, formato: 'reel', borradorId: bReel?.id, tema })
      } catch (reelErr: any) {
        await tgAlertButtons(`⚠️ <b>Reel falló, genero imagen</b>\n\n<code>${(reelErr?.message||'error').slice(0,150)}</code>`, 'aviso', [])
        // sigue al flujo de imagen abajo
      }
    }

    // ── Flujo IMAGEN (lunes, fallback de reel, o ?formato=imagen) ──────
    const post = await generarPost(plantilla, tema, hashtags)
    const imageUrl = buildUrl({ tipo: plantilla, estilo, titulo: post.titulo, sub: post.sub, dato: post.dato, unidad: post.unidad, ctx: post.ctx, items: post.items, modulo })

    const { data: borrador } = await supabase.from('instagram_borradores').insert({
      plantilla, titulo: post.titulo, sub: post.sub, dato: post.dato, unidad: post.unidad,
      ctx: post.ctx, items: post.items, caption: post.caption, image_url: imageUrl,
      tema_elegido: tema, modulo_relacionado: modulo,
    }).select('id').single()

    if (borrador?.id) {
      const tonoEmoji = TONO[plantilla]==='claro'?'⬜':TONO[plantilla]==='rojo'?'🟥':'⬛'
      await tgAlertButtons(
        `📸 <b>Nuevo post Instagram listo</b>\n\n${tonoEmoji} <code>${plantilla}</code> · ${modulo||'—'}\n\n<b>${post.titulo?.slice(0,70)}</b>\n\n<i>${post.caption?.slice(0,150)}...</i>`,
        'info',
        [[{ texto:'✅ Publicar', callback:`ig_aprobar:${borrador.id}` },{ texto:'🗑️ Descartar', callback:`ig_descartar:${borrador.id}` }],[{ texto:'✏️ Editar en /super', callback:`ig_editar:${borrador.id}` }]]
      )
    }
    return NextResponse.json({ ok: true, formato: 'imagen', plantilla, borradorId: borrador?.id, tema })
```

> Nota: `buildUrl` ahora recibe `modulo` para que la imagen también lleve acento de módulo. `buildUrl` ya ignora valores vacíos (línea 86), así que no rompe nada.

- [ ] **Step 3: Verificar que `maxDuration` cubre el reel**

El reel sube N slides a Cloudinary (secuencial). En `src/app/api/cron/instagram/route.ts` línea 2, subir el límite de 60 a 120 s para tener margen:

```ts
export const maxDuration = 120
```

- [ ] **Step 4: tsc + lint**

Run: `npx tsc --noEmit && npx eslint src/app/api/cron/instagram/route.ts`
Expected: sin errores. (Confirma que `publicarReel` ya existe en `lib/instagram.ts` para el callback de aprobación — no se toca aquí.)

- [ ] **Step 5: Commit**

```bash
git add src/app/api/cron/instagram/route.ts
git commit -m "feat(cron-ig): viernes genera reel auto (música+módulo) con fallback a imagen"
```

---

## Task 6: Verificación end-to-end + build

**Files:** ninguno nuevo (verificación + posible fix).

- [ ] **Step 1: Confirmar que el callback de aprobación publica reels**

Leer `src/app/api/telegram/instagram-callback/route.ts` y confirmar que `ig_aprobar` distingue `plantilla==='reel'` para llamar a `publicarReel(image_url, caption)` en vez de `publicarEnInstagram`. Si NO lo distingue, añadir la rama (mostrar el cambio exacto en el commit). Verificar la firma: `publicarReel(videoUrl, caption)` en `src/lib/instagram.ts:85`.

- [ ] **Step 2: Render real de un reel (manual)**

Con `CLOUDINARY_*` en `.env.local` (`vercel env pull .env.local`) y `next dev` corriendo:

```bash
curl -s "http://localhost:3000/api/ig-reel?titulo=Comanda%20por%20voz&p1=El%20camarero%20habla&p2=La%20cocina%20recibe&p3=Cero%20errores&modulo=qr" -H "x-story-secret: $CRON_SECRET"
```

Expected: JSON `{ ok: true, reelUrl: "https://res.cloudinary.com/.../iarest_base_dark.mp4" }`. Abrir `reelUrl` en el navegador: debe reproducir un MP4 vertical con los slides en **verde** (módulo qr), transiciones y —si `CLOUDINARY_MUSIC_IDS` está poblado— audio. Si la URL da error de Cloudinary por `e_zoompan`, aplicar el fallback documentado en Task 4 Step 7.

- [ ] **Step 3: Build de producción (regla del proyecto)**

Run: `npx next build`
Expected: build OK (reproduce el build de Vercel; `tsc` solo no basta). Si falla, arreglar antes de seguir.

- [ ] **Step 4: Smoke de los 3 scripts juntos**

Run: `npx tsx scripts/smoke-instagram-theme.ts && npx tsx scripts/smoke-instagram-music.ts && npx tsx scripts/smoke-reel-url.ts`
Expected: los 3 `... OK`.

- [ ] **Step 5: Actualizar memoria de sesiones**

Añadir entrada arriba en `docs/CONTEXTO-SESIONES.md` (Registro de sesiones) resumiendo: theming por módulo en `ig-img`, reels automáticos los viernes con música/motion y fallback a imagen, env nueva `CLOUDINARY_MUSIC_IDS`, pendiente sembrar pistas en Cloudinary. Refrescar "Pendientes".

- [ ] **Step 6: Commit final**

```bash
git add docs/CONTEXTO-SESIONES.md
git commit -m "docs: registro de sesión — Instagram reels auto + theming por módulo"
```

- [ ] **Step 7: Push + PR draft**

```bash
git push -u origin claude/elegant-dirac-DJLHF
```

Crear PR **draft** (vía MCP de GitHub) hacia `main` con resumen de las dos features y la nota de que falta sembrar `CLOUDINARY_MUSIC_IDS` para que los reels lleven audio.

---

## Dependencias externas (post-merge)

- **Sembrar música:** subir 3–5 pistas royalty-free de uso comercial a Cloudinary (public_ids `iarest_music_1..N`) y poner `CLOUDINARY_MUSIC_IDS` en Vercel env. Hasta entonces los reels salen mudos (no fallan).
- **Verificar `iarest_base_dark`:** el reel depende del vídeo base ya subido; su duración condiciona la longitud final del MP4.

## Self-review (cobertura del spec)

- Plantillas más llamativas (acento/glifo por módulo) → Task 1 + Task 2. ✅
- Slides del reel heredan theming → Task 4 propaga `modulo` a `?tipo=slide`. ✅
- Reels automáticos (viernes) con flujo Telegram → Task 5. ✅
- Motion → Task 4 (con gate de verificación real en Task 6). ✅
- Música royalty-free auto + fallback silencioso → Task 3 + Task 4 + Task 5. ✅
- Fallback a imagen si el reel falla → Task 5 Step 2. ✅
- Verificación `tsc`/`next build`/render → Task 6. ✅
- Fuera de alcance (IA generativa, voice-over, carrusel) → no hay tareas, correcto. ✅
