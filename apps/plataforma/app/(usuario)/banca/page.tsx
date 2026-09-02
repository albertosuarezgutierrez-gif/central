import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { getSaldoConsolidado, listarMovimientosLedger, listarIngresosPorRevisar, listarPorRevisar, getDuplicadosSospechosos, getDuplicadosResueltos, getEvolucionMensual, fmtEur } from '@/lib/banca'
import { getResumenFinanciero } from '@/lib/finanzas'
import { getPLMensual } from '@/lib/sivra/pl-mensual'
import { DESTINO_LABEL } from '@/lib/categorizar'
import { getTesoreria } from '@/lib/tesoreria'
import { getBrokerSaldos } from '@/lib/broker'
import { getEstadoFeedPsd2 } from '@/lib/psd2-estado'
import { eur } from '@/lib/dinero'
import IntervaloSelector from '../finanzas/IntervaloSelector'
import { periodoLabel, type Periodo } from '../finanzas/periodo'
import ResumenPeriodo from './ResumenPeriodo'
import AnalisisIAPanel from './AnalisisIAPanel'
import SyncPsd2Btn from './SyncPsd2Btn'
import CazadorDeducciones from './CazadorDeducciones'
import Antifraude from './Antifraude'
import BenchmarkPisos from './BenchmarkPisos'
import FugasRecurrentes from './FugasRecurrentes'
import MiniChatContable from './MiniChatContable'
import TicketsSuper from './TicketsSuper'
import SegTabs from './SegTabs'
import { Pagina, colorImporte, Dato } from '@/components/ui'
import { Landmark, TrendingUp } from 'lucide-react'
import SaldoTotal from './SaldoTotal'
import NegociosResumen from './NegociosResumen'
import FiscalResumen from './FiscalResumen'
import CategoriasTab from '../finanzas/CategoriasTab'
import { calcularEstadoDeclaracion } from '@/lib/comparativa-declaracion'
import { AccionesBanca, Plegable, ImportarExtractoBtn, ReanalizarBtn, ConciliarBtn, SubirFacturaBtn, ConectarBancoBtn, RevisarBandeja, ExportarBtn, MovimientosTabla, MovimientosBtn, DuplicadosBandeja, RevisarCorreoBtn, OcultarCuentaBtn, ReglasAprendidas, IngresosPorRevisar } from './BancaClient'

export const dynamic = 'force-dynamic'


// /banca = Inicio unificado con control 💶 Dinero | 🏢 Negocios (SegTabs, por navegación → carga
// perezosa: cada pestaña computa SOLO sus datos). Dinero (por defecto): resumen negocio+personal
// (misma fuente que la radiografía), P&L de pisos del mes, gráficas, IA y el libro completo de
// movimientos acotado al periodo. Negocios: la foto del holding (banca/NegociosResumen.tsx).
async function safe<T, F>(p: Promise<T>, fallback: F): Promise<T | F> {
  try { return await p } catch (e) { console.error('[banca]', e); return fallback }
}

export default async function BancaPage({ searchParams }: {
  searchParams: Promise<{ year?: string; quarter?: string; desde?: string; hasta?: string; tab?: string }>
}) {
  const session = await getSession()
  if (!session) redirect('/login')

  const params = await searchParams
  const tab: 'dinero' | 'negocios' | 'fiscal' | 'personal' =
    params.tab === 'negocios' ? 'negocios'
      : params.tab === 'fiscal' ? 'fiscal'
      : params.tab === 'personal' ? 'personal'
      : 'dinero'

  // 🏢 Segmento NEGOCIOS (holding) — carga PEREZOSA: solo se computa cuando la pestaña está activa,
  // así /banca (Dinero, por defecto) NO paga el coste del holding en cada visita.
  if (tab === 'negocios') {
    return (
      <Pagina ancho="lectura">
        <MiniChatContable periodoLabel={`${new Date().getFullYear()}`} />
        <div style={{ margin: '4px 0 22px' }}><SegTabs active="negocios" /></div>
        <NegociosResumen cuentaId={session.id} nombre={session.nombre} />
      </Pagina>
    )
  }

  // 🧾 Segmento FISCAL (previsión de la declaración de la renta) — carga PEREZOSA. El bloque fiscal es
  // SIEMPRE del año completo (la declaración es anual); respeta `?year=` si se pasa. Reutiliza el mismo
  // motor que /finanzas/fiscal (`getResumenFinanciero` año completo + `calcularEstadoDeclaracion`).
  if (tab === 'fiscal') {
    const anioFiscal = parseInt(params.year || '') || new Date().getFullYear()
    const resumenAnual = await safe(getResumenFinanciero(session.id, anioFiscal, 0), null)
    const declaracion = resumenAnual
      ? await safe(calcularEstadoDeclaracion(session.id, anioFiscal, resumenAnual), null)
      : null
    return (
      <Pagina ancho="lectura">
        <MiniChatContable periodoLabel={`${anioFiscal}`} />
        <div style={{ margin: '4px 0 22px' }}><SegTabs active="fiscal" /></div>
        <FiscalResumen fiscal={resumenAnual?.fiscal ?? null} declaracion={declaracion} year={anioFiscal} />
      </Pagina>
    )
  }

  // 🏠 Segmento PERSONAL (en qué se gasta el día a día) — carga PEREZOSA. Reutiliza tal cual
  // `CategoriasTab` (la pestaña "En qué gasto" de /finanzas): dona + tabla por subcategoría + drill-down
  // por comercio/movimiento + alertas de presupuesto. El componente gestiona su propio filtro de fechas
  // (mes actual por defecto), así que aquí solo hace falta pasarle el año en curso.
  if (tab === 'personal') {
    return (
      <Pagina ancho="tabla">
        <MiniChatContable periodoLabel={`${new Date().getFullYear()}`} />
        <div style={{ margin: '4px 0 22px' }}><SegTabs active="personal" /></div>
        <CategoriasTab year={new Date().getFullYear()} month={0} />
      </Pagina>
    )
  }

  // 💶 Segmento DINERO — periodo por defecto el MES EN CURSO (mismo patrón que la radiografía).
  const now = new Date()
  // Saneo de fechas de la URL: solo se aceptan fechas ISO REALES (YYYY-MM-DD válidas). Un valor basura
  // (?desde=hoy, ?desde=2025-13-45) se descarta → nunca llega al cast `::date` del SQL, que reventaría
  // toda la página con un 500 (listarMovimientosLedger no está envuelta en safe()).
  const fechaValida = (s: string): boolean => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
    const [y, m, d] = s.split('-').map(Number)
    const dt = new Date(y, m - 1, d)
    return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d
  }
  const year = parseInt(params.year || '') || now.getFullYear()
  const quarter = Math.min(4, Math.max(0, parseInt(params.quarter || '0') || 0))
  let desde = params.desde && fechaValida(params.desde) ? params.desde : ''
  let hasta = params.hasta && fechaValida(params.hasta) ? params.hasta : ''
  const sinFiltro = !params.year && !params.quarter && !desde
  if (sinFiltro) {
    const mm = String(now.getMonth() + 1).padStart(2, '0')
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    desde = `${now.getFullYear()}-${mm}-01`
    hasta = `${now.getFullYear()}-${mm}-${lastDay}`
  } else if (!desde && !hasta) {
    // Año/Trimestre: el IntervaloSelector solo pone `?year=&quarter=`. Derivamos el rango aquí para que
    // el LIBRO de movimientos y el P&L de pisos respeten el periodo (antes solo Mes/Rango rellenaban
    // desde/hasta → en Trimestre/Año el libro mostraba TODO el histórico y los pisos el mes en curso).
    if (quarter === 0) {
      desde = `${year}-01-01`; hasta = `${year}-12-31`
    } else {
      const mIni = (quarter - 1) * 3 + 1, mFin = mIni + 2
      const lastDay = new Date(year, mFin, 0).getDate()
      desde = `${year}-${String(mIni).padStart(2, '0')}-01`
      hasta = `${year}-${String(mFin).padStart(2, '0')}-${lastDay}`
    }
  }
  const periodo: Periodo = { year, quarter, desde, hasta }
  const etiquetaPeriodo = periodoLabel(periodo)
  // El P&L por piso (getPLMensual) es MENSUAL: solo tiene sentido si el periodo es UN mes natural.
  // En trimestre/año/rango multi-mes NO se pinta la rejilla mensual (el agregado de pisos ya sale en
  // ResumenPeriodo → tarjeta «Negocios»), y así no se muestra un mes suelto como si fuera el trimestre.
  const esMesUnico = !!desde && desde.slice(0, 7) === hasta.slice(0, 7)
  const mesPL = (desde || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`).slice(0, 7)

  const [sociedades, saldo, ledger, ingresosRevisar, tesoreria, porRevisar, duplicados, dupResueltos, resumen, plPisos, evolucion, brokerSaldos, feedPsd2] = await Promise.all([
    prisma.sociedad.findMany({ where: { cuentaId: session.id }, orderBy: { createdAt: 'asc' }, select: { id: true, nombre: true } }),
    getSaldoConsolidado(session.id),
    listarMovimientosLedger(session.id, { desde: desde || undefined, hasta: hasta || undefined }, 50, 0),
    listarIngresosPorRevisar(session.id),
    getTesoreria(session.id),
    listarPorRevisar(session.id),
    getDuplicadosSospechosos(session.id),
    getDuplicadosResueltos(session.id),
    safe(getResumenFinanciero(session.id, year, quarter, desde || undefined, hasta || undefined), null),
    esMesUnico ? safe(getPLMensual(mesPL), null) : null,
    safe(getEvolucionMensual(session.id, 12), []),
    safe(getBrokerSaldos(session.id), []),
    safe(getEstadoFeedPsd2(session.id), null),
  ])

  // El saldo del bróker (IBKR, refrescado por el agente `trading-analista`) suma al total del grupo
  // y se pinta como una tarjeta más junto a las bancarias.
  const brokerTotal = brokerSaldos.reduce((acc, b) => acc + b.saldo, 0)
  const totalGrupo = saldo.total + brokerTotal
  const hayCuentas = saldo.cuentas.length > 0 || brokerSaldos.length > 0

  return (
    <Pagina ancho="tabla">

        {/* 🤖 Pregúntale a tus cuentas — el agente contable, ARRIBA DEL TODO (encima de las pestañas) */}
        <MiniChatContable periodoLabel={etiquetaPeriodo} />

        {/* Inicio unificado: 💶 Dinero (saldos + movimientos + IA) | 🏢 Negocios (holding). */}
        <div style={{ margin: '4px 0 22px' }}><SegTabs active="dinero" /></div>

        <div className="banca-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '24px' }}>
          {/* El saldo se pinta con su botón 👁 (SaldoTotal.tsx): desenfoca la cifra para poder
              enseñar el panel sin que se lea, y recuerda la elección entre visitas. */}
          <div style={{ minWidth: 0 }}>
            <div className="migas">Inicio · Dinero · {etiquetaPeriodo}</div>
            <SaldoTotal texto={fmtEur(totalGrupo)} positivo={totalGrupo >= 0} />
          </div>
          <div className="banca-acciones" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            {saldo.cuentas.length > 0 && <MovimientosBtn />}
            <AccionesBanca
              anadir={<>
                <ImportarExtractoBtn sociedades={sociedades} />
                <ConectarBancoBtn sociedades={sociedades} />
              </>}
              mas={<>
                {saldo.cuentas.length > 0 && <ReanalizarBtn />}
                {saldo.cuentas.length > 0 && <ConciliarBtn />}
                {saldo.cuentas.length > 0 && <SubirFacturaBtn />}
                {saldo.cuentas.length > 0 && <ExportarBtn />}
                <RevisarCorreoBtn />
              </>}
            />
          </div>
        </div>

        {/* Estado del feed bancario PSD2 (Enable Banking): frescura de movimientos + caducidad del
            consentimiento + avisos del último sync. Tres estados (lib/psd2-semaforo.ts) — un feed
            que lleva días a cero no se pinta «en verde» aunque el cron corra (incidente 11-16/08). */}
        {feedPsd2 && (
          <section style={{ marginBottom: '16px' }}>
            <div style={{
              background: feedPsd2.estado.nivel === 'ok' ? 'var(--surface)' : feedPsd2.estado.nivel === 'atencion' ? 'var(--warning-bg)' : 'var(--negative-bg)',
              border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '10px 14px', fontSize: '13px',
            }}>
              <div style={{ fontWeight: 700 }}>
                {feedPsd2.estado.nivel === 'ok' ? '🟢' : feedPsd2.estado.nivel === 'atencion' ? '🟠' : '🔴'} {feedPsd2.estado.titular}
              </div>
              {feedPsd2.estado.nivel !== 'ok' && feedPsd2.estado.detalles.map((d, i) => (
                <div key={i} style={{ marginTop: '4px', color: 'var(--text)' }}>• {d}</div>
              ))}
              {/* Las notas ℹ️ se pintan TAMBIÉN en verde: dicen desde cuándo hay datos de verdad
                  («el banco rechazó la ventana de 89 días»), y esconderlas bajo un 🟢 hace leer el
                  hueco anterior como «no hubo movimientos» (21/08/2026). */}
              {feedPsd2.estado.notas.map((n, i) => (
                <div key={`nota-${i}`} style={{ marginTop: '4px', color: 'var(--text)' }}>{n}</div>
              ))}
              <div style={{ marginTop: '4px', fontSize: '12px', color: 'var(--muted)' }}>
                {feedPsd2.cuentas.map(c => `${c.banco || 'Banco'} ${c.mascara || ''}: último mov. ${c.ultimoMov ?? 'ninguno'}`).join(' · ')}
                {feedPsd2.estado.nivel === 'ok' && feedPsd2.estado.detalles[0] ? ` · ${feedPsd2.estado.detalles[0]}` : ''}
              </div>
              <SyncPsd2Btn />
            </div>
          </section>
        )}

        {/* Cuentas por sociedad */}
        {!hayCuentas ? (
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
                  <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 9, background: 'var(--primary-light)', color: 'var(--primary)', marginBottom: 10 }}>
                    <Landmark size={16} strokeWidth={1.75} aria-hidden />
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 600 }}>{c.sociedadNombre}</div>
                  <div style={{ fontWeight: 700, fontSize: '15px', marginTop: '2px' }}>
                    {c.banco || 'Banco'} {c.ibanMascara || ''}
                    {c.sincronizada && <span title="Sincronizada automáticamente (PSD2)" style={{ marginLeft: '6px', fontSize: '12px' }}>🔄</span>}
                  </div>
                  <div style={{ fontSize: '22px', fontWeight: 800, marginTop: '10px', color: c.saldoActual == null ? 'var(--muted)' : colorImporte(c.saldoActual) }}>
                    <Dato valor={c.saldoActual} pendiente="Sin informar" donde="el portal del banco">
                      {fmtEur(c.saldoActual ?? 0)}
                    </Dato>
                  </div>
                  {c.saldoFecha && <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>a {c.saldoFecha}</div>}
                </div>
              ))}
              {/* Bróker (Interactive Brokers): una tarjeta más, igual que las bancarias. La refresca el
                  agente `trading-analista` a diario (la app no habla con IBKR). */}
              {brokerSaldos.map(b => (
                <div key={`broker-${b.broker}`} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '18px', boxShadow: 'var(--shadow)', position: 'relative' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 9, background: 'var(--primary-light)', color: 'var(--primary)', marginBottom: 10 }}>
                    <TrendingUp size={16} strokeWidth={1.75} aria-hidden />
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 600 }}>Inversión</div>
                  <div style={{ fontWeight: 700, fontSize: '15px', marginTop: '2px' }}>{b.broker}</div>
                  <div style={{ fontSize: '22px', fontWeight: 800, marginTop: '10px', color: colorImporte(b.saldo) }}>
                    {fmtEur(b.saldo)}
                  </div>
                  {b.actualizado && <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>a {b.actualizado}</div>}
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
                      <div style={{ fontSize: '22px', fontWeight: 800, marginTop: '10px', color: c.saldoActual == null ? 'var(--muted)' : colorImporte(c.saldoActual) }}>
                        <Dato valor={c.saldoActual} pendiente="Sin informar" donde="el portal del banco">
                      {fmtEur(c.saldoActual ?? 0)}
                    </Dato>
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
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '2px 0' }}><span style={{ color: 'var(--muted)' }}>Ingresos</span><strong style={{ color: 'var(--positive)' }}>{eur(p.ingresos)}</strong></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '2px 0' }}><span style={{ color: 'var(--muted)' }}>Gastos</span><strong style={{ color: 'var(--negative)' }}>{eur(p.gastos.total)}</strong></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '4px 0', marginTop: '4px', borderTop: '1px solid var(--border)' }}>
                    <span style={{ fontWeight: 600 }}>Resultado</span>
                    <strong style={{ color: colorImporte(p.resultado) }}>{eur(p.resultado)} <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 500 }}>({p.margen.toFixed(0)}%)</span></strong>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Atención + LIBRO de movimientos (SUBIDOS: es lo que más se usa) ───────────────────
            Las bandejas accionables y el libro completo van justo tras el resumen del periodo, antes
            que los paneles secundarios de IA (que ahora quedan plegados más abajo). Así en móvil llegas
            a tus movimientos sin scrollear media pantalla. */}

        {/* Posibles cargos duplicados — el dueño los resuelve */}
        <DuplicadosBandeja grupos={duplicados} resueltos={dupResueltos} />

        {/* Por revisar (IA dudó del NEGOCIO) — el dueño lo asigna con un toque y aprende regla */}
        {porRevisar.length > 0 && (
          <RevisarBandeja
            movimientos={porRevisar.map(m => ({
              id: m.id,
              fecha: m.fechaOperacion,
              concepto: m.conceptoNormalizado || m.concepto || m.contraparte || 'Movimiento',
              importe: m.importe,
            }))}
            destinoLabel={DESTINO_LABEL}
          />
        )}

        {/* Ingresos por revisar: abonos con negocio sin confirmar (el dueño les asigna el negocio) */}
        {ingresosRevisar.length > 0 && (
          <IngresosPorRevisar destinoLabel={DESTINO_LABEL} ingresos={ingresosRevisar} />
        )}

        {/* Libro COMPLETO de movimientos: por defecto el periodo elegido; filtros (cuenta, fechas,
            signo, texto) + badge deducible por fila + paginación de servidor. "Limpiar" = ver todo. */}
        {saldo.cuentas.length > 0 && (
          <div id="libro-movimientos" style={{ scrollMarginTop: '20px' }}>
            <MovimientosTabla
              destinoLabel={DESTINO_LABEL}
              cuentas={saldo.cuentas.filter(c => !c.oculta).map(c => ({
                id: c.id,
                label: `${c.banco || 'Banco'} ${c.ibanMascara || ''}`.trim(),
                sincronizada: c.sincronizada,
              }))}
              initial={ledger}
              periodo={{ desde, hasta }}
            />
          </div>
        )}

        {/* ── Análisis y herramientas IA — PLEGADO por defecto (montaje perezoso) ────────────────
            Todo esto es "bajo demanda" y secundario frente a los movimientos: se agrupa aquí para no
            tapar la operativa. Se despliega con un toque. */}
        <Plegable titulo="🤖 Análisis y herramientas IA">
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

          {/* Cargos raros / antifraude: reglas deterministas sobre los cargos del periodo (bajo demanda) */}
          {saldo.cuentas.length > 0 && <Antifraude desde={desde} hasta={hasta} periodoLabel={etiquetaPeriodo} />}

          {/* Tickets de súper: sube la foto, la IA lee las líneas (base del comparador de precios) */}
          {saldo.cuentas.length > 0 && <TicketsSuper />}

          {/* Previsión de tesorería (F5) */}
          {tesoreria.recurrentes.length > 0 && (
            <section style={{ marginBottom: '32px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '14px' }}>📈 Previsión de tesorería</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '16px' }}>
                {tesoreria.proyecciones.map(p => (
                  <div key={p.dias} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '18px', boxShadow: 'var(--shadow)' }}>
                    <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 600 }}>Saldo proyectado · {p.dias} días</div>
                    <div style={{ fontSize: '22px', fontWeight: 800, marginTop: '6px', color: colorImporte(p.proyectado) }}>{fmtEur(p.proyectado)}</div>
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
                    <div style={{ fontSize: '14px', fontWeight: 700, color: colorImporte(r.importeMedio), flexShrink: 0, width: '92px', textAlign: 'right' }}>{fmtEur(r.importeMedio)}</div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Fugas en recurrentes: suscripciones/recibos a cancelar o renegociar (bajo demanda) */}
          {tesoreria.recurrentes.length > 0 && <FugasRecurrentes periodoLabel={etiquetaPeriodo} />}
        </Plegable>

        {/* Reglas aprendidas (transparencia): lo que el sistema aprendió al reclasificar, con borrar */}
        {saldo.cuentas.length > 0 && <ReglasAprendidas />}
      </Pagina>
  )
}
