import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { getResumenNegocio, fmtEur, type ResumenFinanciero } from '@/lib/financiero'
import { getSaldoConsolidado } from '@/lib/banca'
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

export default async function DashboardPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const anio = new Date().getFullYear()

  const sociedades = await prisma.sociedad.findMany({
    where: { cuentaId: session.id },
    include: { negocios: { orderBy: { createdAt: 'asc' } } },
    orderBy: { createdAt: 'asc' },
  })

  // Saldo bancario consolidado + strip hoy
  const [saldo, stripHoy] = await Promise.all([
    getSaldoConsolidado(session.id),
    getStripHoy(session.id),
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
        {/* KPI bar consolidado */}
        {(totalNegocios > 0 || saldo.cuentas.length > 0) && (
          <div style={{
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

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '16px' }}>
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
