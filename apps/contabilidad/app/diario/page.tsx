import { Cabecera } from '../_cabecera'
import { Rectificar } from './Rectificar'
import { datosPagina } from '@/lib/pagina'
import { conRepo } from '@/lib/db'
import { limiteDe, PASO, MAXIMO } from '@/lib/paginas'
import { formatearCentimos, fechaEs } from '@/lib/importes'

export const dynamic = 'force-dynamic'

const ORIGEN: Record<string, string> = { manual: 'Manual', hecho: 'Automático', rectificacion: 'Contraasiento', apertura: 'Apertura', cierre: 'Cierre' }

export default async function Diario({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx, empresa, variasEmpresas, avisos } = await datosPagina()
  const limite = limiteDe((await searchParams).n)
  const { asientos, hayMas } = await conRepo(ctx.empresaId, (r) => r.diario({ limite }))
  return (
    <>
      <Cabecera empresa={empresa} variasEmpresas={variasEmpresas} avisos={avisos} />
      <main className="contenido">
        <h1>Libro diario</h1>
        <p className="tenue">Solo lectura. Los asientos no se editan ni se borran: un error se corrige con un contraasiento.</p>
        {asientos.length === 0
          ? <p className="tenue">Sin datos: todavía no hay asientos. <a href="/asientos/nuevo">Crea el primero</a>.</p>
          : (
            <div className="tabla-scroll">
              {asientos.map((a) => {
                const debe = a.apuntes.reduce((s, p) => s + p.debe, 0)
                return (
                  <article key={a.id} className="asiento">
                    <div className="asiento-cab">
                      <strong>Nº {a.numero}/{a.ejercicio} · {fechaEs(a.fecha)}</strong>
                      <span className="estado">{ORIGEN[a.origen] ?? a.origen}</span>
                    </div>
                    <p style={{ margin: '4px 0' }}>{a.concepto}</p>
                    {a.rectificadoPor && <p className="tenue">Rectificado por un contraasiento.</p>}
                    <table>
                      <tbody>
                        {a.apuntes.map((p) => (
                          <tr key={p.orden}>
                            <td><a href={`/mayor?cuenta=${p.cuenta}&ejercicio=${a.ejercicio}`}>{p.cuenta}</a>{p.documento ? <span className="tenue"> · {p.documento}</span> : null}</td>
                            <td className="importe">{p.debe ? formatearCentimos(p.debe) : ''}</td>
                            <td className="importe">{p.haber ? formatearCentimos(p.haber) : ''}</td>
                          </tr>
                        ))}
                        <tr><td className="tenue">Total</td><td className="importe cuadre">{formatearCentimos(debe)}</td><td className="importe cuadre">{formatearCentimos(a.apuntes.reduce((s, p) => s + p.haber, 0))}</td></tr>
                      </tbody>
                    </table>
                    {!a.rectificadoPor && a.origen !== 'rectificacion' && <Rectificar id={a.id} numero={a.numero} />}
                  </article>
                )
              })}
            </div>
          )}
        {hayMas && limite < MAXIMO && <p className="ver-mas"><a className="btn btn-sec" href={`/diario?n=${limite + PASO}`}>Ver más</a></p>}
        {hayMas && limite >= MAXIMO && <p className="tenue">Se muestran los {MAXIMO} asientos más recientes.</p>}
      </main>
    </>
  )
}
