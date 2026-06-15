import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { getSaldoConsolidado, listarMovimientos, listarPorRevisar, getResumenPorDestino, fmtEur } from '@/lib/banca'
import { DESTINO_LABEL } from '@/lib/categorizar'
import { getTesoreria } from '@/lib/tesoreria'
import { ImportarExtractoBtn, ReanalizarBtn, ConciliarBtn, SubirFacturaBtn, ConectarBancoBtn, RevisarBandeja } from './BancaClient'

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

  const [sociedades, saldo, movimientos, tesoreria, porRevisar, porDestino] = await Promise.all([
    prisma.sociedad.findMany({ where: { cuentaId: session.id }, orderBy: { createdAt: 'asc' }, select: { id: true, nombre: true } }),
    getSaldoConsolidado(session.id),
    listarMovimientos(session.id, undefined, 100),
    getTesoreria(session.id),
    listarPorRevisar(session.id),
    getResumenPorDestino(session.id),
  ])

  return (
    <main style={{ maxWidth: '960px', margin: '0 auto', padding: '32px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '24px' }}>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 500 }}>Saldo total del grupo</div>
            <div style={{ fontSize: '28px', fontWeight: 800, color: saldo.total >= 0 ? '#16a34a' : '#dc2626' }}>{fmtEur(saldo.total)}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            {movimientos.length > 0 && <ReanalizarBtn />}
            {movimientos.length > 0 && <ConciliarBtn />}
            {movimientos.length > 0 && <SubirFacturaBtn />}
            <ConectarBancoBtn sociedades={sociedades} />
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

        {/* Por negocio / destino */}
        {porDestino.length > 0 && (
          <section style={{ marginBottom: '32px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '14px' }}>🏷️ Por negocio</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '16px' }}>
              {porDestino.map(d => (
                <div key={d.destino} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '18px', boxShadow: 'var(--shadow)' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700 }}>{DESTINO_LABEL[d.destino as keyof typeof DESTINO_LABEL] || d.destino}</div>
                  <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '8px' }}>{d.movs} movimientos</div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#16a34a' }}>+{fmtEur(d.ingresos)}</div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#dc2626' }}>{fmtEur(d.gastos)}</div>
                  <div style={{ fontSize: '13px', fontWeight: 800, marginTop: '4px', borderTop: '1px solid var(--border)', paddingTop: '4px', color: (d.ingresos + d.gastos) >= 0 ? '#16a34a' : '#dc2626' }}>
                    {fmtEur(d.ingresos + d.gastos)}
                  </div>
                </div>
              ))}
            </div>
            <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '8px' }}>
              🔁 Los traspasos internos no son ingresos/gastos reales. La tarjeta entrará detallada al subir su extracto.
            </p>
          </section>
        )}

        {/* Previsión de tesorería (F5) */}
        {tesoreria.recurrentes.length > 0 && (
          <section style={{ marginBottom: '32px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '14px' }}>📈 Previsión de tesorería</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '16px' }}>
              {tesoreria.proyecciones.map(p => (
                <div key={p.dias} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '18px', boxShadow: 'var(--shadow)' }}>
                  <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 600 }}>Saldo proyectado · {p.dias} días</div>
                  <div style={{ fontSize: '22px', fontWeight: 800, marginTop: '6px', color: p.proyectado >= 0 ? '#16a34a' : '#dc2626' }}>{fmtEur(p.proyectado)}</div>
                  <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>+{fmtEur(p.entradas)} entran · −{fmtEur(p.salidas)} salen</div>
                </div>
              ))}
            </div>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
              <div style={{ padding: '10px 16px', fontSize: '12px', color: 'var(--muted)', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>Movimientos recurrentes detectados</div>
              {tesoreria.recurrentes.slice(0, 8).map((r, i) => (
                <div key={r.clave + i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 16px', borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
                  <div style={{ flex: 1, minWidth: 0, fontSize: '14px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.concepto}</div>
                  <div style={{ fontSize: '11px', color: 'var(--muted)', flexShrink: 0 }}>cada ~{r.intervaloDias}d · ×{r.ocurrencias}</div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: r.importeMedio >= 0 ? '#16a34a' : '#dc2626', flexShrink: 0, width: '92px', textAlign: 'right' }}>{fmtEur(r.importeMedio)}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Por revisar (IA dudó) — el dueño asigna categoría */}
        {porRevisar.length > 0 && (
          <RevisarBandeja
            movimientos={porRevisar.map(m => ({
              id: m.id,
              fecha: m.fechaOperacion,
              concepto: m.conceptoNormalizado || m.concepto || m.contraparte || 'Movimiento',
              importe: m.importe,
            }))}
            categorias={Object.entries(CAT_LABEL).map(([value, label]) => ({ value, label }))}
          />
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
  )
}
