import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { getResumenNegocio, manualFinanciero, fmtEur, type ResumenFinanciero } from '@/lib/financiero'
import { getConsolidadoIntercompany, type ResultadoConsolidado } from '@/lib/intercompany'
import { getAlertas, getCuentasConMovimientos, type Alertas, type CuentaConMovimientos } from '@/lib/banca'
import { getResumenPilar, type TrimPilar } from '@/lib/finanzas'
import { NuevaSociedadBtn, NuevoNegocioBtn, EliminarSociedadBtn, EliminarNegocioBtn, EditarSociedadBtn, EditarNegocioBtn } from './GestionSociedad'

// La home es un RESUMEN: negocios (con su resultado) + saldos de las cuentas bancarias +
// alertas accionables. Todo el detalle (movimientos, pisos, correduría, gráficas, gastos por
// categoría…) vive en sus páginas dedicadas — aquí NO se duplica (decisión 02/07/2026).

async function getGastosSinClasificar(cuentaId: string, anio: number) {
  const rows = await prisma.$queryRaw<Array<{ total: number; importe: number }>>`
    SELECT
      COUNT(*)::int             AS total,
      SUM(ABS(mb.importe))::float AS importe
    FROM v_movimientos_activos mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    JOIN sociedades        s  ON s.id  = cb.sociedad_id
    WHERE s.cuenta_id = ${cuentaId}::uuid
      AND mb.requiere_revision = true
      -- Un movimiento con destino ya confirmado NO está "sin clasificar" aunque conserve el flag
      -- requiere_revision (que la ingesta pone y no siempre se limpia). Sin este filtro el banner
      -- contaba ~600 gastos ya clasificados como pendientes (falso "58.097,99€ sin clasificar").
      AND COALESCE(mb.destino_confirmado, false) = false
      AND COALESCE(mb.destino, '') <> 'traspaso_interno'
      AND mb.importe < 0
      AND EXTRACT(year FROM mb.fecha_operacion) = ${anio}
  `
  return rows[0] ?? { total: 0, importe: 0 }
}

// El siguiente Modelo 130 de Pilar (autónoma) cuyo plazo no ha vencido, con lo que tocaría
// ingresar. Devuelve null si Pilar no tiene actividad o no hay trimestre vivo con cobros.
async function getAvisoModelo130(cuentaId: string, anio: number): Promise<TrimPilar | null> {
  const r = await getResumenPilar(cuentaId, anio)
  if (!r.tieneExtracto) return null
  const siguiente = r.trimestres.find(t => t.estado !== 'pasado' && t.cobros > 0)
  return siguiente ?? null
}

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

  const [alertas, gastosSinClasificar, cuentasMov, aviso130] = await Promise.all([
    safe(getAlertas(session.id), { porRevisar: 0, sinJustificante: 0, duplicados: 0, duplicadosDetalle: [], facturasFaltantes: 0, cobrosPendientes: 0, cobrosPendientesEur: 0, cobrosDetalle: [] }),
    safe(getGastosSinClasificar(session.id, anio), { total: 0, importe: 0 }),
    safe(getCuentasConMovimientos(session.id), [] as CuentaConMovimientos[]),
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
            .dash-negocios-grid { grid-template-columns: 1fr !important; }
          }
        `}</style>
        {/* Consolidado intercompany (holding) — solo si hay operaciones internas */}
        {hayIntercompany && consolidadoIC && (
          <IntercompanyCard
            consolidado={consolidadoIC}
            nombrePorSociedad={Object.fromEntries(sociedades.map(s => [s.id, s.nombre]))}
            anio={anio}
          />
        )}

        {/* Aviso fiscal: próximo Modelo 130 de Pilar (autónoma) */}
        {aviso130 && <AvisoModelo130 trim={aviso130} />}

        {/* Alertas accionables (por revisar, posibles duplicados) */}
        <AlertasBanner alertas={alertas} gastosSinClasificar={gastosSinClasificar} />

        {/* Saldo de cada cuenta bancaria + últimos movimientos (el detalle completo vive en /banca) */}
        {cuentasMov.length > 0 && <SaldoPorCuenta cuentas={cuentasMov} />}

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

// Banner de alertas: lo que requiere acción del dueño (revisar categoría, posibles cargos
// duplicados). Si no hay nada, no renderiza.
function AlertasBanner({ alertas, gastosSinClasificar }: {
  alertas: Alertas
  gastosSinClasificar: { total: number; importe: number }
}) {
  if (alertas.porRevisar === 0 && alertas.sinJustificante === 0 && alertas.duplicados === 0 && alertas.facturasFaltantes === 0 && alertas.cobrosPendientes === 0) return null
  return (
    <div style={{
      background: 'var(--warning-bg)', border: '1px solid var(--warning)', borderRadius: 'var(--radius)',
      padding: '12px 16px', marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '6px',
    }}>
      {alertas.porRevisar > 0 && (
        <Link href="/finanzas/gastos" style={{ fontSize: '13px', color: 'var(--text)', textDecoration: 'none', fontWeight: 600 }}>
          🔎 Tienes <strong>{alertas.porRevisar}</strong> {alertas.porRevisar === 1 ? 'gasto' : 'gastos'} por revisar
          {gastosSinClasificar.importe > 0 && (
            <span style={{ color: 'var(--warning)', fontWeight: 700 }}> ({fmtEur(gastosSinClasificar.importe)} sin clasificar)</span>
          )}
          {' '}→
        </Link>
      )}
      {alertas.sinJustificante > 0 && (
        <Link href="/finanzas/gastos" style={{ fontSize: '13px', color: 'var(--text)', textDecoration: 'none' }}>
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

// ─── Saldo por cuenta + últimos movimientos ──────────────────────────────────────
// Una tarjeta por cuenta bancaria propia: saldo arriba y sus últimos movimientos debajo
// (fecha · contraparte/concepto · importe). Excluye las cuentas de Pilar y las ocultas
// (filtrado en la query). El detalle completo vive en /banca.
function SaldoPorCuenta({ cuentas }: { cuentas: CuentaConMovimientos[] }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700 }}>🏦 Saldo por cuenta</h2>
        <Link href="/banca" style={{ fontSize: 11, color: 'var(--primary)', textDecoration: 'none', fontWeight: 600 }}>Ver banca →</Link>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
        {cuentas.map(c => (
          <div key={c.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 16px', boxShadow: 'var(--shadow)' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 2 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c.banco || c.alias || 'Cuenta'}{c.ibanMascara ? <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 500 }}> ·{c.ibanMascara}</span> : null}
              </span>
              <span style={{ fontSize: 18, fontWeight: 800, color: (c.saldoActual ?? 0) >= 0 ? 'var(--positive)' : 'var(--negative)', flexShrink: 0 }}>
                {c.saldoActual == null ? '—' : fmtEur(c.saldoActual)}
              </span>
            </div>
            <div style={{ fontSize: 10, color: 'var(--muted)' }}>
              {c.sociedadNombre}{c.saldoFecha ? ` · saldo a ${c.saldoFecha.slice(8, 10)}/${c.saldoFecha.slice(5, 7)}` : ''}
            </div>
            {c.movs.length > 0 && (
              <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 5 }}>
                {c.movs.map(m => (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'baseline', gap: 6, fontSize: 11, lineHeight: 1.3 }}>
                    <span style={{ color: 'var(--muted)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                      {m.fechaOperacion ? `${m.fechaOperacion.slice(8, 10)}/${m.fechaOperacion.slice(5, 7)}` : '—'}
                    </span>
                    <span style={{ color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {m.contraparte || m.concepto || '—'}
                    </span>
                    <span style={{ fontWeight: 700, flexShrink: 0, fontVariantNumeric: 'tabular-nums', color: m.importe >= 0 ? 'var(--positive)' : 'var(--text)' }}>
                      {fmtEur(m.importe)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
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

function FinStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: '14px', fontWeight: 700, color: color || 'var(--text)', marginTop: '2px' }}>{value}</div>
    </div>
  )
}
