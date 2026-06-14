import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { getSaldoConsolidado, listarMovimientos, fmtEur } from '@/lib/banca'
import { ImportarExtractoBtn, ReanalizarBtn, ConciliarBtn } from './BancaClient'

export const dynamic = 'force-dynamic'

// Etiqueta visible por categoría IA (Fase 2).
const CAT_LABEL: Record<string, string> = {
  nomina: '👤 Nómina', proveedor: '📦 Proveedor', impuestos: '🏛️ Impuestos',
  suministros: '💡 Suministros', alquiler: '🏠 Alquiler', comision_bancaria: '🏦 Comisión',
  cobro_cliente: '💰 Cobro cliente', transferencia: '🔁 Transferencia', tarjeta: '💳 Tarjeta',
  prestamo: '📉 Préstamo', seguro: '🛡️ Seguro', otros: '• Otros',
}

export default async function BancaPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const [sociedades, saldo, movimientos] = await Promise.all([
    prisma.sociedad.findMany({ where: { cuentaId: session.id }, orderBy: { createdAt: 'asc' }, select: { id: true, nombre: true } }),
    getSaldoConsolidado(session.id),
    listarMovimientos(session.id, undefined, 100),
  ])

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <header style={{
        background: 'var(--surface)', borderBottom: '1px solid var(--border)',
        padding: '0 24px', height: '56px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800 }}>
          <span style={{ background: 'var(--primary)', color: '#fff', borderRadius: '6px', padding: '2px 8px', fontSize: '15px' }}>ia</span>
          <span>plataforma · banca</span>
        </div>
        <Link href="/dashboard" style={{ fontSize: '14px', color: 'var(--muted)', textDecoration: 'none' }}>← Dashboard</Link>
      </header>

      <main style={{ maxWidth: '960px', margin: '0 auto', padding: '32px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '24px' }}>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 500 }}>Saldo total del grupo</div>
            <div style={{ fontSize: '28px', fontWeight: 800, color: saldo.total >= 0 ? '#16a34a' : '#dc2626' }}>{fmtEur(saldo.total)}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            {movimientos.length > 0 && <ReanalizarBtn />}
            {movimientos.length > 0 && <ConciliarBtn />}
            <ImportarExtractoBtn sociedades={sociedades} />
          </div>
        </div>

        {/* Cuentas por sociedad */}
        {saldo.cuentas.length === 0 ? (
          <div style={{
            background: 'var(--surface)', border: '1px dashed var(--border)',
            borderRadius: 'var(--radius)', padding: '40px 24px', textAlign: 'center', color: 'var(--muted)',
          }}>
            <div style={{ fontSize: '36px', marginBottom: '12px' }}>🏦</div>
            <p style={{ fontWeight: 600, marginBottom: '6px' }}>Sin cuentas bancarias todavía</p>
            <p style={{ fontSize: '14px' }}>Descarga el extracto Norma 43 (Cuaderno 43) de tu banco e impórtalo arriba.</p>
          </div>
        ) : (
          <section style={{ marginBottom: '32px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '16px' }}>
              {saldo.cuentas.map(c => (
                <div key={c.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '18px', boxShadow: 'var(--shadow)' }}>
                  <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 600 }}>{c.sociedadNombre}</div>
                  <div style={{ fontWeight: 700, fontSize: '15px', marginTop: '2px' }}>{c.banco || 'Banco'} {c.ibanMascara || ''}</div>
                  <div style={{ fontSize: '22px', fontWeight: 800, marginTop: '10px', color: (c.saldoActual ?? 0) >= 0 ? '#16a34a' : '#dc2626' }}>
                    {c.saldoActual == null ? '—' : fmtEur(c.saldoActual)}
                  </div>
                  {c.saldoFecha && <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>a {c.saldoFecha}</div>}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Movimientos */}
        {movimientos.length > 0 && (
          <section>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '14px', flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 700 }}>Últimos movimientos</h2>
              {(() => {
                const conc = movimientos.filter(m => m.conciliado).length
                return <span style={{ fontSize: '12px', color: 'var(--muted)' }}>🔗 {conc}/{movimientos.length} conciliados con factura</span>
              })()}
            </div>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
              {movimientos.map((m, i) => (
                <div key={m.id} style={{
                  display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px',
                  borderTop: i === 0 ? 'none' : '1px solid var(--border)',
                }}>
                  <div style={{ fontSize: '12px', color: 'var(--muted)', width: '84px', flexShrink: 0 }}>{m.fechaOperacion || '—'}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '14px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {m.conceptoNormalizado || m.concepto || m.contraparte || 'Movimiento'}
                    </div>
                    {m.categoria && <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{CAT_LABEL[m.categoria] || m.categoria}</div>}
                  </div>
                  <div style={{ fontSize: '13px', flexShrink: 0, width: '18px', textAlign: 'center' }} title={m.conciliado ? 'Conciliado con factura' : 'Sin conciliar'}>
                    {m.conciliado ? '🔗' : ''}
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: m.importe >= 0 ? '#16a34a' : '#dc2626', flexShrink: 0 }}>
                    {fmtEur(m.importe)}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
