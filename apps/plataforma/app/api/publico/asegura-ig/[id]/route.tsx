// Imagen 1080×1080 de un borrador de Instagram de Grupo ASegura (04/11/2026).
//
// Pública a propósito (`/api/publico` en el middleware): la tiene que poder descargar la Graph API
// de Instagram y abrirla Alberto desde Telegram. NO pinta texto arbitrario de la URL —solo el del
// borrador guardado, que ya pasó el cepo de copy— y solo en estados que han pasado ese cepo: un
// `rechazado_copy` o un `descartado` da 404. El id es un UUID aleatorio: no sirve de índice.
//
// Marca: cobalto y neutros de `MARCA_ASEGURA` (@central/brand, convertidos a sRGB porque el
// renderizador no entiende oklch), Quicksand 700 en titulares y Nunito Sans en cuerpo, sin cursivas.
// Sin las fuentes de marca NO se pinta (503): una imagen con la tipografía equivocada no se publica.
import { ImageResponse } from 'next/og'
import { MARCA_ASEGURA } from '@central/brand'
import { MEDIADOR } from '@central/module-seguros'
import { aHexSrgb, type PlantillaIg } from '@/lib/correduria/instagram-asegura'
import { leerIgParaImagen, esSinMigracion } from '@/lib/correduria/instagram-asegura-db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const LADO = 1080
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const P = MARCA_ASEGURA.paleta
const C = {
  cobalto: aHexSrgb(P.primario),
  tinta: aHexSrgb(P.primarioInk),
  suave: aHexSrgb(P.primarioSuave),
  blanco: aHexSrgb(P.panel),
  texto: aHexSrgb(P.texto),
  tenue: aHexSrgb(P.textoTenue),
}

// ─── Fuentes de marca (TTF de Google Fonts: satori no lee woff2) ─────────────
type Fuente = { name: string; data: ArrayBuffer; weight: 400 | 600 | 700; style: 'normal' }
let fuentes: Promise<Fuente[]> | null = null

async function ttf(familia: string, peso: number): Promise<ArrayBuffer> {
  const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${familia}:wght@${peso}`, { cache: 'force-cache' })).text()
  const url = /src:\s*url\(([^)]+)\)\s*format\('(?:truetype|opentype)'\)/.exec(css)?.[1]
  if (!url) throw new Error(`sin TTF para ${familia} ${peso}`)
  const r = await fetch(url, { cache: 'force-cache' })
  if (!r.ok) throw new Error(`fuente ${familia} ${peso}: HTTP ${r.status}`)
  return r.arrayBuffer()
}

function cargarFuentes(): Promise<Fuente[]> {
  if (!fuentes) {
    fuentes = Promise.all([ttf('Quicksand', 700), ttf('Nunito+Sans', 400), ttf('Nunito+Sans', 700)])
      .then(([q7, n4, n7]) => [
        { name: 'Quicksand', data: q7, weight: 700, style: 'normal' },
        { name: 'Nunito Sans', data: n4, weight: 400, style: 'normal' },
        { name: 'Nunito Sans', data: n7, weight: 700, style: 'normal' },
      ] satisfies Fuente[])
      .catch((e) => { fuentes = null; throw e })
  }
  return fuentes
}

// ─── Piezas ─────────────────────────────────────────────────────────────────

function Pie({ claro }: { claro: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
      <span style={{ fontFamily: 'Quicksand', fontWeight: 700, fontSize: 40, color: claro ? C.blanco : C.cobalto }}>{MEDIADOR.marca}</span>
      <span style={{ fontFamily: 'Nunito Sans', fontSize: 22, color: claro ? C.suave : C.tenue }}>
        {`Corredor de seguros · DGSFP ${MEDIADOR.identidad.claveDgsfp}`}
      </span>
    </div>
  )
}

function Etiqueta({ texto, claro }: { texto: string; claro: boolean }) {
  return (
    <div style={{ display: 'flex' }}>
      <span style={{
        fontFamily: 'Nunito Sans', fontWeight: 700, fontSize: 24, letterSpacing: 2, textTransform: 'uppercase',
        color: claro ? C.cobalto : C.blanco, background: claro ? C.suave : C.cobalto, padding: '10px 22px', borderRadius: 999,
      }}>{texto}</span>
    </div>
  )
}

function pintar(p: { plantilla: PlantillaIg; titulo: string; sub: string; puntos: string[] }) {
  const base = { width: LADO, height: LADO, display: 'flex', flexDirection: 'column' as const, justifyContent: 'space-between' as const, padding: 90 }
  const tam = (t: string, grande: number, chico: number) => (t.length > 60 ? chico : grande)

  if (p.plantilla === 'pregunta') {
    return (
      <div style={{ ...base, background: C.cobalto }}>
        <Etiqueta texto={p.sub || 'Seguros, claro'} claro />
        <div style={{ display: 'flex', fontFamily: 'Quicksand', fontWeight: 700, fontSize: tam(p.titulo, 84, 68), lineHeight: 1.15, color: C.blanco }}>{p.titulo}</div>
        <Pie claro />
      </div>
    )
  }

  if (p.plantilla === 'mito') {
    return (
      <div style={{ ...base, background: C.suave }}>
        <Etiqueta texto={p.sub || 'Lo que se dice'} claro={false} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          <span style={{ fontFamily: 'Nunito Sans', fontWeight: 700, fontSize: 26, letterSpacing: 2, color: C.tenue }}>LO QUE SE DICE</span>
          <div style={{ display: 'flex', fontFamily: 'Quicksand', fontWeight: 700, fontSize: tam(p.titulo, 64, 54), lineHeight: 1.2, color: C.texto }}>{p.titulo}</div>
          <div style={{ width: 120, height: 8, background: C.cobalto, borderRadius: 4 }} />
          <span style={{ fontFamily: 'Nunito Sans', fontWeight: 700, fontSize: 26, letterSpacing: 2, color: C.cobalto }}>LO QUE PASA DE VERDAD</span>
          <div style={{ display: 'flex', fontFamily: 'Nunito Sans', fontSize: 40, lineHeight: 1.35, color: C.tinta }}>{p.puntos[0] ?? ''}</div>
        </div>
        <Pie claro={false} />
      </div>
    )
  }

  // claves
  return (
    <div style={{ ...base, background: C.blanco }}>
      <Etiqueta texto={p.sub || 'Tres claves'} claro={false} />
      <div style={{ display: 'flex', fontFamily: 'Quicksand', fontWeight: 700, fontSize: tam(p.titulo, 64, 54), lineHeight: 1.15, color: C.tinta }}>{p.titulo}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
        {p.puntos.slice(0, 3).map((x, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 26 }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', width: 64, height: 64, flexShrink: 0,
              borderRadius: 32, background: C.cobalto, color: C.blanco, fontFamily: 'Quicksand', fontWeight: 700, fontSize: 34,
            }}>{i + 1}</div>
            <div style={{ display: 'flex', fontFamily: 'Nunito Sans', fontSize: 34, lineHeight: 1.35, color: C.texto, marginTop: 8 }}>{x}</div>
          </div>
        ))}
      </div>
      <Pie claro={false} />
    </div>
  )
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!RE_UUID.test(id)) return new Response('No encontrado', { status: 404 })

  let fila
  try {
    fila = await leerIgParaImagen(id)
  } catch (e) {
    return new Response(esSinMigracion(e) ? 'Sin migración' : 'Error de lectura', { status: 503 })
  }
  if (!fila) return new Response('No encontrado', { status: 404 })

  let fonts: Fuente[]
  try {
    fonts = await cargarFuentes()
  } catch {
    return new Response('Fuentes de marca no disponibles', { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }

  const puntos = Array.isArray(fila.puntos) ? fila.puntos.filter((x): x is string => typeof x === 'string') : []
  return new ImageResponse(pintar({ plantilla: fila.plantilla, titulo: fila.titulo, sub: fila.sub, puntos }), {
    width: LADO,
    height: LADO,
    fonts,
    headers: { 'Cache-Control': 'no-store' },
  })
}
