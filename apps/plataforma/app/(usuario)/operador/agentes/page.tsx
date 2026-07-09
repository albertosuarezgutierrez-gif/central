import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAdmin } from '@/lib/superadmin'
import { resumenIA } from '@/lib/ai-gateway'
import { getSaludAgentes, type EstadoSalud, type SaludAgente } from '@/lib/agentes-salud'
import { FAMILIAS, type AgenteInfo, type EntregaAgente } from '@/lib/agentes-catalogo'

export const dynamic = 'force-dynamic'

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

export default async function OperadorAgentesPage() {
  let admin: Awaited<ReturnType<typeof getAdmin>> = null
  try { admin = await getAdmin() } catch { admin = null }
  if (!admin) redirect('/dashboard')

  const [salud, r] = await Promise.all([
    getSaludAgentes().catch(() => ({} as Record<string, SaludAgente>)),
    resumenIA().catch(() => null),
  ])

  const total = FAMILIAS.reduce((n, f) => n + f.agentes.length, 0)

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

  return (
    <main style={{ padding: 24, maxWidth: 1080 }}>
      <h1 style={{ fontSize: 24 }}>Agentes</h1>
      <p style={{ color: 'var(--muted)', marginTop: 4 }}>
        Mapa vivo de los <strong>{total}</strong> agentes del monorepo, en tres familias: rutinas Claude Code por
        trigger, el Agente Director de la pasarela de IA, y los crons agénticos de Vercel. El semáforo mide la
        última actividad en BD frente a su cadencia esperada (⚪ = agente sin rastro en BD).
      </p>

      {FAMILIAS.map(f => (
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

      <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 16 }}>
        Fuente de verdad: <code>lib/agentes-catalogo.ts</code> + <code>docs/AGENTES-MAPA.md</code>. Los triggers de las
        rutinas Claude se crean a mano en <code>claude.ai/code → Rutinas</code>; los crons viven en los{' '}
        <code>vercel.json</code> de cada app. La frescura factual la reconcilia <code>/auditoria-diaria</code>.
      </p>
    </main>
  )
}
