import { redirect } from 'next/navigation'
import { getAdmin } from '@/lib/superadmin'
import { resumenIA } from '@/lib/ai-gateway'

export const dynamic = 'force-dynamic'

const card: React.CSSProperties = { background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, padding: 16 }
const kpi: React.CSSProperties = { ...card, minWidth: 120 }
const th: React.CSSProperties = { textAlign: 'left', color: 'var(--muted)', fontWeight: 600, fontSize: 12, padding: '6px 8px' }
const td: React.CSSProperties = { padding: '6px 8px', fontSize: 13, borderTop: '1px solid var(--line)' }

export default async function OperadorIaPage() {
  const admin = await getAdmin()
  if (!admin) redirect('/dashboard')
  const r = await resumenIA()

  return (
    <main style={{ padding: 24, maxWidth: 920 }}>
      <h1 style={{ fontSize: 24 }}>IA · gasto y uso</h1>
      <p style={{ color: 'var(--muted)', marginTop: 4 }}>
        Pasarela de IA central de la casa de marcas. Todas las apps llaman aquí; las keys de proveedor viven solo en plataforma.
        Datos de <strong>este mes</strong>.
      </p>

      {r.presupuesto.limite > 0 && r.presupuesto.ratio >= 0.8 && (
        <div style={{ ...card, marginTop: 16, borderColor: r.presupuesto.ratio >= 1 ? '#dc2626' : '#d97706', background: r.presupuesto.ratio >= 1 ? '#fef2f2' : '#fffbeb' }}>
          <strong>{r.presupuesto.ratio >= 1 ? '🛑 Presupuesto mensual agotado' : '⚠️ Presupuesto mensual casi agotado'}</strong>
          {' — '}{r.presupuesto.usado} / {r.presupuesto.limite} llamadas ({Math.round(r.presupuesto.ratio * 100)}%).
          {r.presupuesto.ratio >= 1 ? ' La pasarela está devolviendo 429 (las verticales caen a su fallback directo).' : ' Sube AI_GATEWAY_LIMITE_MENSUAL o revisa el uso.'}
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 16 }}>
        <div style={kpi}><div style={{ color: 'var(--muted)', fontSize: 12 }}>Llamadas</div><div style={{ fontSize: 22, fontWeight: 700 }}>{r.mes.total}</div></div>
        <div style={kpi}><div style={{ color: 'var(--muted)', fontSize: 12 }}>Coste estimado</div><div style={{ fontSize: 22, fontWeight: 700 }}>{r.mes.coste.toFixed(2)} €</div></div>
        <div style={kpi}><div style={{ color: 'var(--muted)', fontSize: 12 }}>Tokens</div><div style={{ fontSize: 22, fontWeight: 700 }}>{r.mes.tokens.toLocaleString('es-ES')}</div></div>
        <div style={kpi}><div style={{ color: 'var(--muted)', fontSize: 12 }}>OK</div><div style={{ fontSize: 22, fontWeight: 700, color: '#16a34a' }}>{r.mes.ok}</div></div>
        <div style={kpi}><div style={{ color: 'var(--muted)', fontSize: 12 }}>Errores</div><div style={{ fontSize: 22, fontWeight: 700, color: r.mes.errores ? '#dc2626' : 'inherit' }}>{r.mes.errores}</div></div>
        <div style={kpi}><div style={{ color: 'var(--muted)', fontSize: 12 }}>Latencia media</div><div style={{ fontSize: 22, fontWeight: 700 }}>{r.mes.ms_medio} ms</div></div>
        <div style={kpi}><div style={{ color: 'var(--muted)', fontSize: 12 }}>Límite mensual</div><div style={{ fontSize: 22, fontWeight: 700 }}>{r.limite_mensual || '∞'}</div></div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 16 }}>
        <section style={{ ...card, flex: 1, minWidth: 260 }}>
          <h2 style={{ fontSize: 15, marginBottom: 6 }}>Por app</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={th}>App</th><th style={th}>Llamadas</th><th style={th}>Coste</th></tr></thead>
            <tbody>
              {r.por_app.map(a => <tr key={a.app}><td style={td}>{a.app}</td><td style={td}>{a.n}</td><td style={td}>{a.coste.toFixed(2)} €</td></tr>)}
              {r.por_app.length === 0 && <tr><td style={td} colSpan={3}>Sin uso este mes</td></tr>}
            </tbody>
          </table>
        </section>
        <section style={{ ...card, flex: 1, minWidth: 260 }}>
          <h2 style={{ fontSize: 15, marginBottom: 6 }}>Por proveedor</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={th}>Proveedor</th><th style={th}>Llamadas</th></tr></thead>
            <tbody>
              {r.por_proveedor.map(p => <tr key={p.proveedor}><td style={td}>{p.proveedor}</td><td style={td}>{p.n}</td></tr>)}
              {r.por_proveedor.length === 0 && <tr><td style={td} colSpan={2}>Sin uso este mes</td></tr>}
            </tbody>
          </table>
        </section>
      </div>

      <section style={{ ...card, marginTop: 16 }}>
        <h2 style={{ fontSize: 15, marginBottom: 6 }}>Últimas llamadas</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>Fecha</th><th style={th}>App</th><th style={th}>Tipo</th><th style={th}>Proveedor</th><th style={th}>Estado</th><th style={th}>Tokens</th><th style={th}>Coste</th><th style={th}>ms</th></tr></thead>
          <tbody>
            {r.recientes.map((u, i) => (
              <tr key={i}>
                <td style={td}>{new Date(u.creada_at).toLocaleString('es-ES')}</td>
                <td style={td}>{u.app}</td>
                <td style={td}>{u.endpoint}</td>
                <td style={td}>{u.proveedor}</td>
                <td style={{ ...td, color: u.ok ? '#16a34a' : '#dc2626' }}>{u.ok ? 'ok' : (u.error ?? 'error')}</td>
                <td style={td}>{u.tokens.toLocaleString('es-ES')}</td>
                <td style={td}>{u.coste.toFixed(4)} €</td>
                <td style={td}>{u.ms}</td>
              </tr>
            ))}
            {r.recientes.length === 0 && <tr><td style={td} colSpan={8}>Aún no hay llamadas registradas.</td></tr>}
          </tbody>
        </table>
      </section>

      <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 12 }}>
        Control de coste: define <code>AI_GATEWAY_LIMITE_MENSUAL</code> (nº de llamadas/mes) para cortar automáticamente al alcanzar el tope.
      </p>
    </main>
  )
}
