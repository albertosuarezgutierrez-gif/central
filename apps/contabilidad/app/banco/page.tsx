import { Cabecera } from '../_cabecera'
import { ImportarExtracto } from './ImportarExtracto'
import { Conciliar, type OpcionPartida } from './Conciliar'
import { ReglasConciliacion } from './Reglas'
import { datosPagina } from '@/lib/pagina'
import { conRepo } from '@/lib/db'
import { vistaDePendientes } from '@/lib/banco'
import { limiteDe, PASO, MAXIMO } from '@/lib/paginas'
import { formatearCentimos, fechaEs } from '@/lib/importes'

export const dynamic = 'force-dynamic'

export default async function Banco({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx, empresa, variasEmpresas, avisos } = await datosPagina()
  const limite = limiteDe((await searchParams).n)
  // Todo lo del banco vive en tablas de 0003: si aún no está aplicada, la pantalla lo dice en vez de romper.
  const datos = await conRepo(ctx.empresaId, async (r) => {
    const [vista, conciliados, plan] = await Promise.all([vistaDePendientes(r, new Date(), limite + 1), r.movimientosBanco({ filtro: 'conciliados', limite: limite + 1 }), r.planCuentas()])
    return { vista, conciliados, cuentas: plan.filter((c) => c.admiteApuntes && c.activa && /^[1-9]/.test(c.codigo) && !/^(40|41|43|57)/.test(c.codigo)).map((c) => ({ codigo: c.codigo, nombre: c.nombre })) }
  }, { timeout: 20_000 }).catch(() => null)

  return (
    <>
      <Cabecera empresa={empresa} variasEmpresas={variasEmpresas} avisos={avisos} />
      <main className="contenido">
        <h1>Banco y conciliación</h1>
        <p className="tenue">Importa el extracto de tu banco y el sistema propone con qué factura casa cada movimiento (mismo importe al céntimo y fechas razonables). <strong>Nada se asienta hasta que tú confirmas.</strong> Si hay dudas (dos facturas del mismo importe) no propone: eliges tú.</p>
        {datos === null && <p className="aviso-error">Banco aún no está disponible para esta empresa (falta aplicar el esquema de la fase 3).</p>}
        {datos !== null && (
          <>
            <ImportarExtracto />
            <h2>Pendientes de conciliar</h2>
            {datos.vista.movimientos.length === 0
              ? <p className="tenue">Sin movimientos pendientes. Importa un extracto para empezar.</p>
              : (
                <div className="tabla-scroll">
                  <table className="tabla-cards">
                    <thead><tr><th>Movimiento</th><th>Fecha</th><th className="num">Importe</th><th>Conciliación</th></tr></thead>
                    <tbody>
                      {datos.vista.movimientos.slice(0, limite).map((m) => {
                        const p = datos.vista.propuestas.find((x) => x.movimientoId === m.id)
                        const sentido = m.importe > 0 ? 'cobro' : 'pago'
                        const opciones: OpcionPartida[] = datos.vista.candidatos.filter((c) => c.sentido === sentido).map((c) => ({
                          id: c.id, documento: c.documento ?? '', cuenta: c.cuenta ?? '', etiqueta: `${c.documento} · ${formatearCentimos(c.importe)} · desde ${fechaEs(c.fecha)}`,
                        }))
                        const regla = p?.estado === 'propuesta' && p.metodo === 'regla' ? datos.vista.reglas.find((r) => r.id === p.reglaId) : undefined
                        return (
                          <tr key={m.id}>
                            <td>{m.contraparte || m.concepto || 'Sin concepto'}<span className="tenue"> · {m.concepto}</span></td>
                            <td data-label="Fecha">{fechaEs(m.fecha)}</td>
                            <td className="num" data-label="Importe"><span className={m.importe < 0 ? 'cuadre mal' : 'cuadre ok'}>{formatearCentimos(m.importe)}</span></td>
                            <td>
                              <Conciliar
                                movimientoId={m.id} opciones={opciones}
                                propuesta={p?.estado === 'propuesta' && p.metodo === 'importe_exacto' ? p.candidatoId : null}
                                regla={regla ? { id: regla.id, texto: `«${regla.patron}» → cuenta ${regla.cuenta}` } : null}
                                ambigua={p?.estado === 'ambigua' ? p.motivo : null}
                              />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            {datos.vista.movimientos.length > limite && limite < MAXIMO && <p className="ver-mas"><a className="btn btn-sec" href={`/banco?n=${limite + PASO}`}>Ver más</a></p>}

            <h2>Conciliados</h2>
            {datos.conciliados.length === 0
              ? <p className="tenue">Sin datos: todavía no has conciliado ningún movimiento.</p>
              : (
                <div className="tabla-scroll">
                  <table className="tabla-cards">
                    <thead><tr><th>Movimiento</th><th>Fecha</th><th className="num">Importe</th><th>Casado con</th></tr></thead>
                    <tbody>
                      {datos.conciliados.slice(0, limite).map((m) => (
                        <tr key={m.id}>
                          <td>{m.contraparte || m.concepto || 'Sin concepto'}</td>
                          <td data-label="Fecha">{fechaEs(m.fecha)}</td>
                          <td className="num" data-label="Importe">{formatearCentimos(m.importe)}</td>
                          <td data-label="Casado con">{m.conciliacion?.documento ?? `cuenta ${m.conciliacion?.cuenta}`}<span className="tenue"> · {m.conciliacion?.metodo === 'importe_exacto' ? 'importe exacto' : m.conciliacion?.metodo === 'regla' ? 'regla de concepto' : 'elegido a mano'}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            {datos.conciliados.length > limite && limite < MAXIMO && <p className="ver-mas"><a className="btn btn-sec" href={`/banco?n=${limite + PASO}`}>Ver más</a></p>}

            <h2>Reglas por concepto</h2>
            <p className="tenue">Para movimientos sin factura (comisiones, seguros, cuotas): si el concepto contiene el texto, se propone asentarlo contra esa cuenta de gasto o ingreso.</p>
            <ReglasConciliacion reglas={datos.vista.reglas.map((r) => ({ id: r.id, patron: r.patron, cuenta: r.cuenta, sentido: r.sentido }))} cuentas={datos.cuentas} />
          </>
        )}
      </main>
    </>
  )
}
