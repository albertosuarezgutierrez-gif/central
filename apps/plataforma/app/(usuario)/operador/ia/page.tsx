import { redirect } from 'next/navigation'
import { getAdmin } from '@/lib/superadmin'
import { resumenIA } from '@/lib/ai-gateway'
import { statsCache, cacheActiva } from '@/lib/ia-cache'
import { eur } from '@/lib/dinero'

export const dynamic = 'force-dynamic'

const card: React.CSSProperties = { background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, padding: 16 }
const kpi: React.CSSProperties = { ...card, minWidth: 120 }
const th: React.CSSProperties = { textAlign: 'left', color: 'var(--muted)', fontWeight: 600, fontSize: 12, padding: '6px 8px' }
const td: React.CSSProperties = { padding: '6px 8px', fontSize: 13, borderTop: '1px solid var(--line)' }
const scroll: React.CSSProperties = { overflowX: 'auto' }

const MODO_LABEL: Record<string, string> = {
  activo: '🟢 activo (enruta de verdad)',
  sombra: '🕶️ sombra (decide y registra, sirve el default)',
  inactivo: '⚪ inactivo (sin OPENROUTER_API_KEY)',
}

export default async function OperadorIaPage() {
  const admin = await getAdmin()
  if (!admin) redirect('/dashboard')
  const [r, cache] = await Promise.all([resumenIA(), statsCache()])

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

      {r.hoy.limite_diario > 0 && r.hoy.coste >= r.hoy.limite_diario && (
        <div style={{ ...card, marginTop: 16, borderColor: '#dc2626', background: '#fef2f2' }}>
          <strong>🛑 Presupuesto diario en € agotado</strong>
          {' — '}{eur(r.hoy.coste)} / {eur(r.hoy.limite_diario)} hoy. Las llamadas DE PAGO (OpenRouter) están bloqueadas hasta mañana; la cadena gratis sigue sirviendo.
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 16 }}>
        <div style={kpi}><div style={{ color: 'var(--muted)', fontSize: 12 }}>Llamadas</div><div style={{ fontSize: 22, fontWeight: 700 }}>{r.mes.total}</div></div>
        <div style={kpi}><div style={{ color: 'var(--muted)', fontSize: 12 }}>Coste mes</div><div style={{ fontSize: 22, fontWeight: 700 }}>{eur(r.mes.coste)}</div></div>
        <div style={kpi}><div style={{ color: 'var(--muted)', fontSize: 12 }}>Gasto hoy</div><div style={{ fontSize: 22, fontWeight: 700 }}>{eur(r.hoy.coste)}<span style={{ fontSize: 12, color: 'var(--muted)' }}> / {r.hoy.limite_diario > 0 ? eur(r.hoy.limite_diario) : '∞'}</span></div></div>
        <div style={kpi}><div style={{ color: 'var(--muted)', fontSize: 12 }}>Tokens</div><div style={{ fontSize: 22, fontWeight: 700 }}>{r.mes.tokens.toLocaleString('es-ES')}</div></div>
        <div style={kpi}><div style={{ color: 'var(--muted)', fontSize: 12 }}>OK</div><div style={{ fontSize: 22, fontWeight: 700, color: '#16a34a' }}>{r.mes.ok}</div></div>
        <div style={kpi}><div style={{ color: 'var(--muted)', fontSize: 12 }}>Errores</div><div style={{ fontSize: 22, fontWeight: 700, color: r.mes.errores ? '#dc2626' : 'inherit' }}>{r.mes.errores}</div></div>
        <div style={kpi}><div style={{ color: 'var(--muted)', fontSize: 12 }}>Latencia media</div><div style={{ fontSize: 22, fontWeight: 700 }}>{r.mes.ms_medio} ms</div></div>
      </div>

      <section style={{ ...card, marginTop: 16 }}>
        <h2 style={{ fontSize: 15, marginBottom: 6 }}>🧠 Agente Director</h2>
        <p style={{ color: 'var(--muted)', fontSize: 13, margin: '0 0 6px' }}>
          Modo: <strong>{MODO_LABEL[r.director.modo] ?? r.director.modo}</strong> · decisiones este mes: {r.director.total_mes}
          {r.director.fallos_mes > 0 && <span style={{ color: '#dc2626' }}> ({r.director.fallos_mes} fallos → default)</span>}
          {' '}· caché semántica: {cacheActiva() ? `activa (${cache.entradas} entradas, ${cache.hitsMes} hits/mes)` : 'apagada'}
        </p>
        <p style={{ color: 'var(--muted)', fontSize: 13, margin: '0 0 8px' }}>
          Catálogo <strong>v{r.director.version}</strong> · {r.director.modelos} modelos · degradación por presupuesto:{' '}
          {r.director.presupuestoRatio >= r.director.umbral
            ? <strong style={{ color: '#d97706' }}>activa</strong>
            : <span>inactiva</span>}{' '}
          (hoy {Math.round(r.director.presupuestoRatio * 100)}% del límite diario, umbral {Math.round(r.director.umbral * 100)}%)
        </p>
        {r.director.recientes.length > 0 && (
          <div style={scroll}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Fecha</th><th style={th}>Modelo elegido</th><th style={th}>Estado</th><th style={th}>ms</th></tr></thead>
              <tbody>
                {r.director.recientes.map((d, i) => (
                  <tr key={i}>
                    <td style={td}>{new Date(d.creada_at).toLocaleString('es-ES')}</td>
                    <td style={td}>{d.modelo ?? '—'}</td>
                    <td style={{ ...td, color: d.ok ? '#16a34a' : '#dc2626' }}>{d.ok ? 'ok' : 'fallo → default'}</td>
                    <td style={td}>{d.ms}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 16 }}>
        <section style={{ ...card, flex: 1, minWidth: 260 }}>
          <h2 style={{ fontSize: 15, marginBottom: 6 }}>Por app</h2>
          <div style={scroll}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>App</th><th style={th}>Llamadas</th><th style={th}>Coste</th></tr></thead>
              <tbody>
                {r.por_app.map(a => <tr key={a.app}><td style={td}>{a.app}</td><td style={td}>{a.n}</td><td style={td}>{eur(a.coste)}</td></tr>)}
                {r.por_app.length === 0 && <tr><td style={td} colSpan={3}>Sin uso este mes</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
        <section style={{ ...card, flex: 1, minWidth: 260 }}>
          <h2 style={{ fontSize: 15, marginBottom: 6 }}>Por proveedor</h2>
          <div style={scroll}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Proveedor</th><th style={th}>Llamadas</th></tr></thead>
              <tbody>
                {r.por_proveedor.map(p => <tr key={p.proveedor}><td style={td}>{p.proveedor}</td><td style={td}>{p.n}</td></tr>)}
                {r.por_proveedor.length === 0 && <tr><td style={td} colSpan={2}>Sin uso este mes</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 16 }}>
        <section style={{ ...card, flex: 1, minWidth: 260 }}>
          <h2 style={{ fontSize: 15, marginBottom: 6 }}>Por modelo</h2>
          <div style={scroll}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Modelo</th><th style={th}>Llamadas</th><th style={th}>Tokens</th><th style={th}>Coste</th></tr></thead>
              <tbody>
                {r.por_modelo.map(m => <tr key={m.modelo}><td style={td}>{m.modelo}</td><td style={td}>{m.n}</td><td style={td}>{m.tokens.toLocaleString('es-ES')}</td><td style={td}>{eur(m.coste)}</td></tr>)}
                {r.por_modelo.length === 0 && <tr><td style={td} colSpan={4}>Sin uso este mes</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
        <section style={{ ...card, flex: 1, minWidth: 260 }}>
          <h2 style={{ fontSize: 15, marginBottom: 6 }}>Por cliente (refacturación)</h2>
          <p style={{ color: 'var(--muted)', fontSize: 12, margin: '0 0 6px' }}>
            Gasto del mes por cliente final (<code>cliente</code> en el body de la pasarela). Base de la factura de IA.
          </p>
          <div style={scroll}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Cliente</th><th style={th}>Llamadas</th><th style={th}>Tokens</th><th style={th}>Coste</th></tr></thead>
              <tbody>
                {r.por_cliente.map(c => <tr key={c.cliente}><td style={td}>{c.cliente}</td><td style={td}>{c.n}</td><td style={td}>{c.tokens.toLocaleString('es-ES')}</td><td style={td}>{eur(c.coste)}</td></tr>)}
                {r.por_cliente.length === 0 && <tr><td style={td} colSpan={4}>Sin tráfico atribuido a clientes este mes</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section style={{ ...card, marginTop: 16 }}>
        <h2 style={{ fontSize: 15, marginBottom: 6 }}>Últimas llamadas</h2>
        <div style={scroll}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={th}>Fecha</th><th style={th}>App</th><th style={th}>Tipo</th><th style={th}>Proveedor</th><th style={th}>Modelo</th><th style={th}>Estado</th><th style={th}>Tokens</th><th style={th}>Coste</th><th style={th}>ms</th></tr></thead>
            <tbody>
              {r.recientes.map((u, i) => (
                <tr key={i}>
                  <td style={td}>{new Date(u.creada_at).toLocaleString('es-ES')}</td>
                  <td style={td}>{u.app}</td>
                  <td style={td}>{u.endpoint}</td>
                  <td style={td}>{u.proveedor}</td>
                  <td style={td}>{u.modelo ?? '—'}</td>
                  <td style={{ ...td, color: u.ok ? '#16a34a' : '#dc2626' }}>{u.ok ? 'ok' : (u.error ?? 'error')}</td>
                  <td style={td}>{u.tokens.toLocaleString('es-ES')}</td>
                  <td style={td}>{u.coste.toFixed(4)} €</td>
                  <td style={td}>{u.ms}</td>
                </tr>
              ))}
              {r.recientes.length === 0 && <tr><td style={td} colSpan={9}>Aún no hay llamadas registradas.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 12 }}>
        Control de coste: <code>AI_GATEWAY_LIMITE_MENSUAL</code> (nº llamadas/mes, 429 al tope) ·{' '}
        <code>AI_GATEWAY_LIMITE_DIARIO_EUR</code> (€/día, default 1 — al tope bloquea solo el camino de pago) ·{' '}
        límites por app/cliente en la tabla <code>ia_presupuestos</code>.
      </p>
    </main>
  )
}
