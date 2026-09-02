import Link from 'next/link'
import { prisma } from '@/lib/db'
import { getResumenNegocio, manualFinanciero, fmtEur, type ResumenFinanciero } from '@/lib/financiero'
import { getConsolidadoIntercompany, type ResultadoConsolidado } from '@/lib/intercompany'
import { getAlertas, type Alertas } from '@/lib/banca'
import { colorImporte } from '@/components/ui'
import { getResumenPilar, getResumenFinanciero, type TrimPilar } from '@/lib/finanzas'
import { NuevaSociedadBtn, NuevoNegocioBtn, EliminarSociedadBtn, EliminarNegocioBtn, EditarSociedadBtn, EditarNegocioBtn } from '../dashboard/GestionSociedad'

// Vista NEGOCIOS del Inicio unificado (segmento «Negocios» de /banca): la foto del holding —
// negocios con su resultado + consolidado intercompany + aviso Modelo 130 + alertas accionables.
// Es lo que antes vivía en /dashboard (Resumen). Los SALDOS y MOVIMIENTOS viven en el segmento
// «Dinero» (el cuerpo de /banca), aquí NO se duplican.

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
      AND COALESCE(mb.destino_confirmado, false) = false
      AND COALESCE(mb.destino, '') <> 'traspaso_interno'
      AND mb.importe < 0
      AND EXTRACT(year FROM mb.fecha_operacion) = ${anio}
  `
  return rows[0] ?? { total: 0, importe: 0 }
}

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
  sivra:     '/sivra/income',
}

async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try { return await p } catch (e) { console.error('[negocios-resumen] degradando:', e); return fallback }
}

export default async function NegociosResumen({ cuentaId, nombre }: { cuentaId: string; nombre: string }) {
  const anio = new Date().getFullYear()

  const sociedadesQuery = prisma.sociedad.findMany({
    where: { cuentaId },
    include: { negocios: { orderBy: { createdAt: 'asc' } } },
    orderBy: { createdAt: 'asc' },
  })
  const sociedades = await safe(sociedadesQuery, [] as Awaited<typeof sociedadesQuery>)

  const [alertas, gastosSinClasificar, aviso130, resumenAnual] = await Promise.all([
    safe(getAlertas(cuentaId), { porRevisar: 0, sinJustificante: 0, duplicados: 0, duplicadosDetalle: [], facturasFaltantes: 0, cobrosPendientes: 0, cobrosPendientesEur: 0, cobrosDetalle: [] }),
    safe(getGastosSinClasificar(cuentaId, anio), { total: 0, importe: 0 }),
    safe(getAvisoModelo130(cuentaId, anio), null as TrimPilar | null),
    // Correduría: no es un negocio en la tabla `negocios` (comprobado — 0 filas), es un flujo derivado
    // de `movimientos_bancarios.destino='seguros'` (siempre BBVA). Se reutiliza `getResumenFinanciero`
    // (fuente ÚNICA de este cálculo, con sus reglas de exención/retención) en vez de sumar por SQL aparte.
    safe(getResumenFinanciero(cuentaId, anio, 0), null as Awaited<ReturnType<typeof getResumenFinanciero>> | null),
  ])

  const negociosConFinanciero = await Promise.all(
    sociedades.flatMap(soc =>
      soc.negocios.map(async neg => ({
        ...neg,
        sociedadId: soc.id,
        financiero: neg.app
          ? await getResumenNegocio(neg.app, neg.refExt, anio)
          : manualFinanciero(
              neg.ingresosManual != null ? Number(neg.ingresosManual) : null,
              neg.gastosManual != null ? Number(neg.gastosManual) : null,
            ),
      }))
    )
  )

  const consolidadoIC = await safe(
    getConsolidadoIntercompany(
      cuentaId,
      anio,
      negociosConFinanciero
        .filter(n => n.financiero.disponible)
        .map(n => ({
          sociedadId: n.sociedadId,
          ingresos: n.financiero.ingresosYtd,
          gastos: n.financiero.gastosYtd,
          disponible: true,
        })),
      sociedades.map(s => s.id),
    ),
    null as ResultadoConsolidado | null,
  )
  const hayIntercompany = !!consolidadoIC && consolidadoIC.eliminaciones.ingresos > 0

  const sociedadesConNegocios = sociedades.map(soc => ({
    ...soc,
    negocios: negociosConFinanciero.filter(n => n.sociedadId === soc.id),
  }))

  return (
    <div>
      <style>{`
        @media (max-width: 768px) { .neg-grid { grid-template-columns: 1fr !important; } }
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

      {/* Alertas accionables */}
      <AlertasBanner alertas={alertas} gastosSinClasificar={gastosSinClasificar} />

      <div style={{ marginBottom: '28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700 }}>Hola, {nombre}</h1>
        <NuevaSociedadBtn />
      </div>

      {sociedades.length === 0 && (
        <div style={{
          background: 'var(--surface)', border: '1px dashed var(--border)',
          borderRadius: 'var(--radius)', padding: '48px 24px',
          textAlign: 'center', color: 'var(--muted)',
        }}>
          <div style={{ fontSize: '40px', marginBottom: '16px' }}>🏗️</div>
          <p style={{ fontWeight: 600, fontSize: '16px', marginBottom: '8px' }}>Sin negocios configurados</p>
          <p style={{ fontSize: '14px' }}>Añade sociedades y negocios con el botón de arriba.</p>
        </div>
      )}

      {sociedadesConNegocios.map(soc => (
        <section key={soc.id} style={{ marginBottom: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: '17px', fontWeight: 700 }}>{soc.nombre}</h2>
            {soc.cif && (
              <span style={{ fontSize: '13px', color: 'var(--muted)', fontFamily: 'monospace' }}>CIF {soc.cif}</span>
            )}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '4px', alignItems: 'center' }}>
              <NuevoNegocioBtn sociedadId={soc.id} />
              <EditarSociedadBtn id={soc.id} nombre={soc.nombre} cif={soc.cif} />
              <EliminarSociedadBtn id={soc.id} nombre={soc.nombre} />
            </div>
          </div>

          <div className="neg-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '16px' }}>
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

      {/* Correduría de seguros: actividad profesional real (comisiones BBVA), pero NO vive en la
          tabla `negocios` (es persona física, no una sociedad/CIF) — se pinta aparte con el mismo
          patrón de tarjeta, enlazando a la matriz por compañía en /correduria. */}
      {resumenAnual && resumenAnual.correduria.ingresosBrutos > 0 && (
        <section style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '17px', fontWeight: 700, marginBottom: '16px' }}>Actividad profesional</h2>
          <div className="neg-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '16px' }}>
            <CorreduriaCard correduria={resumenAnual.correduria} anio={anio} />
          </div>
        </section>
      )}
    </div>
  )
}

function CorreduriaCard({ correduria, anio }: {
  correduria: Awaited<ReturnType<typeof getResumenFinanciero>>['correduria']
  anio: number
}) {
  return (
    <Link
      href="/correduria"
      style={{
        display: 'block',
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: '20px',
        boxShadow: 'var(--shadow)', textDecoration: 'none',
      }}
    >
      <div style={{ fontSize: '13px', color: 'var(--primary)', fontWeight: 600, marginBottom: '4px' }}>🧾 Correduría de seguros</div>
      <div style={{ fontWeight: 700, fontSize: '16px', marginBottom: '2px' }}>Comisiones de correduría</div>
      <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '16px' }}>BBVA ↗</div>
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: '14px' }}>
        <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
          <FinStat label={`Ingresos ${anio}`} value={fmtEur(correduria.ingresosBrutos)} />
          <FinStat label={`Gastos ${anio}`} value={fmtEur(correduria.gastosDeducibles)} />
          <FinStat
            label="Resultado"
            value={fmtEur(correduria.resultado)}
            color={colorImporte(correduria.resultado)}
          />
        </div>
      </div>
    </Link>
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
                color={colorImporte(fin.resultadoHoy ?? fin.resultadoYtd)}
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

function AvisoModelo130({ trim }: { trim: TrimPilar }) {
  const proximo = trim.estado === 'proximo'
  return (
    <Link href="/finanzas/pilar" style={{ textDecoration: 'none', display: 'block', marginBottom: 20 }}>
      <div style={{
        background: proximo ? 'var(--warning-bg)' : 'var(--primary-light)',
        border: `1px solid ${proximo ? 'var(--warning)' : 'var(--primary)'}`,
        borderRadius: 'var(--radius)', padding: '12px 16px',
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 13,
      }}>
        <span style={{ fontWeight: 700, color: proximo ? 'var(--warning)' : 'var(--primary)' }}>📅 Modelo 130 · {trim.q}T</span>
        <span style={{ color: 'var(--text)' }}>vence <strong>{trim.plazo}</strong></span>
        <span style={{ color: 'var(--text)' }}>· a ingresar <strong>{fmtEur(trim.pagoFraccionado)}</strong></span>
        {proximo && <span style={{ color: 'var(--warning)', fontWeight: 700 }}>· ¡plazo próximo!</span>}
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
        <FinStat label="Intercompany eliminado" value={fmtEur(eliminaciones.ingresos)} color="var(--negative)" />
        <span style={{ color: 'var(--muted)', fontSize: '18px' }}>=</span>
        <FinStat label="Ingresos reales del grupo" value={fmtEur(real.ingresos)} color="var(--primary)" />
        <FinStat
          label="Resultado del grupo"
          value={fmtEur(real.resultado)}
          color={colorImporte(real.resultado)}
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
                <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--positive)' }}>
                  {s.ingresosIntercompany > 0 ? fmtEur(s.ingresosIntercompany) : '—'}
                </td>
                <td style={{ padding: '6px 0 6px 8px', textAlign: 'right', color: 'var(--negative)' }}>
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
