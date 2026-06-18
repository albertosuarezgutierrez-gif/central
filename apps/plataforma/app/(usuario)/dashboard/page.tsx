import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { getResumenNegocio, fmtEur, type ResumenFinanciero } from '@/lib/financiero'
import { getSaldoConsolidado, getEvolucionMensual, getComparativaMensual, getGastosPorCategoria, getAlertas, type MesEvolucion, type ComparativaMes, type GastoCategoria, type Alertas } from '@/lib/banca'
import { CATEGORIA_LABEL, type Categoria } from '@/lib/categorizar'
import { NuevaSociedadBtn, NuevoNegocioBtn, EliminarSociedadBtn, EliminarNegocioBtn, EditarSociedadBtn, EditarNegocioBtn } from './GestionSociedad'

async function getStripHoy(cuentaId: string) {
  const hoy = new Date().toISOString().slice(0, 10)
  const [checkIns, checkOuts, movsHoy] = await Promise.all([
    prisma.$queryRaw<Array<{ guestName: string | null }>>`
      SELECT "guestName" FROM incomes WHERE "checkIn"::date = ${hoy}::date ORDER BY "checkIn" LIMIT 10`,
    prisma.$queryRaw<Array<{ guestName: string | null }>>`
      SELECT "guestName" FROM incomes WHERE "checkOut"::date = ${hoy}::date ORDER BY "checkOut" LIMIT 10`,
    prisma.$queryRaw<Array<{ importe: number; descripcion: string | null }>>`
      SELECT mb.importe::float AS importe,
             coalesce(mb.concepto_normalizado, mb.concepto, mb.contraparte) AS descripcion
      FROM movimientos_bancarios mb
      JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
      JOIN sociedades s ON s.id = cb.sociedad_id
      WHERE s.cuenta_id = ${cuentaId}::uuid AND mb.fecha_operacion::date = ${hoy}::date
      ORDER BY abs(mb.importe) DESC LIMIT 10`,
  ])
  const entradas = checkIns.length
  const salidas = checkOuts.length
  const ingresos = movsHoy.filter(m => m.importe > 0).reduce((s, m) => s + m.importe, 0)
  const gastos = movsHoy.filter(m => m.importe < 0).reduce((s, m) => s + Math.abs(m.importe), 0)
  return { entradas, salidas, movimientos: movsHoy.length, ingresos, gastos, movs: movsHoy }
}

async function getProximasLlegadas() {
  const today = new Date().toISOString().slice(0, 10)
  const limit = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
  return prisma.$queryRaw<Array<{
    propertyId: string; propertyName: string | null; guestName: string | null
    checkIn: string; checkOut: string; portal: string | null; amount: number; nights: number | null
  }>>`
    SELECT i."propertyId" AS "propertyId", p.name AS "propertyName",
           i."guestName", i."checkIn"::date::text AS "checkIn", i."checkOut"::date::text AS "checkOut",
           i.portal, i.amount::float, i.nights
    FROM incomes i
    LEFT JOIN properties p ON p.id = i."propertyId"
    WHERE i."checkIn"::date >= ${today}::date
      AND i."checkIn"::date <= ${limit}::date
      AND i."propertyId" NOT LIKE '%personal%'
    ORDER BY i."checkIn" ASC
    LIMIT 10
  `
}

const PROP_COLORS: Record<string, string> = {
  prop_house_sevillana: '#84cc16', prop_busto_reform: '#f59e0b',
  prop_duplex_center: '#10b981', prop_luxury_busto: '#ef4444',
  prop_multi_apartamentos: '#8b5cf6',
}
const PORTAL_BADGE: Record<string, string> = { AIRBNB: '#FF5A5F', BOOKING: '#003580', VRBO: '#1D3C6E', DIRECTO: '#7c3aed' }

const SECTOR_LABEL: Record<string, string> = {
  hosteleria:  '🍽️ Hostelería',
  limpieza:    '🧹 Limpieza',
  inmobiliario: '🏠 Inmobiliario',
}

const APP_URL: Record<string, string> = {
  'ia-rest': process.env.IAREST_URL  || 'https://iarest.es',
  ialimp:    process.env.IALIMP_URL  || 'https://app.ialimp.es',
  sivra:     process.env.SIVRA_URL   || '#',
}

// Degradación elegante: la BD compartida (Supabase) puede dar timeouts puntuales bajo
// carga. Sin esto, un único query lento dentro del Promise.all reventaba TODA la página
// con un 500 (síntoma observado: el mismo /dashboard unas veces 200 y otras 500). Ahora
// cada fuente cae a un valor vacío y el panel se pinta parcial en vez de romperse.
async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try { return await p } catch (e) { console.error('[dashboard] fallo cargando datos, degradando:', e); return fallback }
}

export default async function DashboardPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const anio = new Date().getFullYear()

  // El tipo del fallback se infiere del propio query (Awaited<typeof query>) para que
  // conserve el `include: { negocios }`; con ReturnType<typeof findMany> se perdía la
  // relación y `soc.negocios` no existía en el tipo.
  const sociedadesQuery = prisma.sociedad.findMany({
    where: { cuentaId: session.id },
    include: { negocios: { orderBy: { createdAt: 'asc' } } },
    orderBy: { createdAt: 'asc' },
  })
  const sociedades = await safe(sociedadesQuery, [] as Awaited<typeof sociedadesQuery>)

  // Saldo + strip hoy + evolución + comparativa + gastos por categoría + alertas, cada uno
  // tolerante a fallos: un timeout de la BD compartida degrada a vacío en vez de tumbar la página.
  const [saldo, stripHoy, evolucion, comparativa, gastosCat, alertas, proximasLlegadas] = await Promise.all([
    safe(getSaldoConsolidado(session.id), { total: 0, porSociedad: [], cuentas: [] }),
    safe(getStripHoy(session.id), { entradas: 0, salidas: 0, movimientos: 0, ingresos: 0, gastos: 0, movs: [] as Array<{ importe: number; descripcion: string | null }> }),
    safe(getEvolucionMensual(session.id), [] as MesEvolucion[]),
    safe(getComparativaMensual(session.id), { actual: { ingresos: 0, gastos: 0, neto: 0 }, anterior: { ingresos: 0, gastos: 0, neto: 0 } }),
    safe(getGastosPorCategoria(session.id), [] as GastoCategoria[]),
    safe(getAlertas(session.id), { porRevisar: 0, duplicados: 0, duplicadosDetalle: [] }),
    safe(getProximasLlegadas(), [] as Array<{ propertyId: string; propertyName: string | null; guestName: string | null; checkIn: string; checkOut: string; portal: string | null; amount: number; nights: number | null }>),
  ])

  // Fetch financial summaries in parallel for all negocios
  const negociosConFinanciero = await Promise.all(
    sociedades.flatMap(soc =>
      soc.negocios.map(async neg => ({
        ...neg,
        sociedadId: soc.id,
        financiero: await getResumenNegocio(neg.app, neg.refExt, anio),
      }))
    )
  )

  // Totales consolidados
  const totalIngresos  = negociosConFinanciero.filter(n => n.financiero.disponible).reduce((s, n) => s + n.financiero.ingresosYtd, 0)
  const totalResultado = negociosConFinanciero.filter(n => n.financiero.disponible).reduce((s, n) => s + n.financiero.resultadoYtd, 0)
  const totalNegocios  = negociosConFinanciero.length

  // Group back by sociedad
  const sociedadesConNegocios = sociedades.map(soc => ({
    ...soc,
    negocios: negociosConFinanciero.filter(n => n.sociedadId === soc.id),
  }))

  return (
    <main style={{ maxWidth: '960px', margin: '0 auto', padding: '32px 24px' }}>
        <style>{`
          @media (max-width: 768px) {
            .dash-main { padding: 16px 12px !important; }
            .dash-kpi-bar { gap: 16px !important; padding: 14px 16px !important; }
            .dash-kpi-bar > * { min-width: 0; }
            .dash-negocios-grid { grid-template-columns: 1fr !important; }
            .dash-comparativa-row { gap: 16px !important; }
            .dash-gastos-label { width: 100px !important; }
          }
          @media (max-width: 480px) {
            .dash-kpi-bar { flex-direction: column !important; align-items: flex-start !important; }
            .dash-kpi-bar a { margin-left: 0 !important; }
          }
        `}</style>
        {/* KPI bar consolidado */}
        {(totalNegocios > 0 || saldo.cuentas.length > 0) && (
          <div className="dash-kpi-bar" style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', padding: '20px 24px',
            display: 'flex', gap: '32px', flexWrap: 'wrap', marginBottom: '32px',
            boxShadow: 'var(--shadow)', alignItems: 'center',
          }}>
            <KPI label={`Ingresos ${anio}`} value={fmtEur(totalIngresos)} color="var(--primary)" />
            <KPI
              label="Resultado"
              value={fmtEur(totalResultado)}
              color={totalResultado >= 0 ? '#16a34a' : '#dc2626'}
            />
            <KPI label="Negocios" value={String(totalNegocios)} color="var(--muted)" />
            <Link href="/banca" style={{ textDecoration: 'none', marginLeft: 'auto' }}>
              <KPI
                label="🏦 Saldo del grupo ↗"
                value={saldo.cuentas.length > 0 ? fmtEur(saldo.total) : 'Conectar banco'}
                color={saldo.cuentas.length > 0 ? (saldo.total >= 0 ? '#16a34a' : '#dc2626') : 'var(--primary)'}
              />
            </Link>
          </div>
        )}

        {/* Strip hoy */}
        {(stripHoy.entradas > 0 || stripHoy.salidas > 0 || stripHoy.movimientos > 0) && (
          <div style={{
            background: 'var(--primary-light)', border: '1px solid var(--primary)', borderRadius: 'var(--radius)',
            padding: '10px 16px', marginBottom: '20px',
            display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'center', fontSize: '13px',
          }}>
            <span style={{ fontWeight: 700, color: 'var(--primary)' }}>Hoy</span>
            {stripHoy.entradas > 0 && <span>🏨 <strong>{stripHoy.entradas}</strong> {stripHoy.entradas === 1 ? 'entrada' : 'entradas'}</span>}
            {stripHoy.salidas > 0 && <span>🚪 <strong>{stripHoy.salidas}</strong> {stripHoy.salidas === 1 ? 'salida' : 'salidas'}</span>}
            {stripHoy.movimientos === 1 && (
              <span>🏦 {stripHoy.movs[0].descripcion || 'Movimiento'}
                <strong style={{ color: stripHoy.movs[0].importe >= 0 ? '#16a34a' : '#dc2626' }}> {fmtEur(stripHoy.movs[0].importe)}</strong>
              </span>
            )}
            {stripHoy.movimientos > 1 && (
              <span>🏦 <strong>{stripHoy.movimientos}</strong> movimientos: {stripHoy.movs.slice(0, 2).map(m => m.descripcion).filter(Boolean).join(', ')}{stripHoy.movimientos > 2 ? '…' : ''}
                {stripHoy.ingresos > 0 && <span style={{ color: '#16a34a' }}> +{fmtEur(stripHoy.ingresos)}</span>}
                {stripHoy.gastos > 0 && <span style={{ color: '#dc2626' }}> −{fmtEur(stripHoy.gastos)}</span>}
              </span>
            )}
          </div>
        )}

        {/* Widget próximas llegadas pisos */}
        {proximasLlegadas.length > 0 && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 18px', marginBottom: '20px', boxShadow: 'var(--shadow)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>🏠 Esta semana en los pisos</span>
              <Link href="/sivra/calendario" style={{ fontSize: 11, color: 'var(--primary)', textDecoration: 'none', fontWeight: 600 }}>Ver calendario →</Link>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {proximasLlegadas.map((inc, i) => {
                const today = new Date().toISOString().slice(0, 10)
                const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
                const isToday = inc.checkIn === today
                const isTomorrow = inc.checkIn === tomorrow
                const [, m, d] = inc.checkIn.split('-')
                const nights = inc.nights ?? Math.round((new Date(inc.checkOut).getTime() - new Date(inc.checkIn).getTime()) / 86400000)
                const propColor = PROP_COLORS[inc.propertyId] ?? '#94a3b8'
                const portalBg = PORTAL_BADGE[inc.portal ?? ''] ?? '#64748b'
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6, background: isToday ? 'var(--primary-light)' : 'transparent', minWidth: 0 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: propColor, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: isToday ? 'var(--primary)' : 'var(--muted)', width: 30, flexShrink: 0 }}>
                      {isToday ? 'HOY' : isTomorrow ? 'MÑN' : `${d}/${m}`}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--muted)', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 90 }}>
                      {(inc.propertyName ?? inc.propertyId).replace('prop_', '').replace(/_/g, ' ')}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                      {inc.guestName ?? '—'}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--muted)', flexShrink: 0 }}>{nights}n</span>
                    {inc.portal && (
                      <span style={{ fontSize: 9, padding: '1px 4px', borderRadius: 3, background: portalBg, color: '#fff', fontWeight: 700, flexShrink: 0 }}>
                        {inc.portal.slice(0, 3)}
                      </span>
                    )}
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)', flexShrink: 0 }}>
                      {new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(inc.amount)}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Alertas accionables (por revisar, posibles duplicados) */}
        <AlertasBanner alertas={alertas} />

        {/* Comparativa este mes vs anterior */}
        {(comparativa.actual.ingresos > 0 || comparativa.actual.gastos > 0 || comparativa.anterior.ingresos > 0 || comparativa.anterior.gastos > 0) && (
          <Comparativa actual={comparativa.actual} anterior={comparativa.anterior} />
        )}

        {/* Gráfico evolución mensual (ingresos vs gastos del banco) */}
        {evolucion.length > 0 && <GraficoMensual data={evolucion} />}

        {/* En qué se va el dinero: desglose de gastos por categoría (año en curso) */}
        {gastosCat.length > 0 && <GastosPorCategoria data={gastosCat} />}

        {/* Welcome */}
        <div style={{ marginBottom: '28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <h1 style={{ fontSize: '22px', fontWeight: 700 }}>Hola, {session.nombre}</h1>
          <NuevaSociedadBtn />
        </div>

        {/* Empty state */}
        {sociedades.length === 0 && (
          <div style={{
            background: 'var(--surface)', border: '1px dashed var(--border)',
            borderRadius: 'var(--radius)', padding: '48px 24px',
            textAlign: 'center', color: 'var(--muted)',
          }}>
            <div style={{ fontSize: '40px', marginBottom: '16px' }}>🏗️</div>
            <p style={{ fontWeight: 600, fontSize: '16px', marginBottom: '8px' }}>Sin negocios configurados</p>
            <p style={{ fontSize: '14px' }}>Añade sociedades y negocios desde el SQL editor de Supabase.</p>
          </div>
        )}

        {/* Sociedades + negocios */}
        {sociedadesConNegocios.map(soc => (
          <section key={soc.id} style={{ marginBottom: '32px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: '17px', fontWeight: 700 }}>{soc.nombre}</h2>
              {soc.cif && (
                <span style={{ fontSize: '13px', color: 'var(--muted)', fontFamily: 'monospace' }}>
                  CIF {soc.cif}
                </span>
              )}
              <div style={{ marginLeft: 'auto', display: 'flex', gap: '4px', alignItems: 'center' }}>
                <NuevoNegocioBtn sociedadId={soc.id} />
                <EditarSociedadBtn id={soc.id} nombre={soc.nombre} cif={soc.cif} />
                <EliminarSociedadBtn id={soc.id} nombre={soc.nombre} />
              </div>
            </div>

            <div className="dash-negocios-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '16px' }}>
              {soc.negocios.map(neg => {
                const url = neg.app ? APP_URL[neg.app] : null
                const fin = neg.financiero
                return (
                  <div key={neg.id} style={{ position: 'relative' }}>
                    <NegocioCard neg={neg} fin={fin} url={url} anio={anio} />
                    <EditarNegocioBtn id={neg.id} nombre={neg.nombre} sector={neg.sector} app={neg.app} refExt={neg.refExt} />
                    <div style={{ position: 'absolute', top: '8px', right: '8px' }}>
                      <EliminarNegocioBtn id={neg.id} nombre={neg.nombre} />
                    </div>
                  </div>
                )
              })}

              {soc.negocios.length === 0 && (
                <div style={{
                  border: '1px dashed var(--border)', borderRadius: 'var(--radius)',
                  padding: '20px', color: 'var(--muted)', fontSize: '14px', textAlign: 'center',
                }}>Sin negocios</div>
              )}
            </div>
          </section>
        ))}
      </main>
  )
}

function NegocioCard({ neg, fin, url, anio }: {
  neg: { nombre: string; sector: string; app: string | null }
  fin: ResumenFinanciero
  url: string | null
  anio: number
}) {
  return (
    <a
      href={url || '#'}
      target={url && url !== '#' ? '_blank' : undefined}
      rel="noreferrer"
      style={{
        display: 'block',
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: '20px',
        boxShadow: 'var(--shadow)', textDecoration: 'none',
      }}
    >
      <div style={{ fontSize: '13px', color: 'var(--primary)', fontWeight: 600, marginBottom: '4px' }}>
        {SECTOR_LABEL[neg.sector] ?? `⚙️ ${neg.sector}`}
      </div>
      <div style={{ fontWeight: 700, fontSize: '16px', marginBottom: '2px' }}>{neg.nombre}</div>
      {neg.app && (
        <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '16px' }}>
          {neg.app}{url && url !== '#' ? ' ↗' : ''}
        </div>
      )}

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: '14px' }}>
        {fin.disponible ? (
          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
            <FinStat label={`Ingresos ${anio}`} value={fmtEur(fin.ingresosYtd)} />
            <FinStat label={`Gastos ${anio}`} value={fmtEur(fin.gastosYtd)} />
            <FinStat
              label="Resultado"
              value={fmtEur(fin.resultadoYtd)}
              color={fin.resultadoYtd >= 0 ? '#16a34a' : '#dc2626'}
            />
          </div>
        ) : (
          <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
            {fin.nota === 'BD separada' ? '📊 BD separada — próximamente' : '—'}
          </span>
        )}
      </div>
    </a>
  )
}

// Gráfico de barras mensual (server-side, CSS puro): ingresos (verde) vs gastos (rojo).
function GraficoMensual({ data }: { data: MesEvolucion[] }) {
  const max = Math.max(1, ...data.map(d => Math.max(d.ingresos, d.gastos)))
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  const etiqueta = (mes: string) => MESES[Number(mes.slice(5, 7)) - 1] || mes
  return (
    <section style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px', boxShadow: 'var(--shadow)', marginBottom: '28px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 700 }}>📊 Evolución mensual</h2>
        <div style={{ fontSize: '12px', color: 'var(--muted)', display: 'flex', gap: '12px' }}>
          <span><span style={{ color: '#16a34a' }}>■</span> Ingresos</span>
          <span><span style={{ color: '#dc2626' }}>■</span> Gastos</span>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '10px', height: '160px', overflowX: 'auto' }}>
        {data.map(d => {
          const neto = d.ingresos - d.gastos
          return (
            <div key={d.mes} style={{ flex: '1 0 36px', display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%' }}>
              <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: '3px', width: '100%', justifyContent: 'center' }}>
                <div title={`Ingresos ${fmtEur(d.ingresos)}`} style={{ width: '14px', height: `${Math.round((d.ingresos / max) * 100)}%`, minHeight: d.ingresos > 0 ? '2px' : 0, background: '#16a34a', borderRadius: '3px 3px 0 0' }} />
                <div title={`Gastos ${fmtEur(d.gastos)}`} style={{ width: '14px', height: `${Math.round((d.gastos / max) * 100)}%`, minHeight: d.gastos > 0 ? '2px' : 0, background: '#dc2626', borderRadius: '3px 3px 0 0' }} />
              </div>
              <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '6px', fontWeight: 600 }}>{etiqueta(d.mes)}</div>
              <div style={{ fontSize: '10px', fontWeight: 700, color: neto >= 0 ? '#16a34a' : '#dc2626' }}>{neto >= 0 ? '+' : ''}{Math.round(neto / 1000 * 10) / 10}k</div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

// Banner de alertas: lo que requiere acción del dueño (revisar categoría, posibles cargos
// duplicados). Si no hay nada, no renderiza.
function AlertasBanner({ alertas }: { alertas: Alertas }) {
  if (alertas.porRevisar === 0 && alertas.duplicados === 0) return null
  return (
    <div style={{
      background: '#fffbeb', border: '1px solid #f59e0b66', borderRadius: 'var(--radius)',
      padding: '12px 16px', marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '6px',
    }}>
      {alertas.porRevisar > 0 && (
        <Link href="/banca" style={{ fontSize: '13px', color: 'var(--text)', textDecoration: 'none', fontWeight: 600 }}>
          🔎 Tienes <strong>{alertas.porRevisar}</strong> {alertas.porRevisar === 1 ? 'movimiento' : 'movimientos'} por revisar →
        </Link>
      )}
      {alertas.duplicados > 0 && (
        <Link href="/banca#duplicados" style={{ fontSize: '13px', color: 'var(--text)', textDecoration: 'none' }}>
          ⚠️ <strong>{alertas.duplicados}</strong> {alertas.duplicados === 1 ? 'posible cargo duplicado' : 'posibles cargos duplicados'}
          {alertas.duplicadosDetalle.length > 0 && (
            <span style={{ color: 'var(--muted)' }}>
              {' '}— {alertas.duplicadosDetalle.map(d => `${d.concepto} (${fmtEur(d.importe)})`).join(', ')}
            </span>
          )}
          {' '}→
        </Link>
      )}
    </div>
  )
}

// Comparativa del mes en curso vs el mes anterior, con la variación (delta).
function Comparativa({ actual, anterior }: { actual: ComparativaMes; anterior: ComparativaMes }) {
  const delta = (a: number, b: number) => (b === 0 ? (a === 0 ? 0 : 100) : ((a - b) / Math.abs(b)) * 100)
  const filas: Array<{ label: string; a: number; b: number; buenoSiSube: boolean }> = [
    { label: 'Ingresos', a: actual.ingresos, b: anterior.ingresos, buenoSiSube: true },
    { label: 'Gastos', a: actual.gastos, b: anterior.gastos, buenoSiSube: false },
    { label: 'Neto', a: actual.neto, b: anterior.neto, buenoSiSube: true },
  ]
  return (
    <section style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px', boxShadow: 'var(--shadow)', marginBottom: '28px' }}>
      <h2 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '14px' }}>📅 Este mes vs. el anterior</h2>
      <div className="dash-comparativa-row" style={{ display: 'flex', gap: '28px', flexWrap: 'wrap' }}>
        {filas.map(f => {
          const d = delta(f.a, f.b)
          const sube = d >= 0
          const bueno = f.buenoSiSube ? sube : !sube
          const color = f.label === 'Neto' ? (f.a >= 0 ? '#16a34a' : '#dc2626') : 'var(--text)'
          return (
            <div key={f.label}>
              <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 500, marginBottom: '2px' }}>{f.label}</div>
              <div style={{ fontSize: '20px', fontWeight: 800, color }}>{fmtEur(f.a)}</div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: d === 0 ? 'var(--muted)' : (bueno ? '#16a34a' : '#dc2626') }}>
                {sube ? '▲' : '▼'} {Math.abs(Math.round(d))}% · antes {fmtEur(f.b)}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

// Desglose horizontal de gastos por categoría (año en curso). Barra proporcional al mayor.
function GastosPorCategoria({ data }: { data: GastoCategoria[] }) {
  const top = data.slice(0, 8)
  const max = Math.max(1, ...top.map(d => d.total))
  const totalAnio = data.reduce((s, d) => s + d.total, 0)
  return (
    <section style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px', boxShadow: 'var(--shadow)', marginBottom: '28px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 700 }}>💸 En qué se va el dinero</h2>
        <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Gastos {new Date().getFullYear()} · total {fmtEur(totalAnio)}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {top.map(d => (
          <div key={d.categoria} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className="dash-gastos-label" style={{ width: '140px', flexShrink: 0, fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {CATEGORIA_LABEL[d.categoria as Categoria] ?? d.categoria}
            </div>
            <div style={{ flex: 1, background: 'var(--bg)', borderRadius: '6px', height: '20px', overflow: 'hidden' }}>
              <div style={{ width: `${Math.round((d.total / max) * 100)}%`, height: '100%', background: 'var(--primary)', minWidth: '2px' }} />
            </div>
            <div style={{ width: '92px', flexShrink: 0, textAlign: 'right', fontSize: '13px', fontWeight: 700 }}>{fmtEur(d.total)}</div>
          </div>
        ))}
      </div>
    </section>
  )
}

function KPI({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 500, marginBottom: '2px' }}>{label}</div>
      <div style={{ fontSize: '22px', fontWeight: 800, color }}>{value}</div>
    </div>
  )
}

function FinStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: '14px', fontWeight: 700, color: color || 'var(--text)', marginTop: '2px' }}>{value}</div>
    </div>
  )
}
