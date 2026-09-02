import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAdmin } from '@/lib/superadmin'
import { resumenIA } from '@/lib/ai-gateway'
import { getSaludAgentesCompleta, getLatidosFueraDelCatalogo, type EstadoSalud, type SaludAgente, type SaludLatido } from '@/lib/agentes-salud'
import { FAMILIAS, type AgenteInfo, type EntregaAgente } from '@/lib/agentes-catalogo'
// Reutilizamos el inventario de asistentes/funciones IA que ya mantiene el mapa de estructura
// (/operador/estructura). NO se duplica: es la MISMA lista, vista aquí junto a los autónomos.
import { AGENTES as ASISTENTES_IA } from '@/lib/estructura'

export const dynamic = 'force-dynamic'

type Vista = 'todos' | 'autonomos' | 'asistentes'

const card: React.CSSProperties = { background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, padding: 16 }
const th: React.CSSProperties = { textAlign: 'left', color: 'var(--muted)', fontWeight: 600, fontSize: 12, padding: '6px 8px', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '6px 8px', fontSize: 13, borderTop: '1px solid var(--line)', verticalAlign: 'top' }
const scroll: React.CSSProperties = { overflowX: 'auto' }

const SEMA: Record<EstadoSalud, { punto: string; label: string }> = {
  verde: { punto: '🟢', label: 'al día' },
  ambar: { punto: '🟡', label: 'con retraso' },
  rojo: { punto: '🔴', label: 'parado' },
  gris: { punto: '⚪', label: 'sin telemetría' },
}

const ENTREGA_LABEL: Record<EntregaAgente, string> = {
  'pr-draft': 'PR draft',
  'auto-main': 'auto a main',
  'accion-directa': 'acción directa',
  'lectura': 'solo lectura',
  'mixto': 'mixto',
}

// Ámbito coarse (primer token de `ambito`) para agrupar los asistentes por vertical.
const ORDEN_AMBITO = ['transversal', 'ia-rest', 'ialimp', 'sivra']
const ambitoBase = (a: string) => a.split('·')[0].trim()

export default async function OperadorAgentesPage({
  searchParams,
}: {
  searchParams: Promise<{ ver?: string }>
}) {
  let admin: Awaited<ReturnType<typeof getAdmin>> = null
  try { admin = await getAdmin() } catch { admin = null }
  if (!admin) redirect('/dashboard')

  const sp = await searchParams.catch(() => ({} as { ver?: string }))
  const ver: Vista = sp?.ver === 'autonomos' || sp?.ver === 'asistentes' ? sp.ver : 'todos'

  const [salud, r, sueltos] = await Promise.all([
    getSaludAgentesCompleta().catch(() => ({} as Record<string, SaludAgente>)),
    resumenIA().catch(() => null),
    getLatidosFueraDelCatalogo().catch(() => [] as SaludLatido[]),
  ])

  const nAutonomos = FAMILIAS.reduce((n, f) => n + f.agentes.length, 0)
  const nAsistentes = ASISTENTES_IA.length

  // Asistentes agrupados por vertical (orden fijo; lo no listado, al final).
  const porVertical = new Map<string, typeof ASISTENTES_IA>()
  for (const a of ASISTENTES_IA) {
    const k = ambitoBase(a.ambito)
    if (!porVertical.has(k)) porVertical.set(k, [])
    porVertical.get(k)!.push(a)
  }
  const gruposAsistentes = [...porVertical.entries()].sort(
    (x, y) => (ORDEN_AMBITO.indexOf(x[0]) + 1 || 99) - (ORDEN_AMBITO.indexOf(y[0]) + 1 || 99),
  )

  function Fila({ a }: { a: AgenteInfo }) {
    const s = salud[a.id]
    const sema = SEMA[s?.estado ?? 'gris']
    const esDirector = a.id === 'ia-director'
    return (
      <tr>
        <td style={{ ...td, whiteSpace: 'nowrap' }} title={sema.label + (s?.detalle ? ` · ${s.detalle}` : '')}>
          {sema.punto} {s?.detalle ?? sema.label}
        </td>
        <td style={{ ...td, fontWeight: 600, whiteSpace: 'nowrap' }}>
          {esDirector ? <Link href="/operador/ia" style={{ color: 'var(--primary)' }}>{a.nombre} ↗</Link> : a.nombre}
          {esDirector && r && <div style={{ fontWeight: 400, color: 'var(--muted)', fontSize: 11 }}>modo {r.director.modo}</div>}
        </td>
        <td style={td}>{a.funcion}</td>
        <td style={{ ...td, whiteSpace: 'nowrap' }}>{a.cadencia}</td>
        <td style={{ ...td, whiteSpace: 'nowrap' }}>{ENTREGA_LABEL[a.entrega]}{a.telegram ? ' · 📨' : ''}</td>
        <td style={{ ...td, whiteSpace: 'nowrap' }}>{a.vertical}</td>
        <td style={{ ...td, color: 'var(--muted)', fontSize: 12 }}><code>{a.archivo}</code></td>
      </tr>
    )
  }

  const pill = (v: Vista, label: string): React.CSSProperties => ({
    padding: '6px 12px', borderRadius: 999, fontSize: 13, fontWeight: 600, textDecoration: 'none',
    border: '1px solid var(--line)',
    background: ver === v ? 'var(--primary)' : 'var(--card)',
    color: ver === v ? '#fff' : 'var(--text)',
  })

  return (
    <main style={{ padding: 24, maxWidth: 1080 }}>
      <h1 style={{ fontSize: 24 }}>Agentes</h1>
      <p style={{ color: 'var(--muted)', marginTop: 4 }}>
        Mapa vivo de la IA del monorepo: <strong>{nAutonomos} autónomos</strong> (se ejecutan solos: rutinas Claude por
        trigger, el Agente Director y los crons agénticos) y <strong>{nAsistentes} asistentes IA</strong> (funciones que
        responden a una persona: copilotos, voz, visión, OCR, chats por pantalla). El semáforo de salud solo aplica a los
        autónomos (⚪ = sin rastro en BD); los asistentes son <em>bajo demanda</em>.
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
        <Link href="/operador/agentes" style={pill('todos', 'Todos')}>Todos ({nAutonomos + nAsistentes})</Link>
        <Link href="/operador/agentes?ver=autonomos" style={pill('autonomos', 'Autónomos')}>Autónomos ({nAutonomos})</Link>
        <Link href="/operador/agentes?ver=asistentes" style={pill('asistentes', 'Asistentes')}>Asistentes IA ({nAsistentes})</Link>
      </div>

      {ver !== 'asistentes' && FAMILIAS.map(f => (
        <section key={f.tipo} style={{ ...card, marginTop: 16 }}>
          <h2 style={{ fontSize: 15, marginBottom: 8 }}>{f.titulo} <span style={{ color: 'var(--muted)', fontWeight: 400 }}>({f.agentes.length})</span></h2>
          <div style={scroll}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
              <thead>
                <tr>
                  <th style={th}>Salud</th><th style={th}>Agente</th><th style={th}>Función</th>
                  <th style={th}>Cadencia</th><th style={th}>Entrega</th><th style={th}>Vertical</th><th style={th}>Archivo</th>
                </tr>
              </thead>
              <tbody>{f.agentes.map(a => <Fila key={a.id} a={a} />)}</tbody>
            </table>
          </div>
        </section>
      ))}


      {ver !== 'asistentes' && sueltos.length > 0 && (
        <section style={{ ...card, marginTop: 16 }}>
          <h2 style={{ fontSize: 15, marginBottom: 2 }}>
            🫀 Vigilados por latido <span style={{ color: 'var(--muted)', fontWeight: 400 }}>({sueltos.length})</span>
          </h2>
          {/* Estos NO estaban en ninguna pantalla. Tienen umbral y sonda en AGENTES_VIGILADOS y el
              vigía los evalúa cada mañana, pero no tienen ficha en el catálogo de arriba, así que
              su estado solo existía en un Telegram — y en 8 rutinas ese canal no está cableado. */}
          <p style={{ color: 'var(--muted)', fontSize: 12, margin: '0 0 10px' }}>
            Crons con umbral declarado que el vigía comprueba a diario y que no tienen ficha arriba.
            Un ⚪ aquí significa que el propio vigía no ha pasado, no que el agente esté bien.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 10 }}>
            {sueltos.map(l => {
              const sema = SEMA[l.estado]
              return (
                <div key={l.etiqueta} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px' }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>{sema.punto} {l.etiqueta}</div>
                  <div style={{ color: 'var(--muted)', fontSize: 12.5, marginTop: 3 }}>{l.detalle}</div>
                  {l.estado !== 'verde' && l.nota && (
                    <div style={{ fontSize: 11.5, marginTop: 6 }}>{l.nota}</div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}
      {ver !== 'autonomos' && (
        <section style={{ ...card, marginTop: 16 }}>
          <h2 style={{ fontSize: 15, marginBottom: 2 }}>
            🗣️ Asistentes y funciones IA <span style={{ color: 'var(--muted)', fontWeight: 400 }}>({nAsistentes})</span>
          </h2>
          <p style={{ color: 'var(--muted)', fontSize: 12, margin: '0 0 10px' }}>
            Bajo demanda (reaccionan a una persona, no a un reloj) — mismo inventario que el mapa de{' '}
            <Link href="/operador/estructura" style={{ color: 'var(--primary)' }}>Estructura</Link>. Algunas capacidades
            (p. ej. concursos) también aparecen arriba como autónomos por su cron; aquí se ven por su faceta de IA.
          </p>
          {gruposAsistentes.map(([amb, lista]) => (
            <div key={amb} style={{ marginTop: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 6 }}>
                {amb} <span style={{ fontWeight: 400 }}>({lista.length})</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
                {lista.map(a => (
                  <div key={a.nombre} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px' }}>
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>{a.nombre}</div>
                    <div style={{ color: 'var(--muted)', fontSize: 12.5, marginTop: 3 }}>{a.desc}</div>
                    <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 6 }}><code>{a.ambito}</code></div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 16 }}>
        Fuentes de verdad: autónomos en <code>lib/agentes-catalogo.ts</code> + <code>docs/AGENTES-MAPA.md</code>;
        asistentes IA en <code>lib/estructura.ts</code> (los mantiene <code>/auditoria-diaria</code>). Los triggers de las
        rutinas Claude se crean en <code>claude.ai/code → Rutinas</code>; los crons viven en los <code>vercel.json</code>.
      </p>
    </main>
  )
}
