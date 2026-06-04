// Smoke de la lógica pura del reel (sin red): pools de música/ambiente + forma de la URL.
import { musicTracks, pickMusicTrack } from '../src/lib/instagram-music'
import { ambientClips, pickAmbient } from '../src/lib/instagram-reel-assets'

let ok = true
const check = (c: boolean, m: string) => { if (!c) ok = false; console.log(`${c ? 'PASS' : 'FAIL'} ${m}`) }

// ── Música ──────────────────────────────────────────────────────────────
delete process.env.CLOUDINARY_MUSIC_IDS
check(musicTracks().length === 0, 'música: pool vacío sin env')
check(pickMusicTrack() === null, 'música: pick null sin env')
process.env.CLOUDINARY_MUSIC_IDS = ' a , b ,, c '
const mt = musicTracks()
check(mt.length === 3 && mt[0] === 'a' && mt[2] === 'c', 'música: trim + filtra vacíos (3)')
for (let i = 0; i < 20; i++) check(mt.includes(pickMusicTrack() as string), `música: pick dentro del pool #${i}`)

// ── Ambiente ────────────────────────────────────────────────────────────
delete process.env.CLOUDINARY_AMBIENT_IDS
check(ambientClips().length === 0, 'ambiente: pool vacío sin env')
check(pickAmbient(2).length === 0, 'ambiente: pick [] sin env (degradación)')
process.env.CLOUDINARY_AMBIENT_IDS = 'iarest_amb_1, iarest_amb_2 ,iarest_amb_3'
check(ambientClips().length === 3, 'ambiente: 3 clips con env')
const two = pickAmbient(2)
check(two.length === 2 && new Set(two).size === 2, 'ambiente: pickAmbient(2) → 2 distintos')
check(pickAmbient(9).length === 3, 'ambiente: pide más de los que hay → todos')
for (let i = 0; i < 20; i++) pickAmbient(2).forEach(c => check(ambientClips().includes(c), `ambiente: pick válido #${i}`))

// ── Forma de la URL (réplica de buildReelUrl; no llama a Cloudinary) ──────
const W = 1080, H = 1920, DUR = 3, FADE = 800, CLOUD = 'demo', BASE = 'iarest_base_dark'
type Seg = { kind: 'image' | 'video'; pid: string }
function buildReelUrl(segs: Seg[], audioPid?: string | null): string {
  const parts: string[] = [`w_${W},h_${H},c_fill`]
  segs.forEach((s, i) => {
    const off = i * DUR
    const fade = i === 0 ? '' : `,e_fade:${FADE}`
    if (s.kind === 'video') parts.push(`l_video:${s.pid}/c_fill,w_${W},h_${H},g_auto,e_volume:mute/fl_splice,du_${DUR}/so_${off},fl_layer_apply${fade}`)
    else parts.push(`l_${s.pid}/c_pad,w_${W},h_${H},b_rgb:14110E/fl_splice,du_${DUR},e_zoompan:from_(g_center;zoom_1.0);to_(g_center;zoom_1.08)/so_${off},fl_layer_apply${fade}`)
  })
  if (audioPid) parts.push(`l_audio:${audioPid}/du_${segs.length * DUR},e_volume:65/fl_layer_apply`)
  return `https://res.cloudinary.com/${CLOUD}/video/upload/${parts.join('/')}/q_auto/${BASE}.mp4`
}

const segs: Seg[] = [
  { kind: 'image', pid: 'portada' },
  { kind: 'image', pid: 'producto' },
  { kind: 'video', pid: 'iarest_amb_1' },
  { kind: 'image', pid: 'p1' },
]
const url = buildReelUrl(segs, 'iarest_music_1')
check(url.includes('l_video:iarest_amb_1'), 'url: capa de vídeo de ambiente')
check(url.includes('e_volume:mute'), 'url: ambiente silenciado (no pelea con música)')
check(url.includes('l_audio:iarest_music_1/du_12'), 'url: audio recortado a la duración total (12s)')
check(url.includes('e_zoompan'), 'url: Ken Burns en slides de imagen')
check(url.split('e_fade').length === segs.length, 'url: crossfade solo a partir del 2º segmento')
check(!buildReelUrl(segs, null).includes('l_audio'), 'url: sin audio cuando audioPid=null (reel mudo)')
check(buildReelUrl([{ kind: 'image', pid: 'a' }]).includes('so_0,fl_layer_apply'), 'url: primer segmento en offset 0 sin fade')

if (!ok) { console.error('SMOKE REEL FALLÓ'); process.exit(1) }
console.log('SMOKE REEL OK')
