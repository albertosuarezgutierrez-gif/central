import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { getResumenNegocio, manualFinanciero, fmtEur, type ResumenFinanciero } from '@/lib/financiero'
import { getConsolidadoIntercompany, type ResultadoConsolidado } from '@/lib/intercompany'
import { getSaldoConsolidado, getEvolucionMensual, getComparativaMensual, getGastosPorCategoria, getAlertas, getCuentasConMovimientos, getCobradoPisos, getTopGastosMes, type MesEvolucion, type ComparativaMes, type GastoCategoria, type Alertas, type CuentaConMovimientos, type MovReciente, type CobradoPisos, type GastoGrande } from '@/lib/banca'
import { getEstadoCobrosOTA } from '@/lib/sivra/cobros-ota-db'
import type { Pendiente } from '@/lib/sivra/cobros-ota'
import { getResumenPilar, type TrimPilar } from '@/lib/finanzas'
import { CATEGORIA_LABEL, type Categoria } from '@/lib/categorizar'
import { detectarCompania, claveReferencia } from '@/lib/correduria'
import { NuevaSociedadBtn, NuevoNegocioBtn, EliminarSociedadBtn, EliminarNegocioBtn, EditarSociedadBtn, EditarNegocioBtn } from './GestionSociedad'

// ─── helpers nuevos ────────────────────────────────────────────────────────────

async function getResumenCorreduria(cuentaId: string, anio: number) {
  const [rows, reglasRows] = await Promise.all([
    prisma.$queryRaw<Array<{
      concepto: string | null
      concepto_normalizado: string | null
      contraparte: string | null
      compania_seguros: string | null
      importe: unknown
    }>>`
      SELECT mb.concepto, mb.concepto_normalizado, mb.contraparte,
             mb.compania_seguros, mb.importe
      FROM movimientos_bancarios mb
      JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
      WHERE cb.cuenta_id = ${cuentaId}::uuid
        AND mb.destino = 'seguros'
        AND mb.importe > 0
        AND coalesce(mb.duplicado_estado, '') <> 'ignorado'
        AND EXTRACT(year FROM mb.fecha_operacion) = ${anio}
    `,
    prisma.$queryRaw<Array<{ clave: string; compania: string }>>`
      SELECT clave, compania FROM correduria_reglas WHERE cuenta_id = ${cuentaId}::uuid
    `,
  ])

  const reglas = new Map(reglasRows.map(r => [r.clave, r.compania]))
  const totals = new Map<string, { total: number; movs: number }>()

  for (const r of rows) {
    const compania = r.compania_seguros
      || reglas.get(claveReferencia(r.concepto) ?? '')
      || detectarCompania(r.concepto ?? '', r.concepto_normalizado ?? '', r.contraparte ?? '')
    const importe = Number(r.importe)
    const cur = totals.get(compania) ?? { total: 0, movs: 0 }
    totals.set(compania, { total: cur.total + importe, movs: cur.movs + 1 })
  }

  const porCompania = Array.from(totals.entries())
    .map(([compania, d]) => ({ compania, total: Math.round(d.total * 100) / 100, movs: d.movs }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 6)

  const total = rows.reduce((s, r) => s + Number(r.importe), 0)
  const movs = rows.length
  return { total: Math.round(total * 100) / 100, movs, porCompania }
}

// Desglose por piso del año: importe NETO (incomes.amount ya es neto de comisión OTA),
// noches y reservas, tanto del AÑO como del MES en curso. Las cifras del mes alimentan
// la ocupación (% de noches del mes) y el ADR (precio medio por noche).
async function getResumenPisosDash(anio: number) {
  return prisma.$queryRaw<Array<{
    propertyId: string; propertyName: string | null
    ingresosAnio: number; reservasAnio: number; nochesAnio: number
    ingresosMes: number; nochesMes: number; reservasMes: number
  }>>`
    SELECT
      i."propertyId",
      p.name AS "propertyName",
      SUM(i.amount)::float AS "ingresosAnio",
      COUNT(*)::int AS "reservasAnio",
      COALESCE(SUM(i.nights), 0)::int AS "nochesAnio",
      COALESCE(SUM(i.amount) FILTER (WHERE EXTRACT(month FROM i."checkIn") = EXTRACT(month FROM current_date)), 0)::float AS "ingresosMes",
      COALESCE(SUM(i.nights) FILTER (WHERE EXTRACT(month FROM i."checkIn") = EXTRACT(month FROM current_date)), 0)::int AS "nochesMes",
      COUNT(*) FILTER (WHERE EXTRACT(month FROM i."checkIn") = EXTRACT(month FROM current_date))::int AS "reservasMes"
    FROM incomes i
    LEFT JOIN properties p ON p.id = i."propertyId"
    WHERE EXTRACT(year FROM i."checkIn") = ${anio}
      AND i."propertyId" NOT LIKE '%personal%'
    GROUP BY i."propertyId", p.name
    ORDER BY SUM(i.amount) DESC
  `
}

async function getGastosSinClasificar(cuentaId: string, anio: number) {
  const rows = await prisma.$queryRaw<Array<{ total: number; importe: number }>>`
    SELECT
      COUNT(*)::int             AS total,
      SUM(ABS(mb.importe))::float AS importe
    FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    JOIN sociedades        s  ON s.id  = cb.sociedad_id
    WHERE s.cuenta_id = ${cuentaId}::uuid
      AND mb.requiere_revision = true
      AND mb.importe < 0
      AND EXTRACT(year FROM mb.fecha_operacion) = ${anio}
  `
  return rows[0] ?? { total: 0, importe: 0 }
}

// ──────────────────────────────────────────────────────────────────────────────

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

type Reserva = {
  propertyId: string; propertyName: string | null; guestName: string | null
  checkIn: string; checkOut: string; portal: string | null; amount: number; nights: number | null
}

// Reservas que SOLAPAN la ventana ±7 días (recientes + próximas), para verlas agrupadas por
// piso en la home. `amount` ya es el NETO de la reserva. Una estancia entra si su check-in es
// anterior a hoy+7 y su check-out posterior a hoy−7.
async function getReservasVentana(): Promise<Reserva[]> {
  return prisma.$queryRaw<Array<Reserva>>`
    SELECT i."propertyId" AS "propertyId", p.name AS "propertyName",
           i."guestName", i."checkIn"::date::text AS "checkIn", i."checkOut"::date::text AS "checkOut",
           i.portal, i.amount::float, i.nights
    FROM incomes i
    LEFT JOIN properties p ON p.id = i."propertyId"
    WHERE i."checkIn"::date <= (current_date + 7)
      AND i."checkOut"::date >= (current_date - 7)
      AND i."propertyId" NOT LIKE '%personal%'
    ORDER BY i."propertyId", i."checkIn" ASC
  `
}

// El siguiente Modelo 130 de Pilar (autónoma) cuyo plazo no ha vencido, con lo que tocaría
// ingresar. Devuelve null si Pilar no tiene actividad o no hay trimestre vivo con cobros.
async function getAvisoModelo130(cuentaId: string, anio: number): Promise<TrimPilar | null> {
  const r = await getResumenPilar(cuentaId, anio)
  if (!r.tieneExtracto) return null
  const siguiente = r.trimestres.find(t => t.estado !== 'pasado' && t.cobros > 0)
  return siguiente ?? null
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
  sivra:     '/sivra/income',  // consolidado dentro de plataforma (antes app externa SIVRA_URL)
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
  const [saldo, stripHoy, evolucion, comparativa, gastosCat, alertas, reservasVentana, correduria, pisos, gastosSinClasificar, cuentasMov, cobradoPisos, topGastos, estadoCobros, aviso130] = await Promise.all([
    safe(getSaldoConsolidado(session.id), { total: 0, porSociedad: [], cuentas: [] }),
    safe(getStripHoy(session.id), { entradas: 0, salidas: 0, movimientos: 0, ingresos: 0, gastos: 0, movs: [] as Array<{ importe: number; descripcion: string | null }> }),
    safe(getEvolucionMensual(session.id), [] as MesEvolucion[]),
    safe(getComparativaMensual(session.id), { actual: { ingresos: 0, gastos: 0, neto: 0 }, anterior: { ingresos: 0, gastos: 0, neto: 0 } }),
    safe(getGastosPorCategoria(session.id), [] as GastoCategoria[]),
    safe(getAlertas(session.id), { porRevisar: 0, sinJustificante: 0, duplicados: 0, duplicadosDetalle: [], facturasFaltantes: 0, cobrosPendientes: 0, cobrosPendientesEur: 0, cobrosDetalle: [] }),
    safe(getReservasVentana(), [] as Reserva[]),
    safe(getResumenCorreduria(session.id, anio), { total: 0, movs: 0, porCompania: [] as Array<{ compania: string; total: number; movs: number }> }),
    safe(getResumenPisosDash(anio), [] as Awaited<ReturnType<typeof getResumenPisosDash>>),
    safe(getGastosSinClasificar(session.id, anio), { total: 0, importe: 0 }),
    safe(getCuentasConMovimientos(session.id, 2), [] as CuentaConMovimientos[]),
    safe(getCobradoPisos(session.id, anio), { mes: { duplex: 0, pisos: 0, total: 0 }, ytd: { duplex: 0, pisos: 0, total: 0 } } as CobradoPisos),
    safe(getTopGastosMes(session.id, 5), [] as GastoGrande[]),
    safe(getEstadoCobrosOTA(session.id), { hayDescuadre: false, pendientes: [] as Pendiente[], huerfanos: [], pendientesEur: 0, huerfanosEur: 0 }),
    safe(getAvisoModelo130(session.id, anio), null as TrimPilar | null),
  ])

  // Fetch financial summaries in parallel for all negocios
  const negociosConFinanciero = await Promise.all(
    sociedades.flatMap(soc =>
      soc.negocios.map(async neg => ({
        ...neg,
        sociedadId: soc.id,
        // Con app → resumen real de la vertical; sin app pero con cifras manuales → esas cifras.
        financiero: neg.app
          ? await getResumenNegocio(neg.app, neg.refExt, anio)
          : manualFinanciero(
              neg.ingresosManual != null ? Number(neg.ingresosManual) : null,
              neg.gastosManual != null ? Number(neg.gastosManual) : null,
            ),
      }))
    )
  )

  // Totales consolidados
  const totalIngresos  = negociosConFinanciero.filter(n => n.financiero.disponible).reduce((s, n) => s + n.financiero.ingresosYtd, 0)
  const totalResultado = negociosConFinanciero.filter(n => n.financiero.disponible).reduce((s, n) => s + n.financiero.resultadoYtd, 0)
  const totalNegocios  = negociosConFinanciero.length

  // Consolidado intercompany (capa ADITIVA, independiente del cálculo de arriba): elimina las
  // operaciones facturadas ENTRE sociedades del propio holding. Tolera tabla ausente / sin
  // operaciones → el consolidado coincide con la suma bruta y la tarjeta no se muestra.
  const consolidadoIC = await safe(
    getConsolidadoIntercompany(
      session.id,
      anio,
      negociosConFinanciero
        .filter(n => n.financiero.disponible)
        .map(n => ({
          sociedadId: n.sociedadId,
          ingresos: n.financiero.ingresosYtd,
          gastos: n.financiero.gastosYtd,
          disponible: true,
        })),
      sociedades.map(s => s.id), // holding = TODAS las sociedades de la cuenta (aunque reporten 0)
    ),
    null as ResultadoConsolidado | null,
  )
  const hayIntercompany = !!consolidadoIC && consolidadoIC.eliminaciones.ingresos > 0

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

        {/* Consolidado intercompany (holding) — solo si hay operaciones internas */}
        {hayIntercompany && consolidadoIC && (
          <IntercompanyCard
            consolidado={consolidadoIC}
            nombrePorSociedad={Object.fromEntries(sociedades.map(s => [s.id, s.nombre]))}
            anio={anio}
          />
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

        {/* Aviso fiscal: próximo Modelo 130 de Pilar (autónoma) */}
        {aviso130 && <AvisoModelo130 trim={aviso130} />}

        {/* Alertas accionables (por revisar, posibles duplicados) */}
        <AlertasBanner alertas={alertas} gastosSinClasificar={gastosSinClasificar} />

        {/* Saldo de cada cuenta bancaria + movimientos de los 2 últimos días */}
        {cuentasMov.length > 0 && <SaldoPorCuenta cuentas={cuentasMov} />}

        {/* Grid de widgets de negocio: Correduría · Apartamentos · Pendiente cobrar · Top gastos */}
        {(correduria.total > 0 || pisos.length > 0 || estadoCobros.hayDescuadre || topGastos.length > 0) && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px', marginBottom: '28px' }}>
            {correduria.total > 0 && <CorreduriaWidget data={correduria} anio={anio} />}
            {pisos.length > 0 && <PisosWidget pisos={pisos} cobrado={cobradoPisos} anio={anio} />}
            {estadoCobros.hayDescuadre && <PendienteCobrarWidget pendientes={estadoCobros.pendientes} totalEur={estadoCobros.pendientesEur} />}
            {topGastos.length > 0 && <TopGastosWidget gastos={topGastos} />}
          </div>
        )}

        {/* Reservas de cada piso (ventana ±7 días), agrupadas por piso, con neto */}
        {reservasVentana.length > 0 && <ReservasPorPiso reservas={reservasVentana} />}

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
          <>
            <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
              <FinStat label={`Ingresos ${anio}`} value={fmtEur(fin.ingresosHoy ?? fin.ingresosYtd)} />
              <FinStat label={`Gastos ${anio}`} value={fmtEur(fin.gastosYtd)} />
              <FinStat
                label="Resultado"
                value={fmtEur(fin.resultadoHoy ?? fin.resultadoYtd)}
                color={(fin.resultadoHoy ?? fin.resultadoYtd) >= 0 ? '#16a34a' : '#dc2626'}
              />
            </div>
            <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '8px' }}>
              A día de hoy · {new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
              {fin.ingresosHoy != null && fin.ingresosHoy !== fin.ingresosYtd && (
                <span> · Proyectado año: {fmtEur(fin.ingresosYtd)}</span>
              )}
            </div>
          </>
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
function AlertasBanner({ alertas, gastosSinClasificar }: {
  alertas: Alertas
  gastosSinClasificar: { total: number; importe: number }
}) {
  if (alertas.porRevisar === 0 && alertas.sinJustificante === 0 && alertas.duplicados === 0 && alertas.facturasFaltantes === 0 && alertas.cobrosPendientes === 0) return null
  return (
    <div style={{
      background: '#fffbeb', border: '1px solid #f59e0b66', borderRadius: 'var(--radius)',
      padding: '12px 16px', marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '6px',
    }}>
      {alertas.porRevisar > 0 && (
        <Link href="/finanzas?tab=gastos" style={{ fontSize: '13px', color: 'var(--text)', textDecoration: 'none', fontWeight: 600 }}>
          🔎 Tienes <strong>{alertas.porRevisar}</strong> {alertas.porRevisar === 1 ? 'gasto' : 'gastos'} por revisar
          {gastosSinClasificar.importe > 0 && (
            <span style={{ color: '#b45309', fontWeight: 700 }}> ({fmtEur(gastosSinClasificar.importe)} sin clasificar)</span>
          )}
          {' '}→
        </Link>
      )}
      {alertas.sinJustificante > 0 && (
        <Link href="/finanzas?tab=gastos" style={{ fontSize: '13px', color: 'var(--text)', textDecoration: 'none' }}>
          ❗ <strong>{alertas.sinJustificante}</strong> {alertas.sinJustificante === 1 ? 'gasto deducible sin justificante' : 'gastos deducibles sin justificante'} este año → Ver gastos
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
      {alertas.facturasFaltantes > 0 && (
        <Link href="/sivra/facturas-control" style={{ fontSize: '13px', color: 'var(--text)', textDecoration: 'none' }}>
          🗂️ <strong>{alertas.facturasFaltantes}</strong> {alertas.facturasFaltantes === 1 ? 'factura recurrente falta' : 'facturas recurrentes faltan'} del mes pasado → Ver facturas
        </Link>
      )}
      {alertas.cobrosPendientes > 0 && (
        <div style={{ fontSize: '13px', color: 'var(--text)' }}>
          💸 <strong>{fmtEur(alertas.cobrosPendientesEur)}</strong> sin cobrar de OTAs ({alertas.cobrosPendientes} {alertas.cobrosPendientes === 1 ? 'reserva' : 'reservas'} pasadas de plazo)
          {alertas.cobrosDetalle.length > 0 && (
            <> — {alertas.cobrosDetalle.map(c => `${c.guestName || c.reservationId} ${c.canal} (checkout ${c.checkOut.slice(8, 10)}/${c.checkOut.slice(5, 7)}, ${fmtEur(c.neto)})`).join(', ')}</>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Widget Correduría ─────────────────────────────────────────────────────────

function CorreduriaWidget({ data, anio }: {
  data: { total: number; movs: number; porCompania: Array<{ compania: string; total: number; movs: number }> }
  anio: number
}) {
  const top = data.porCompania.slice(0, 4)
  return (
    <Link href="/correduria" style={{ textDecoration: 'none', display: 'block' }}>
      <section style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
        padding: '18px 20px', boxShadow: 'var(--shadow)', cursor: 'pointer',
        transition: 'box-shadow .15s',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>🛡️ Correduría {anio}</span>
          <span style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 600 }}>Ver detalle →</span>
        </div>
        <div style={{ fontSize: 26, fontWeight: 800, color: '#16a34a', marginBottom: 4 }}>{fmtEur(data.total)}</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>{data.movs} cobros</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {top.map(c => (
            <div key={c.compania} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1, fontSize: 12, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.compania}</div>
              <div style={{ flexShrink: 0, background: 'var(--bg)', borderRadius: 4, height: 6, width: 60, overflow: 'hidden' }}>
                <div style={{ height: '100%', background: 'var(--primary)', width: `${Math.round((c.total / data.total) * 100)}%` }} />
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', flexShrink: 0, width: 72, textAlign: 'right' }}>{fmtEur(c.total)}</div>
            </div>
          ))}
        </div>
      </section>
    </Link>
  )
}

// ─── Widget Pisos ──────────────────────────────────────────────────────────────

const PROP_NAME_SHORT: Record<string, string> = {
  prop_house_sevillana: 'House sevillana',
  prop_busto_reform:    'Busto Reform',
  prop_duplex_center:   'Dúplex Center',
  prop_luxury_busto:    'Luxury Busto',
  prop_multi_apartamentos: 'Multi',
}
const PROP_COLORS2: Record<string, string> = {
  prop_house_sevillana: '#84cc16', prop_busto_reform: '#f59e0b',
  prop_duplex_center:   '#10b981', prop_luxury_busto: '#ef4444',
  prop_multi_apartamentos: '#8b5cf6',
}
// Días del mes en curso (para la ocupación mensual por piso).
const DIAS_MES = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()

type PisoDash = {
  propertyId: string; propertyName: string | null
  ingresosAnio: number; reservasAnio: number; nochesAnio: number
  ingresosMes: number; nochesMes: number; reservasMes: number
}

function PisosWidget({ pisos, cobrado, anio }: {
  pisos: PisoDash[]
  cobrado: CobradoPisos
  anio: number
}) {
  const totalAnio = pisos.reduce((s, p) => s + p.ingresosAnio, 0)
  return (
    <Link href="/apartamentos" style={{ textDecoration: 'none', display: 'block' }}>
      <section style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
        padding: '18px 20px', boxShadow: 'var(--shadow)', cursor: 'pointer',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>🏠 Apartamentos {anio}</span>
          <span style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 600 }}>Ver detalle →</span>
        </div>

        {/* Cobrado REAL en banco (conciliado): mes en curso y acumulado del año */}
        <div style={{ display: 'flex', gap: 20, marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 500 }}>Cobrado este mes</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#16a34a' }}>{fmtEur(cobrado.mes.total)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 500 }}>Cobrado {anio}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#16a34a' }}>{fmtEur(cobrado.ytd.total)}</div>
          </div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 14 }}>
          Año: Dúplex {fmtEur(cobrado.ytd.duplex)} · Pisos {fmtEur(cobrado.ytd.pisos)}
        </div>

        {/* Desglose por piso: facturación NETA de reservas (el banco no separa por piso) */}
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 6 }}>
          Facturado por piso (reservas) · mes / año
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {pisos.map(p => {
            const color = PROP_COLORS2[p.propertyId] ?? '#94a3b8'
            const nombre = PROP_NAME_SHORT[p.propertyId] ?? (p.propertyName ?? p.propertyId)
            const ocupMes = DIAS_MES > 0 ? Math.min(100, Math.round((p.nochesMes / DIAS_MES) * 100)) : 0
            const adrMes = p.nochesMes > 0 ? Math.round(p.ingresosMes / p.nochesMes) : 0
            return (
              <div key={p.propertyId} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {nombre}
                  <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 500 }}> · {ocupMes}% ocup{adrMes > 0 ? ` · ADR ${adrMes}€` : ''}</span>
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', flexShrink: 0, width: 64, textAlign: 'right' }}>{fmtEur(p.ingresosMes)}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0, width: 72, textAlign: 'right' }}>{fmtEur(p.ingresosAnio)}</div>
              </div>
            )
          })}
        </div>
        <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 8 }}>
          Facturado año: {fmtEur(totalAnio)} · {pisos.reduce((s, p) => s + p.reservasAnio, 0)} reservas
        </div>
      </section>
    </Link>
  )
}

// ─── Widget Saldo por cuenta ─────────────────────────────────────────────────────
// Una tarjeta por cuenta bancaria propia, con su saldo y los movimientos de los 2 últimos
// días al máximo detalle. Excluye las cuentas de Pilar (filtrado en la query).
const DESTINO_LABEL: Record<string, string> = {
  seguros: '🛡️ Seguros', turistico_pisos: '🏠 Pisos', turistico_duplex: '🏠 Dúplex',
  personal: '👤 Personal', traspaso_interno: '🔁 Traspaso', actividad_pilar: '🟣 Pilar',
}

function SaldoPorCuenta({ cuentas }: { cuentas: CuentaConMovimientos[] }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700 }}>🏦 Saldo por cuenta</h2>
        <Link href="/banca" style={{ fontSize: 11, color: 'var(--primary)', textDecoration: 'none', fontWeight: 600 }}>Ver banca →</Link>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
        {cuentas.map(c => (
          <div key={c.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 16px', boxShadow: 'var(--shadow)' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 2 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c.banco || c.alias || 'Cuenta'}{c.ibanMascara ? <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 500 }}> ·{c.ibanMascara}</span> : null}
              </span>
              <span style={{ fontSize: 18, fontWeight: 800, color: (c.saldoActual ?? 0) >= 0 ? '#16a34a' : '#dc2626', flexShrink: 0 }}>
                {c.saldoActual == null ? '—' : fmtEur(c.saldoActual)}
              </span>
            </div>
            <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 10 }}>
              {c.sociedadNombre}{c.saldoFecha ? ` · saldo a ${c.saldoFecha.slice(8, 10)}/${c.saldoFecha.slice(5, 7)}` : ''}
            </div>
            {c.movs.length === 0 ? (
              <div style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>Sin movimientos en 2 días</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {c.movs.map(m => <MovRow key={m.id} m={m} />)}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

function MovRow({ m }: { m: MovReciente }) {
  const fecha = m.fechaOperacion ? `${m.fechaOperacion.slice(8, 10)}/${m.fechaOperacion.slice(5, 7)}` : '—'
  const destino = m.destino ? DESTINO_LABEL[m.destino] ?? m.destino : null
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, minWidth: 0 }}>
      <span style={{ color: 'var(--muted)', flexShrink: 0, width: 34, fontVariantNumeric: 'tabular-nums' }}>{fecha}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {m.concepto || m.contraparte || 'Movimiento'}
          {m.requiereRevision && <span title="Por revisar"> 🔎</span>}
          {m.conciliado && <span title="Conciliado"> 🔗</span>}
        </div>
        <div style={{ fontSize: 10, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {[m.contraparte && m.contraparte !== m.concepto ? m.contraparte : null, destino].filter(Boolean).join(' · ')}
        </div>
      </div>
      <div style={{ flexShrink: 0, textAlign: 'right' }}>
        <div style={{ fontWeight: 700, color: m.importe >= 0 ? '#16a34a' : '#dc2626', fontVariantNumeric: 'tabular-nums' }}>{fmtEur(m.importe)}</div>
        {m.saldoPosterior != null && <div style={{ fontSize: 10, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{fmtEur(m.saldoPosterior)}</div>}
      </div>
    </div>
  )
}

// ─── Widget Reservas por piso (ventana ±7 días) ──────────────────────────────────
function ReservasPorPiso({ reservas }: { reservas: Reserva[] }) {
  const today = new Date().toISOString().slice(0, 10)
  // Agrupar por piso conservando el orden de mayor facturación reciente.
  const porPiso = new Map<string, Reserva[]>()
  for (const r of reservas) {
    if (!porPiso.has(r.propertyId)) porPiso.set(r.propertyId, [])
    porPiso.get(r.propertyId)!.push(r)
  }
  const grupos = [...porPiso.entries()].sort((a, b) =>
    b[1].reduce((s, r) => s + r.amount, 0) - a[1].reduce((s, r) => s + r.amount, 0))

  return (
    <section style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px 18px', marginBottom: 28, boxShadow: 'var(--shadow)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>🏠 Reservas por piso · ±7 días</span>
        <Link href="/sivra/calendario" style={{ fontSize: 11, color: 'var(--primary)', textDecoration: 'none', fontWeight: 600 }}>Ver calendario →</Link>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        {grupos.map(([propertyId, lista]) => {
          const color = PROP_COLORS2[propertyId] ?? '#94a3b8'
          const nombre = PROP_NAME_SHORT[propertyId] ?? (lista[0].propertyName ?? propertyId)
          const totalNeto = lista.reduce((s, r) => s + r.amount, 0)
          return (
            <div key={propertyId} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nombre}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#16a34a' }}>{fmtEur(totalNeto)}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {lista.map((r, i) => {
                  const nights = r.nights ?? Math.round((new Date(r.checkOut).getTime() - new Date(r.checkIn).getTime()) / 86400000)
                  const enCurso = r.checkIn <= today && r.checkOut > today
                  const portalBg = PORTAL_BADGE[r.portal ?? ''] ?? '#64748b'
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, minWidth: 0, background: enCurso ? 'var(--primary-light)' : 'transparent', borderRadius: 4, padding: '2px 4px' }}>
                      <span style={{ color: 'var(--muted)', flexShrink: 0, width: 34, fontVariantNumeric: 'tabular-nums' }}>{r.checkIn.slice(8, 10)}/{r.checkIn.slice(5, 7)}</span>
                      <span style={{ flex: 1, minWidth: 0, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.guestName ?? '—'}</span>
                      <span style={{ fontSize: 10, color: 'var(--muted)', flexShrink: 0 }}>{nights}n</span>
                      {r.portal && <span style={{ fontSize: 9, padding: '1px 4px', borderRadius: 3, background: portalBg, color: '#fff', fontWeight: 700, flexShrink: 0 }}>{r.portal.slice(0, 3)}</span>}
                      <span style={{ fontWeight: 700, color: 'var(--text)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{fmtEur(r.amount)}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ─── Widget Pendiente de cobrar (OTA) ────────────────────────────────────────────
function PendienteCobrarWidget({ pendientes, totalEur }: { pendientes: Pendiente[]; totalEur: number }) {
  const top = pendientes.slice(0, 5)
  return (
    <section style={{ background: 'var(--surface)', border: '1px solid #f59e0b66', borderRadius: 'var(--radius)', padding: '18px 20px', boxShadow: 'var(--shadow)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>💸 Pendiente de cobrar (OTA)</span>
        <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>{pendientes.length} {pendientes.length === 1 ? 'reserva' : 'reservas'}</span>
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color: '#b45309', marginBottom: 4 }}>{fmtEur(totalEur)}</div>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>estancias pasadas de plazo sin abono en banco</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {top.map(p => (
          <div key={p.reservationId} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            <span style={{ flex: 1, minWidth: 0, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.guestName ?? p.reservationId}</span>
            <span style={{ fontSize: 10, color: 'var(--muted)', flexShrink: 0 }}>{p.canal} · {p.checkOut.slice(8, 10)}/{p.checkOut.slice(5, 7)}</span>
            <span style={{ fontWeight: 700, color: 'var(--text)', flexShrink: 0 }}>{fmtEur(p.neto)}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

// ─── Widget Top gastos del mes ───────────────────────────────────────────────────
function TopGastosWidget({ gastos }: { gastos: GastoGrande[] }) {
  const mesLabel = new Date().toLocaleDateString('es-ES', { month: 'long' })
  return (
    <section style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '18px 20px', boxShadow: 'var(--shadow)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>🧾 Mayores gastos de {mesLabel}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {gastos.map(g => {
          const fecha = g.fechaOperacion ? `${g.fechaOperacion.slice(8, 10)}/${g.fechaOperacion.slice(5, 7)}` : '—'
          const destino = g.destino ? DESTINO_LABEL[g.destino] ?? g.destino : null
          return (
            <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, minWidth: 0 }}>
              <span style={{ color: 'var(--muted)', flexShrink: 0, width: 34, fontVariantNumeric: 'tabular-nums' }}>{fecha}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.concepto || g.contraparte || 'Gasto'}</div>
                {destino && <div style={{ fontSize: 10, color: 'var(--muted)' }}>{destino}</div>}
              </div>
              <span style={{ fontWeight: 700, color: '#dc2626', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{fmtEur(g.importe)}</span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ─── Aviso fiscal: Modelo 130 (Pilar autónoma) ───────────────────────────────────
function AvisoModelo130({ trim }: { trim: TrimPilar }) {
  const proximo = trim.estado === 'proximo'
  return (
    <Link href="/finanzas/pilar" style={{ textDecoration: 'none', display: 'block', marginBottom: 20 }}>
      <div style={{
        background: proximo ? '#fff7ed' : 'var(--primary-light)',
        border: `1px solid ${proximo ? '#f59e0b' : 'var(--primary)'}`,
        borderRadius: 'var(--radius)', padding: '12px 16px',
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 13,
      }}>
        <span style={{ fontWeight: 700, color: proximo ? '#b45309' : 'var(--primary)' }}>📅 Modelo 130 · {trim.q}T</span>
        <span style={{ color: 'var(--text)' }}>vence <strong>{trim.plazo}</strong></span>
        <span style={{ color: 'var(--text)' }}>· a ingresar <strong>{fmtEur(trim.pagoFraccionado)}</strong></span>
        {proximo && <span style={{ color: '#b45309', fontWeight: 700 }}>· ¡plazo próximo!</span>}
        <span style={{ marginLeft: 'auto', color: 'var(--primary)', fontWeight: 600 }}>Ver →</span>
      </div>
    </Link>
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

function IntercompanyCard({
  consolidado,
  nombrePorSociedad,
  anio,
}: {
  consolidado: ResultadoConsolidado
  nombrePorSociedad: Record<string, string>
  anio: number
}) {
  const { agregadoBruto, consolidado: real, eliminaciones } = consolidado
  // Sociedades con tráfico interno (lo que se factura/recibe dentro del grupo).
  const internas = consolidado.porSociedad
    .filter(s => s.ingresosIntercompany > 0 || s.gastosIntercompany > 0)
    .sort((a, b) => (b.ingresosIntercompany + b.gastosIntercompany) - (a.ingresosIntercompany + a.gastosIntercompany))
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', padding: '20px 24px', marginBottom: '32px',
      boxShadow: 'var(--shadow)',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '4px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text)' }}>🔗 Consolidado del holding {anio}</span>
        <span style={{ fontSize: '12px', color: 'var(--muted)' }}>elimina la facturación entre tus sociedades</span>
      </div>
      <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap', alignItems: 'center', margin: '14px 0' }}>
        <FinStat label="Ingresos (suma bruta)" value={fmtEur(agregadoBruto.ingresos)} />
        <span style={{ color: 'var(--muted)', fontSize: '18px' }}>−</span>
        <FinStat label="Intercompany eliminado" value={fmtEur(eliminaciones.ingresos)} color="#dc2626" />
        <span style={{ color: 'var(--muted)', fontSize: '18px' }}>=</span>
        <FinStat label="Ingresos reales del grupo" value={fmtEur(real.ingresos)} color="var(--primary)" />
        <FinStat
          label="Resultado del grupo"
          value={fmtEur(real.resultado)}
          color={real.resultado >= 0 ? '#16a34a' : '#dc2626'}
        />
      </div>
      <p style={{ fontSize: '12px', color: 'var(--muted)', margin: '0 0 12px' }}>
        El resultado no cambia al consolidar (el ingreso de una sociedad es el gasto de otra): lo que se
        deshincha es el doble conteo de ingresos y gastos internos.
      </p>
      {internas.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: '11px' }}>
              <th style={{ padding: '4px 8px 4px 0', fontWeight: 600 }}>Sociedad</th>
              <th style={{ padding: '4px 8px', fontWeight: 600, textAlign: 'right' }}>Facturado al grupo</th>
              <th style={{ padding: '4px 0 4px 8px', fontWeight: 600, textAlign: 'right' }}>Comprado al grupo</th>
            </tr>
          </thead>
          <tbody>
            {internas.map(s => (
              <tr key={s.sociedadId} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '6px 8px 6px 0' }}>{nombrePorSociedad[s.sociedadId] ?? s.sociedadId}</td>
                <td style={{ padding: '6px 8px', textAlign: 'right', color: '#16a34a' }}>
                  {s.ingresosIntercompany > 0 ? fmtEur(s.ingresosIntercompany) : '—'}
                </td>
                <td style={{ padding: '6px 0 6px 8px', textAlign: 'right', color: '#dc2626' }}>
                  {s.gastosIntercompany > 0 ? fmtEur(s.gastosIntercompany) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
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
