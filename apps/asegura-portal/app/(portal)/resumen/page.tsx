import Link from 'next/link'
import { redirect } from 'next/navigation'

import { ETIQUETA_RAMO } from '@central/module-seguros-portal'

import { carteraDeIdentidad, type PolizaPortal } from '@/lib/cartera-lectura'
import { prisma } from '@/lib/db'
import { DECLARADA_NO_ELIMINADA } from '@/lib/declaradas-eliminadas'
import { eur } from '@/lib/dinero'
import { fechaEs } from '@/lib/fechas'
import {
  anioDePeticion,
  aniosSeleccionables,
  polizasDelResumen,
  resumenAnual,
  type PolizaAportadaEntrada,
  type PolizaGestionadaEntrada,
} from '@/lib/resumen-anual'
import { getIdentidad } from '@/lib/session'

import { ImprimirResumen } from './ImprimirResumen'
import { EncabezadoPortal } from '../../PaginaPortal'

export const dynamic = 'force-dynamic'

const ramoLegible = (r: string | null) => (r === null ? 'Seguro' : (ETIQUETA_RAMO as Record<string, string>)[r] ?? r)

function etiquetaGestionada(p: PolizaPortal): string {
  // El nº de póliza nunca identifica una póliza para el cliente: bien asegurado primero, nº de último recurso.
  const bien = p.bien.cosa ?? p.bien.ubicacion
  return bien ?? `${p.compania} · ${ramoLegible(p.ramo)}${p.numeroPoliza ? ` (${p.numeroPoliza})` : ''}`
}

/**
 * «Mi resumen {año}» (13/10/2026): lo pagado en seguros y los siniestros del año, para la declaración de
 * la renta. Lee SOLO lo autorizado a esta identidad: `carteraDeIdentidad` (parte de `portal_vinculo`) y
 * sus propias aportadas (`identidadId` + no eliminadas). Solo pólizas PROPIAS: nada de terceros.
 */
export default async function ResumenPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const identidad = await getIdentidad()
  if (!identidad) redirect('/')
  const hoy = new Date()
  const anio = anioDePeticion((await searchParams).anio, hoy)

  const [cartera, declaradas] = await Promise.all([
    carteraDeIdentidad(identidad.id),
    prisma.portalPolizaDeclarada.findMany({
      where: { identidadId: identidad.id, ...DECLARADA_NO_ELIMINADA },
      orderBy: { creadaEn: 'desc' },
      take: 200,
      select: {
        id: true, compania: true, ramo: true, numeroPoliza: true, primaAnual: true,
        fechaVencimiento: true, procedencia: true, titularTipo: true,
      },
    }),
  ])

  const propias = cartera.propias
  // Fuera las de OTRO tomador en las que su ficha solo figura (`figuraTitular`), igual que el cron.
  const gestionadas: PolizaGestionadaEntrada[] = polizasDelResumen(propias).map((p) => ({
      id: p.id,
      compania: p.compania,
      ramo: ramoLegible(p.ramo),
      etiqueta: etiquetaGestionada(p),
      recibos: p.recibos === null
        ? null
        : p.recibos.historial.map((r) => ({ situacion: r.situacion, importe: r.importe, fechaSituacion: r.fechaSituacion })),
      siniestros: p.siniestros === null
        ? null
        : p.siniestros.map((s) => ({ id: s.id, fechaHora: s.fechaHora, indemnizacion: s.tramitacion?.indemnizacion ?? null })),
    }))
  // Las que declaró como de su EMPRESA no son un gasto personal: fuera y se dice.
  const deEmpresa = declaradas.filter((d) => d.titularTipo === 'empresa').length
  const aportadas: PolizaAportadaEntrada[] = declaradas
    .filter((d) => d.titularTipo !== 'empresa')
    .map((d) => ({
      id: d.id,
      compania: d.compania,
      ramo: d.ramo === null ? null : ramoLegible(d.ramo),
      etiqueta: `${d.compania ?? 'Seguro'} · ${ramoLegible(d.ramo)}`,
      procedencia: d.procedencia,
      primaAnual: d.primaAnual === null ? null : Number(d.primaAnual),
      fechaVencimiento: d.fechaVencimiento,
    }))

  const r = resumenAnual({ anio, gestionadas, aportadas })
  const g = r.gestionado
  const a = r.aportado
  const titulares = propias.map((t) => t.nombre).join(', ')
  const sinNada = !cartera.vinculada && aportadas.length === 0

  return (
    <>
      <style>{`
        @media print {
          .portal-tabbar, .portal-nav-fondo { display: none !important; }
          .resumen-pantalla { display: none !important; }
          .resumen-bloque { break-inside: avoid; }
        }
        .resumen-tabla { width: 100%; border-collapse: collapse; font-size: 14px; }
        .resumen-tabla th, .resumen-tabla td { text-align: left; padding: 6px 4px; border-bottom: 1px solid var(--border); vertical-align: top; overflow-wrap: anywhere; }
        .resumen-tabla td.num, .resumen-tabla th.num { text-align: right; white-space: nowrap; }
        .resumen-tabla-caja { overflow-x: auto; }
        .resumen-cifra { font-family: var(--display, var(--serif)); font-size: 28px; font-weight: 700; margin: 4px 0; }
      `}</style>

      <div className="solo-pantalla resumen-pantalla">
        <p className="antetitulo">Declaración de la renta</p>
      </div>
      <EncabezadoPortal titulo="Mi" acento={`resumen ${anio}`} />
      <p className="suave" style={{ marginTop: 0 }}>No sustituye a los justificantes de la compañía.</p>
      {titulares && <p className="suave" style={{ marginTop: 0 }}>Titular: {titulares}</p>}

      <nav className="solo-pantalla" aria-label="Año" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '12px 0' }}>
        {aniosSeleccionables(hoy).map((y) => (
          <Link
            key={y}
            href={`/resumen?anio=${y}`}
            className={y === anio ? 'chip acento' : 'chip'}
            aria-current={y === anio ? 'page' : undefined}
            style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', padding: '0 16px' }}
          >
            {y}
          </Link>
        ))}
      </nav>
      <div className="solo-pantalla" style={{ marginBottom: 16 }}>
        <ImprimirResumen />
      </div>

      {sinNada ? (
        <section className="seccion">
          <p style={{ margin: 0 }}>
            Todavía no hay seguros en tu cuenta, ni gestionados por Grupo ASegura ni aportados por ti, así que no hay nada que resumir.
          </p>
        </section>
      ) : (
        <>
          <section className="seccion resumen-bloque" aria-labelledby="gest">
            <p className="antetitulo">Gestionado por Grupo ASegura</p>
            <h2 id="gest" style={{ marginTop: 0 }}>Recibos cobrados en {anio}</h2>
            {!cartera.vinculada || gestionadas.length === 0 ? (
              <p className="suave" style={{ margin: 0 }}>
                No tienes pólizas gestionadas por Grupo ASegura en tu cuenta: aquí no hay nada que sumar.
              </p>
            ) : (
              <>
                <p className="resumen-cifra">
                  {g.total === null ? 'No nos consta ningún cobro' : eur(g.total)}
                </p>
                {g.total !== null && g.totalIncompleto && (
                  <p className="suave" style={{ margin: '0 0 8px' }}>
                    Es lo que nos consta: hay cobros de {anio} sin importe o sin fecha en la compañía, así que la cifra real puede ser mayor.
                  </p>
                )}
                {g.total === null && (
                  <p className="suave" style={{ margin: '0 0 8px' }}>
                    «No nos consta» no es «no pagaste»: la compañía puede no habernos informado de los recibos de {anio}.
                  </p>
                )}
                <div className="resumen-tabla-caja">
                  <table className="resumen-tabla" aria-label={`Recibos cobrados en ${anio}, por seguro`}>
                    <thead><tr><th>Seguro</th><th className="num">Pagado</th></tr></thead>
                    <tbody>
                      {g.filas.map((f) => (
                        <tr key={f.id}>
                          <td>
                            {f.etiqueta}
                            <br /><span className="suave">{f.compania} · {f.ramo}</span>
                          </td>
                          <td className="num">
                            {f.estado === 'dato' && <>{eur(f.pagado)}<br /><span className="suave">{f.recibosCobrados} recibo{f.recibosCobrados === 1 ? '' : 's'}</span></>}
                            {f.estado === 'sin_datos' && <span className="suave">No nos consta</span>}
                            {f.estado === 'no_visible' && <span className="suave">No visible en tu nivel</span>}
                            {(f.cobradosSinImporte > 0 || f.cobradosSinFecha > 0) && (
                              <><br /><span className="suave">+ {f.cobradosSinImporte + f.cobradosSinFecha} cobro(s) sin {f.cobradosSinImporte > 0 ? 'importe' : 'fecha'}</span></>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {g.porRamo.length > 0 && (
                  <>
                    <h3>Por ramo</h3>
                    <div className="resumen-tabla-caja">
                      <table className="resumen-tabla" aria-label={`Recibos cobrados en ${anio}, por ramo`}>
                        <tbody>
                          {g.porRamo.map((x) => (
                            <tr key={x.ramo}><td>{x.ramo}</td><td className="num">{eur(x.total)}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </>
            )}
          </section>

          <section className="seccion resumen-bloque" aria-labelledby="sin">
            <p className="antetitulo">Gestionado por Grupo ASegura</p>
            <h2 id="sin" style={{ marginTop: 0 }}>Siniestros de {anio}</h2>
            {g.siniestros.total === null ? (
              <p className="suave" style={{ margin: 0 }}>
                {gestionadas.length === 0 ? 'No tienes pólizas gestionadas por Grupo ASegura.' : 'Los siniestros no son visibles en tu nivel de acceso.'}
              </p>
            ) : (
              <>
                <p style={{ margin: '4px 0' }}>
                  <strong>{g.siniestros.total}</strong> siniestro{g.siniestros.total === 1 ? '' : 's'} con fecha en {anio}
                  {g.siniestros.total === 0 && ' (los que nos constan)'}.
                </p>
                {g.siniestros.total > 0 && (
                  <p style={{ margin: '4px 0' }}>
                    Indemnizado: <strong>{g.siniestros.indemnizado === null ? 'la compañía no lo ha informado' : eur(g.siniestros.indemnizado)}</strong>
                    {g.siniestros.indemnizado !== null && g.siniestros.sinIndemnizacionInformada > 0 &&
                      ` (${g.siniestros.sinIndemnizacionInformada} sin importe informado)`}
                  </p>
                )}
                {g.siniestros.lista.length > 0 && (
                  <div className="resumen-tabla-caja">
                    <table className="resumen-tabla" aria-label={`Siniestros de ${anio}`}>
                      <thead><tr><th>Fecha</th><th>Seguro</th><th className="num">Indemnización</th></tr></thead>
                      <tbody>
                        {g.siniestros.lista.map((s) => (
                          <tr key={s.id}>
                            <td>{fechaEs(s.fechaHora)}</td>
                            <td>{s.etiqueta}</td>
                            <td className="num">{s.indemnizacion === null ? <span className="suave">No informada</span> : eur(s.indemnizacion)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {(g.siniestros.sinFecha > 0 || g.siniestros.polizasNoVisibles > 0) && (
                  <p className="suave" style={{ margin: '8px 0 0' }}>
                    {g.siniestros.sinFecha > 0 && `${g.siniestros.sinFecha} siniestro(s) sin fecha del hecho no se pueden asignar a un año. `}
                    {g.siniestros.polizasNoVisibles > 0 && `${g.siniestros.polizasNoVisibles} póliza(s) no enseñan siniestros en tu nivel.`}
                  </p>
                )}
              </>
            )}
          </section>

          <section className="seccion resumen-bloque" aria-labelledby="apo">
            <p className="antetitulo">Aportado por ti (datos que nos diste)</p>
            <h2 id="apo" style={{ marginTop: 0 }}>Primas anuales que declaraste</h2>
            {a.total === null ? (
              <p className="suave" style={{ margin: 0 }}>No has declarado ninguna prima anual en seguros que nos hayas aportado.</p>
            ) : (
              <>
                <p className="resumen-cifra">{eur(a.total)}</p>
                <p className="suave" style={{ margin: '0 0 8px' }}>
                  Son importes que escribiste tú, no recibos cobrados: no los hemos comprobado con la compañía.
                </p>
                <div className="resumen-tabla-caja">
                  <table className="resumen-tabla" aria-label="Primas anuales que declaraste, por seguro">
                    <tbody>
                      {a.filas.map((f) => (
                        <tr key={f.id}><td>{f.etiqueta}</td><td className="num">{eur(f.prima)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            {a.noIncluidas + deEmpresa > 0 && (
              <p className="suave" style={{ margin: '8px 0 0' }}>
                {a.noIncluidas + deEmpresa} seguro(s) aportado(s) no suman: sin prima declarada, con la prima leída de un documento, ya vencidos antes de {anio} o declarados como de una empresa.
              </p>
            )}
          </section>

          <p className="suave" style={{ fontSize: 12 }}>
            Resumen informativo generado el {fechaEs(hoy)}. Cobros por fecha de cobro del recibo; no incluye recibos pendientes ni anulados.
            No sustituye a los justificantes de la compañía.
          </p>
        </>
      )}
    </>
  )
}
