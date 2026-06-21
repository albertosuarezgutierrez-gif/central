import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { getSaldoConsolidado, listarMovimientos, listarPorRevisar, getResumenPorDestino, getEvolucionPorDestino, getDuplicadosSospechosos, getDuplicadosResueltos, fmtEur, type EvolucionDestino } from '@/lib/banca'
import { DESTINO_LABEL, CATEGORIA_LABEL } from '@/lib/categorizar'
import { getEstimacionFiscal, type Trimestre } from '@/lib/fiscal'
import { getTesoreria } from '@/lib/tesoreria'
import { ImportarExtractoBtn, ReanalizarBtn, ConciliarBtn, SubirFacturaBtn, ConectarBancoBtn, RevisarBandeja, ExportarBtn, MovimientosTabla, DuplicadosBandeja, RevisarCorreoBtn } from './BancaClient'

export const dynamic = 'force-dynamic'

// Etiqueta visible por categoría IA (Fase 2). Compartida desde lib/categorizar.
const CAT_LABEL = CATEGORIA_LABEL

export default async function BancaPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const anio = new Date().getFullYear()
  const [sociedades, saldo, movimientos, tesoreria, porRevisar, porDestino, evolucionNegocio, fiscal, duplicados, dupResueltos] = await Promise.all([
    prisma.sociedad.findMany({ where: { cuentaId: session.id }, orderBy: { createdAt: 'asc' }, select: { id: true, nombre: true } }),
    getSaldoConsolidado(session.id),
    listarMovimientos(session.id, undefined, 300),
    getTesoreria(session.id),
    listarPorRevisar(session.id),
    getResumenPorDestino(session.id),
    getEvolucionPorDestino(session.id, 6),
    getEstimacionFiscal(session.id, anio),
    getDuplicadosSospechosos(session.id),
    getDuplicadosResueltos(session.id),
  ])

  return (
    <main style={{ maxWidth: '960px', margin: '0 auto', padding: '32px 24px' }}>
        <style>{`
          @media (max-width: 768px) {
            .banca-header { flex-direction: column !important; align-items: flex-start !important; }
            .banca-table-wrap { overflow-x: auto !important; -webkit-overflow-scrolling: touch; }
            .banca-acciones { flex-wrap: wrap !important; gap: 8px !important; }
          }
        `}</style>
        <div className="banca-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '24px' }}>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 500 }}>Saldo total del grupo</div>
            <div style={{ fontSize: '28px', fontWeight: 800, color: saldo.total >= 0 ? '#16a34a' : '#dc2626' }}>{fmtEur(saldo.total)}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            {movimientos.length > 0 && <ReanalizarBtn />}
            {movimientos.length > 0 && <ConciliarBtn />}
            {movimientos.length > 0 && <SubirFacturaBtn />}
            {movimientos.length > 0 && <ExportarBtn />}
            <RevisarCorreoBtn />
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

        {/* Evolución del neto por negocio (últimos 6 meses) */}
        {evolucionNegocio.filas.length > 0 && (
          <EvolucionNegocio meses={evolucionNegocio.meses} filas={evolucionNegocio.filas} />
        )}

        {/* Estimación fiscal orientativa por trimestre */}
        {fiscal.some(t => t.ingresos > 0 || t.gastos > 0) && (
          <EstimacionFiscal trimestres={fiscal} anio={anio} />
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

        {/* Posibles cargos duplicados — el dueño los resuelve */}
        <DuplicadosBandeja grupos={duplicados} resueltos={dupResueltos} />

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

        {/* Movimientos con buscador + filtros */}
        {movimientos.length > 0 && (
          <MovimientosTabla
            catLabel={CAT_LABEL}
            movimientos={movimientos.map(m => ({
              id: m.id,
              fecha: m.fechaOperacion,
              concepto: m.conceptoNormalizado || m.concepto || m.contraparte || 'Movimiento',
              categoria: m.categoria,
              importe: m.importe,
              conciliado: m.conciliado,
            }))}
          />
        )}
      </main>
  )
}

const MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
function etiquetaMes(mes: string): string { return MES_CORTO[Number(mes.slice(5, 7)) - 1] || mes }

// Tabla de evolución del neto por negocio: filas = negocio, columnas = últimos meses.
function EvolucionNegocio({ meses, filas }: { meses: string[]; filas: EvolucionDestino[] }) {
  return (
    <section style={{ marginBottom: '32px' }}>
      <h2 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '14px' }}>📈 Neto por negocio (últimos {meses.length} meses)</h2>
      <div className="banca-table-wrap" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th style={{ textAlign: 'left', padding: '10px 16px', fontWeight: 600, color: 'var(--muted)' }}>Negocio</th>
              {meses.map(m => <th key={m} style={{ textAlign: 'right', padding: '10px 12px', fontWeight: 600, color: 'var(--muted)' }}>{etiquetaMes(m)}</th>)}
              <th style={{ textAlign: 'right', padding: '10px 16px', fontWeight: 700 }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {filas.map(f => (
              <tr key={f.destino} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '10px 16px', fontWeight: 600, whiteSpace: 'nowrap' }}>{DESTINO_LABEL[f.destino as keyof typeof DESTINO_LABEL] || f.destino}</td>
                {f.netoPorMes.map((n, i) => (
                  <td key={i} style={{ textAlign: 'right', padding: '10px 12px', color: n === 0 ? 'var(--muted)' : (n > 0 ? '#16a34a' : '#dc2626') }}>
                    {n === 0 ? '—' : fmtEur(n)}
                  </td>
                ))}
                <td style={{ textAlign: 'right', padding: '10px 16px', fontWeight: 700, color: f.total >= 0 ? '#16a34a' : '#dc2626' }}>{fmtEur(f.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

// Estimación fiscal ORIENTATIVA por trimestre (IVA + pago fraccionado IRPF). No es la
// liquidación real: para eso, "Exportar (CSV)" y que lo calcule el gestor con las facturas.
function EstimacionFiscal({ trimestres, anio }: { trimestres: Trimestre[]; anio: number }) {
  return (
    <section style={{ marginBottom: '32px' }}>
      <h2 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '4px' }}>🧾 Estimación fiscal {anio} <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--muted)' }}>(orientativa)</span></h2>
      <p style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '14px' }}>
        Aproximación al tipo general (IVA 21%, IRPF fraccionado 20% del resultado). Hay actividades exentas o a tipo reducido (alquiler turístico, seguros): la liquidación real la hace tu gestor con las facturas. Usa <strong>Exportar (CSV)</strong> para pasárselo.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
        {trimestres.map(t => (
          <div key={t.trimestre} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px', boxShadow: 'var(--shadow)' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '8px' }}>{t.trimestre}T {anio}</div>
            <FiscalLinea label="Resultado" valor={fmtEur(t.resultado)} color={t.resultado >= 0 ? '#16a34a' : '#dc2626'} />
            <FiscalLinea label="IVA a ingresar" valor={fmtEur(t.ivaAIngresar)} />
            <FiscalLinea label="IRPF fraccionado" valor={fmtEur(t.irpfFraccionado)} />
          </div>
        ))}
      </div>
    </section>
  )
}

function FiscalLinea({ label, valor, color }: { label: string; valor: string; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px', fontSize: '13px', marginTop: '4px' }}>
      <span style={{ color: 'var(--muted)' }}>{label}</span>
      <span style={{ fontWeight: 700, color: color || 'var(--text)' }}>{valor}</span>
    </div>
  )
}
