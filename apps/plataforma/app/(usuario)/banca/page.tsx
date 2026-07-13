import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { getSaldoConsolidado, listarMovimientosLedger, listarIngresosPorRevisar, listarPorRevisar, getDuplicadosSospechosos, getDuplicadosResueltos, getEvolucionMensual, fmtEur } from '@/lib/banca'
import { getResumenFinanciero } from '@/lib/finanzas'
import { getPLMensual } from '@/lib/sivra/pl-mensual'
import { DESTINO_LABEL, CATEGORIA_LABEL } from '@/lib/categorizar'
import { getTesoreria } from '@/lib/tesoreria'
import { eur } from '@/lib/dinero'
import IntervaloSelector, { periodoLabel, type Periodo } from '../finanzas/IntervaloSelector'
import ResumenPeriodo from './ResumenPeriodo'
import AnalisisIAPanel from './AnalisisIAPanel'
import CazadorDeducciones from './CazadorDeducciones'
import BenchmarkPisos from './BenchmarkPisos'
import FugasRecurrentes from './FugasRecurrentes'
import MiniChatContable from './MiniChatContable'
import { ImportarExtractoBtn, ReanalizarBtn, ConciliarBtn, SubirFacturaBtn, ConectarBancoBtn, RevisarBandeja, ExportarBtn, MovimientosTabla, DuplicadosBandeja, RevisarCorreoBtn, OcultarCuentaBtn, ReglasAprendidas, IngresosPorRevisar } from './BancaClient'

export const dynamic = 'force-dynamic'

// Etiqueta visible por categoría IA (Fase 2). Compartida desde lib/categorizar.
const CAT_LABEL = CATEGORIA_LABEL

// /banca = cuadro financiero UNIFICADO. Por defecto muestra el MES EN CURSO: resumen negocio+personal
// (misma fuente que /finanzas/radiografia), P&L de pisos del mes, gráficas comparativas, análisis IA y
// el libro completo de movimientos acotado al periodo (con filtros por cuenta/fecha para ver TODO).
async function safe<T, F>(p: Promise<T>, fallback: F): Promise<T | F> {
  try { return await p } catch (e) { console.error('[banca]', e); return fallback }
}

export default async function BancaPage({ searchParams }: {
  searchParams: Promise<{ year?: string; quarter?: string; desde?: string; hasta?: string }>
}) {
  const session = await getSession()
  if (!session) redirect('/login')

  // Periodo: por defecto el MES EN CURSO (mismo patrón que la radiografía).
  const params = await searchParams
  const now = new Date()
  const year = parseInt(params.year || '') || now.getFullYear()
  const quarter = parseInt(params.quarter || '0') || 0
  let desde = params.desde || ''
  let hasta = params.hasta || ''
  const sinFiltro = !params.year && !params.quarter && !params.desde
  if (sinFiltro) {
    const mm = String(now.getMonth() + 1).padStart(2, '0')
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    desde = `${now.getFullYear()}-${mm}-01`
    hasta = `${now.getFullYear()}-${mm}-${lastDay}`
  }
  const periodo: Periodo = { year, quarter, desde, hasta }
  const etiquetaPeriodo = periodoLabel(periodo)
  // NB: `ledger.total` cuenta SOLO el periodo (mes en curso por defecto). Para decidir si mostrar
  // acciones/libro/reglas usamos si hay cuentas, no el conteo del mes (que puede ser 0 a principio de mes).
  // P&L de pisos: por MES (getPLMensual toma 'YYYY-MM'); usamos el mes del inicio del periodo.
  const mesPL = (desde || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`).slice(0, 7)

  const [sociedades, saldo, ledger, ingresosRevisar, tesoreria, porRevisar, duplicados, dupResueltos, resumen, plPisos, evolucion] = await Promise.all([
    prisma.sociedad.findMany({ where: { cuentaId: session.id }, orderBy: { createdAt: 'asc' }, select: { id: true, nombre: true } }),
    getSaldoConsolidado(session.id),
    listarMovimientosLedger(session.id, { desde: desde || undefined, hasta: hasta || undefined }, 50, 0),
    listarIngresosPorRevisar(session.id),
    getTesoreria(session.id),
    listarPorRevisar(session.id),
    getDuplicadosSospechosos(session.id),
    getDuplicadosResueltos(session.id),
    safe(getResumenFinanciero(session.id, year, quarter, desde || undefined, hasta || undefined), null),
    safe(getPLMensual(mesPL), null),
    safe(getEvolucionMensual(session.id, 12), []),
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
            {saldo.cuentas.length > 0 && <ReanalizarBtn />}
            {saldo.cuentas.length > 0 && <ConciliarBtn />}
            {saldo.cuentas.length > 0 && <SubirFacturaBtn />}
            {saldo.cuentas.length > 0 && <ExportarBtn />}
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
              {saldo.cuentas.filter(c => !c.oculta).map(c => (
                <div key={c.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '18px', boxShadow: 'var(--shadow)', position: 'relative' }}>
                  <div style={{ position: 'absolute', top: '10px', right: '10px' }}>
                    <OcultarCuentaBtn id={c.id} oculta={false} />
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 600 }}>{c.sociedadNombre}</div>
                  <div style={{ fontWeight: 700, fontSize: '15px', marginTop: '2px' }}>{c.banco || 'Banco'} {c.ibanMascara || ''}</div>
                  <div style={{ fontSize: '22px', fontWeight: 800, marginTop: '10px', color: (c.saldoActual ?? 0) >= 0 ? '#16a34a' : '#dc2626' }}>
                    {c.saldoActual == null ? '—' : fmtEur(c.saldoActual)}
                  </div>
                  {c.saldoFecha && <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>a {c.saldoFecha}</div>}
                </div>
              ))}
            </div>
            {saldo.cuentas.some(c => c.oculta) && (
              <details style={{ marginTop: '12px' }}>
                <summary style={{ fontSize: '13px', color: 'var(--muted)', cursor: 'pointer', userSelect: 'none' }}>
                  {saldo.cuentas.filter(c => c.oculta).length} cuenta{saldo.cuentas.filter(c => c.oculta).length > 1 ? 's' : ''} oculta{saldo.cuentas.filter(c => c.oculta).length > 1 ? 's' : ''}
                </summary>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '16px', marginTop: '12px' }}>
                  {saldo.cuentas.filter(c => c.oculta).map(c => (
                    <div key={c.id} style={{ background: 'var(--surface)', border: '1px dashed var(--border)', borderRadius: 'var(--radius)', padding: '18px', opacity: 0.6, position: 'relative' }}>
                      <div style={{ position: 'absolute', top: '10px', right: '10px' }}>
                        <OcultarCuentaBtn id={c.id} oculta={true} />
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 600 }}>{c.sociedadNombre}</div>
                      <div style={{ fontWeight: 700, fontSize: '15px', marginTop: '2px' }}>{c.banco || 'Banco'} {c.ibanMascara || ''}</div>
                      <div style={{ fontSize: '22px', fontWeight: 800, marginTop: '10px', color: (c.saldoActual ?? 0) >= 0 ? '#16a34a' : '#dc2626' }}>
                        {c.saldoActual == null ? '—' : fmtEur(c.saldoActual)}
                      </div>
                      {c.saldoFecha && <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>a {c.saldoFecha}</div>}
                    </div>
                  ))}
                </div>
              </details>
            )}
          </section>
        )}

        {/* Selector de intervalo — por defecto el mes en curso */}
        <div style={{ marginBottom: '20px' }}>
          <IntervaloSelector basePath="/banca" periodo={periodo} />
        </div>

        {/* Resumen interactivo del periodo (negocio + personal) + gráficas comparativas */}
        {resumen && <ResumenPeriodo resumen={resumen} evolucion={evolucion} periodoLabel={etiquetaPeriodo} />}

        {/* Pisos turísticos del mes — P&L por piso */}
        {plPisos && plPisos.pisos.length > 0 && (
          <section style={{ marginBottom: '32px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '14px' }}>🏖️ Pisos turísticos <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--muted)' }}>· {mesPL}</span></h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '16px' }}>
              {plPisos.pisos.map(p => (
                <div key={p.propertyId} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px', boxShadow: 'var(--shadow)' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '2px' }}>{p.nombre}</div>
                  <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '8px' }}>{p.reservas} reserva{p.reservas === 1 ? '' : 's'}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '2px 0' }}><span style={{ color: 'var(--muted)' }}>Ingresos</span><strong style={{ color: '#16a34a' }}>{eur(p.ingresos)}</strong></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '2px 0' }}><span style={{ color: 'var(--muted)' }}>Gastos</span><strong style={{ color: '#dc2626' }}>{eur(p.gastos.total)}</strong></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '4px 0', marginTop: '4px', borderTop: '1px solid var(--border)' }}>
                    <span style={{ fontWeight: 600 }}>Resultado</span>
                    <strong style={{ color: p.resultado >= 0 ? '#16a34a' : '#dc2626' }}>{eur(p.resultado)} <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 500 }}>({p.margen.toFixed(0)}%)</span></strong>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Benchmark entre pisos (compara márgenes/costes del mes; lectura IA bajo demanda) */}
        {plPisos && plPisos.pisos.length >= 2 && (
          <BenchmarkPisos
            mes={mesPL}
            periodoLabel={etiquetaPeriodo}
            pisos={plPisos.pisos.map(p => ({
              propertyId: p.propertyId,
              nombre: p.nombre,
              reservas: p.reservas,
              ingresos: p.ingresos,
              gastosTotal: p.gastos.total,
              resultado: p.resultado,
              margen: p.margen,
            }))}
          />
        )}

        {/* Análisis IA del periodo (bajo demanda) */}
        <AnalisisIAPanel desde={desde} hasta={hasta} periodoLabel={etiquetaPeriodo} />

        {/* Cazador de deducciones: gastos personales que quizá sean deducibles (bajo demanda) */}
        <CazadorDeducciones year={year} quarter={quarter} desde={desde} hasta={hasta} periodoLabel={etiquetaPeriodo} destinoLabel={DESTINO_LABEL} />

        {/* Mini-chat: pregunta a tus cuentas (reutiliza el agente contable, bajo demanda) */}
        <MiniChatContable periodoLabel={etiquetaPeriodo} />

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

        {/* Fugas en recurrentes: suscripciones/recibos a cancelar o renegociar (bajo demanda) */}
        {tesoreria.recurrentes.length > 0 && <FugasRecurrentes periodoLabel={etiquetaPeriodo} />}

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

        {/* Ingresos por revisar: abonos con negocio sin confirmar (el dueño les asigna el negocio) */}
        {ingresosRevisar.length > 0 && (
          <IngresosPorRevisar destinoLabel={DESTINO_LABEL} ingresos={ingresosRevisar} />
        )}

        {/* Libro COMPLETO de movimientos: por defecto el periodo elegido; filtros (cuenta, fechas,
            signo, texto) + badge deducible por fila + paginación de servidor. "Limpiar" = ver todo. */}
        {saldo.cuentas.length > 0 && (
          <MovimientosTabla
            destinoLabel={DESTINO_LABEL}
            cuentas={saldo.cuentas.filter(c => !c.oculta).map(c => ({
              id: c.id,
              label: `${c.banco || 'Banco'} ${c.ibanMascara || ''}`.trim(),
            }))}
            initial={ledger}
            periodo={{ desde, hasta }}
          />
        )}

        {/* Reglas aprendidas (transparencia): lo que el sistema aprendió al reclasificar, con borrar */}
        {saldo.cuentas.length > 0 && <ReglasAprendidas />}
      </main>
  )
}
