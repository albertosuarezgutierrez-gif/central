import { Suspense } from 'react'
import { prisma } from '@/lib/db'
import { PROPS_CALENDARIO } from '@/lib/sivra/constantes'
import { PORTAL_COLORS, PORTAL_LABELS } from '@/lib/portales'
import { getPLMensual } from '@/lib/sivra/pl-mensual'
import { computarPrevision } from '@/lib/sivra/prevision-pisos'
import { paxDe } from '@/lib/sivra/limpieza-intranet'
import { eur } from '@/lib/dinero'
import { TablaScroll } from '@/components/ui'
import { estimacionMes, sumarDias, ventanaCalendario, type Movimiento, type ReservaCal } from '@/lib/inicio-resumen'
import { Aviso, NoDisponible, Tarjeta, subTitulo } from './piezas'

const DIAS = 14
const LETRA = ['D', 'L', 'M', 'X', 'J', 'V', 'S']
const MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

function hoyMadrid(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date())
}

const nombre = (id: string) => PROPS_CALENDARIO.find(p => p.id === id)?.label ?? id

function textoMov(verbo: string, cuando: string, lista: Movimiento[]): string | null {
  if (lista.length === 0) return null
  return `${cuando} ${verbo}: ${lista.map(m => nombre(m.propertyId) + (m.pax != null && verbo === 'entra' ? ` (${m.pax} pax)` : '')).join(', ')}`
}

// Calendario y estimación van en Suspense SEPARADOS: la estimación recorre meses de P&L y no
// puede retrasar el calendario, que es una sola consulta.
export default function TarjetaPisos() {
  return (
    <Tarjeta titulo="Pisos" href="/sivra/calendario" enlace="Calendario completo" ancha>
      <Suspense fallback={<Cargando texto="Cargando calendario…" alto={180} />}><CalendarioPisos /></Suspense>
      <Suspense fallback={<Cargando texto="Calculando la estimación del mes…" alto={140} />}><EstimacionMes /></Suspense>
    </Tarjeta>
  )
}

function Cargando({ texto, alto }: { texto: string; alto: number }) {
  return <div aria-busy="true" style={{ minHeight: alto, borderRadius: 10, background: 'var(--bg)', display: 'grid', placeItems: 'center', fontSize: 13, color: 'var(--muted)' }}>{texto}</div>
}

async function CalendarioPisos() {
  const hoy = hoyMadrid()
  const ids = PROPS_CALENDARIO.map(p => p.id)
  const fin = sumarDias(hoy, DIAS)

  const reservas = await prisma.$queryRaw<Array<{ propertyId: string; guestName: string | null; checkIn: Date | null; checkOut: Date | null; portal: string | null; adults: number | null; children: number | null }>>`
      SELECT "propertyId", "guestName", "checkIn", "checkOut", portal::text AS portal, adults, children
      FROM incomes
      WHERE "propertyId" = ANY(${ids}::text[])
        AND "checkIn" < ${new Date(`${fin}T00:00:00Z`)} AND "checkOut" > ${new Date(`${hoy}T00:00:00Z`)}
    `.catch(() => null)

  const d = (x: Date | null) => (x ? new Date(x).toISOString().slice(0, 10) : null)
  const res: ReservaCal[] = (reservas ?? []).flatMap(r => {
    const i = d(r.checkIn); const o = d(r.checkOut)
    return i && o ? [{ propertyId: r.propertyId, huesped: r.guestName, checkIn: i, checkOut: o, portal: r.portal, pax: paxDe(r.adults, r.children) }] : []
  })
  const v = ventanaCalendario(res, ids, hoy, DIAS)
  const movs = [
    textoMov('entra', 'Hoy', v.entranHoy), textoMov('sale', 'Hoy', v.salenHoy),
    textoMov('entra', 'Mañana', v.entranManana), textoMov('sale', 'Mañana', v.salenManana),
  ].filter((x): x is string => x !== null)

  const portales = [...new Set(res.map(r => (r.portal ?? 'OTRO').toUpperCase()))]

  return (
    <>
      {reservas === null ? (
        <NoDisponible que="Calendario" motivo="no se han podido leer las reservas" donde="/sivra/calendario" />
      ) : (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {movs.length === 0 && <span style={{ fontSize: 13, color: 'var(--muted)' }}>Hoy y mañana no entra ni sale nadie.</span>}
            {movs.map(t => <span key={t} style={{ fontSize: 13, background: 'var(--info-bg)', color: 'var(--info)', borderRadius: 999, padding: '6px 11px' }}>{t}</span>)}
            {v.nochesLibres > 0 && (
              <span style={{ fontSize: 13, background: 'var(--warning-bg)', color: 'var(--warning)', borderRadius: 999, padding: '6px 11px' }}>
                {v.nochesLibres} noches libres en {DIAS} días · revisar precio
              </span>
            )}
          </div>

          <TablaScroll>
            <div role="table" aria-label={`Ocupación de los próximos ${DIAS} días`} style={{ display: 'grid', gridTemplateColumns: `120px repeat(${DIAS}, minmax(34px, 1fr))`, minWidth: 600, fontSize: 12, border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
              <div role="row" style={{ display: 'contents' }}>
                <div style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }} />
                {v.dias.map((dia, i) => {
                  const w = new Date(`${dia}T12:00:00Z`).getUTCDay()
                  return (
                    <div key={dia} role="columnheader" style={{ textAlign: 'center', padding: '6px 0', background: w === 0 || w === 6 ? 'var(--border)' : 'var(--bg)', borderBottom: '1px solid var(--border)', color: i === 0 ? 'var(--primary)' : 'var(--muted)', fontWeight: i === 0 ? 700 : 400 }}>
                      {LETRA[w]}<br />{Number(dia.slice(8))}
                    </div>
                  )
                })}
              </div>
              {PROPS_CALENDARIO.map(p => (
                <div key={p.id} role="row" style={{ display: 'contents' }}>
                  <div role="rowheader" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px', height: 40, borderBottom: '1px solid var(--border)', fontWeight: 600, position: 'sticky', left: 0, background: 'var(--surface)', zIndex: 1 }}>
                    <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, background: p.color, flexShrink: 0 }} />{p.label}
                  </div>
                  <div style={{ gridColumn: `2 / span ${DIAS}`, position: 'relative', height: 40, borderBottom: '1px solid var(--border)' }}>
                    {(v.barras.get(p.id) ?? []).map((b, i) => (
                      <div key={i} title={`${b.huesped ?? 'Reserva'} · ${PORTAL_LABELS[(b.portal ?? '').toUpperCase()] ?? b.portal ?? 'sin portal'}`} style={{
                        position: 'absolute', top: 7, height: 26,
                        left: `calc(${(b.desde / DIAS) * 100}% + ${b.cortadaIzq ? 0 : 4}px)`,
                        width: `calc(${((b.hasta - b.desde) / DIAS) * 100}% - ${b.cortadaIzq ? 4 : 8}px)`,
                        borderRadius: 6, background: PORTAL_COLORS[(b.portal ?? '').toUpperCase()] ?? PORTAL_COLORS.OTRO,
                        color: '#fff', fontSize: 11, fontWeight: 600, padding: '0 7px', display: 'flex', alignItems: 'center',
                        overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                      }}>
                        {b.huesped ?? ''}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </TablaScroll>
          {portales.length > 0 && (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12, color: 'var(--muted)' }}>
              {portales.map(pt => (
                <span key={pt} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <span aria-hidden style={{ width: 10, height: 10, borderRadius: 3, background: PORTAL_COLORS[pt] ?? PORTAL_COLORS.OTRO }} />{PORTAL_LABELS[pt] ?? pt}
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </>
  )
}

async function EstimacionMes() {
  const mes = hoyMadrid().slice(0, 7)
  const [pl, prevision] = await Promise.all([
    getPLMensual(mes).catch(() => null),
    computarPrevision(1).catch(() => null),
  ])
  const previstos = new Map<string, number | null>((prevision ?? []).filter(p => p.mes === mes).map(p => [p.propertyId, p.gastosPrevistos]))
  const est = pl
    ? estimacionMes(pl.pisos.map(p => ({ propertyId: p.propertyId, nombre: p.nombre, reservas: p.reservas, ingresos: p.ingresos, gastosImputados: p.gastos.total })), previstos)
    : null

  return (
      <div style={{ display: 'grid', gap: 8 }}>
        <p style={subTitulo}>{MES[Number(mes.slice(5)) - 1]} · estimación del mes</p>
        {!est ? (
          <NoDisponible que="Estimación del mes" motivo="no se ha podido calcular el P&L de los pisos" donde="/sivra/resultado-pisos" />
        ) : (
          <>
            {prevision === null && <Aviso tono="aviso">No se ha podido leer la media de gastos: se usan solo los gastos ya imputados, así que el resultado sale optimista.</Aviso>}
            <TablaScroll>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 520, fontVariantNumeric: 'tabular-nums' }}>
                <thead>
                  <tr style={{ color: 'var(--muted)', fontSize: 12 }}>
                    <th style={{ textAlign: 'left', padding: '6px 8px' }}>Piso</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px' }}>Reservas</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px' }}>Ingreso reservado</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px' }}>Gastos (estim.)</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px' }}>Resultado estimado</th>
                  </tr>
                </thead>
                <tbody>
                  {est.filas.map(f => (
                    <tr key={f.propertyId} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px' }}>{f.nombre}</td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>{f.reservas}</td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>{eur(f.ingresos)}</td>
                      <td style={{ padding: '8px', textAlign: 'right' }} title={f.fuente === 'prevision' ? 'Media de los 3 últimos meses cerrados' : f.fuente === 'imputados' ? 'Este mes ya se ha gastado más que la media' : 'Sin meses cerrados: solo lo ya imputado'}>
                        −{eur(f.gastos)}
                        {f.fuente === 'imputados' && <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--warning)' }}>ya gastado</span>}
                        {f.fuente === 'sin_historico' && <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--muted)' }}>sin histórico</span>}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', fontWeight: 600, color: f.resultado >= 0 ? 'var(--positive)' : 'var(--negative)' }}>{eur(f.resultado)}</td>
                    </tr>
                  ))}
                  <tr style={{ borderTop: '1px solid var(--border)', fontWeight: 700 }}>
                    <td style={{ padding: '8px' }}>Total</td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>{est.total.reservas}</td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>{eur(est.total.ingresos)}</td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>−{eur(est.total.gastos)}</td>
                    <td style={{ padding: '8px', textAlign: 'right', color: est.total.resultado >= 0 ? 'var(--positive)' : 'var(--negative)' }}>{eur(est.total.resultado)}</td>
                  </tr>
                </tbody>
              </table>
            </TablaScroll>
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>
              Todas las reservas con entrada este mes (también las que aún no han llegado) menos los gastos previstos: la media de los 3 últimos meses de cada piso. Si este mes ya se ha gastado más, cuenta lo gastado. Puede subir si entran reservas nuevas.
            </p>
          </>
        )}
      </div>
  )
}
