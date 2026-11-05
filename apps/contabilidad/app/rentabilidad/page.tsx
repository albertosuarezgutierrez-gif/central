import { Cabecera } from '../_cabecera'
import { BarrasHorizontales } from '../graficas'
import { datosPagina } from '@/lib/pagina'
import { conRepo } from '@/lib/db'
import { datosRentabilidad, dimensionesDe } from '@/lib/rentabilidad'
import { limiteDe, PASO, MAXIMO } from '@/lib/paginas'
import { formatearCentimos, fechaEs } from '@/lib/importes'
import { esTipoPeriodo, rangoPeriodo, type TipoPeriodo } from '@central/module-contabilidad'

export const dynamic = 'force-dynamic'
const NOMBRE: Record<TipoPeriodo, string> = { mes: 'Mes', trimestre: 'Trimestre', anio: 'Año' }

export default async function Rentabilidad({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx, empresa, variasEmpresas, avisos } = await datosPagina()
  const sp = await searchParams
  const tipo: TipoPeriodo = esTipoPeriodo(sp.periodo) ? sp.periodo : 'anio'
  const r = rangoPeriodo(tipo, new Date())
  const limite = limiteDe(sp.n)
  const sector = empresa?.sector ?? 'generico'
  const { dimension, filas } = await conRepo(ctx.empresaId, (repo) => datosRentabilidad(repo, sector, sp.dim, r), { timeout: 20_000 })
  const visibles = filas.slice(0, limite)
  const maxAbs = Math.max(1, ...filas.map((f) => Math.abs(f.margen)))
  const enlace = (extra: Record<string, string | number>) => `/rentabilidad?${new URLSearchParams({ periodo: tipo, dim: dimension.clave, ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, String(v)])) })}`
  return (
    <>
      <Cabecera empresa={empresa} variasEmpresas={variasEmpresas} avisos={avisos} />
      <main className="contenido">
        <h1>Rentabilidad</h1>
        <nav className="periodos" aria-label="Eje de análisis">
          {dimensionesDe(sector).map((d) => (
            <a key={d.clave} href={`/rentabilidad?periodo=${tipo}&dim=${d.clave}`} className={d.clave === dimension.clave ? 'activo' : undefined} aria-current={d.clave === dimension.clave ? 'true' : undefined}>{d.etiqueta}</a>
          ))}
        </nav>
        <nav className="periodos" aria-label="Periodo">
          {(['mes', 'trimestre', 'anio'] as const).map((t) => (
            <a key={t} href={`/rentabilidad?periodo=${t}&dim=${dimension.clave}`} className={t === tipo ? 'activo' : undefined} aria-current={t === tipo ? 'true' : undefined}>{NOMBRE[t]}</a>
          ))}
        </nav>
        <p className="tenue">{dimension.ayuda}. Del {fechaEs(r.desde)} al {fechaEs(r.hasta)}. Margen = ingresos − gastos de los asientos que llegaron con ese dato; lo que llegó sin él aparece como «Sin asignar».</p>
        {filas.length === 0
          ? <p className="tenue">Sin datos: ningún asiento del periodo trae gastos o ingresos para analizar.</p>
          : (
            <>
              <div className="graficas">
                <BarrasHorizontales titulo={`Margen por ${dimension.etiqueta.toLowerCase()}`} etiqueta={`Barras del margen por ${dimension.etiqueta}`} semaforo
                  datos={filas.slice(0, 12).map((f) => ({ nombre: f.valor ?? 'Sin asignar', valor: f.margen }))} />
              </div>
              <div className="tabla-scroll">
                <table className="tabla-cards">
                  <thead><tr><th>{dimension.etiqueta}</th><th className="num">Ingresos</th><th className="num">Gastos</th><th className="num">Margen</th><th className="num">Margen %</th><th>Peso</th></tr></thead>
                  <tbody>
                    {visibles.map((f) => (
                      <tr key={f.valor ?? '∅'}>
                        <td>{f.valor ?? 'Sin asignar'}</td>
                        <td data-label="Ingresos" className="num">{f.ingresos === null ? 'Sin datos' : formatearCentimos(f.ingresos)}</td>
                        <td data-label="Gastos" className="num">{f.gastos === null ? 'Sin datos' : formatearCentimos(f.gastos)}</td>
                        <td data-label="Margen" className="num">{formatearCentimos(f.margen)}</td>
                        <td data-label="Margen %" className="num">{f.margenPct === null ? 'Sin datos' : `${String(f.margenPct).replace('.', ',')} %`}</td>
                        <td data-label="Peso"><div className="barra-margen" aria-hidden="true"><span className={f.margen < 0 ? 'neg' : undefined} style={{ width: `${Math.max(2, Math.round((Math.abs(f.margen) * 100) / maxAbs))}%` }} /></div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filas.length > limite && limite < MAXIMO && <p className="ver-mas"><a className="btn btn-sec" href={enlace({ n: limite + PASO })}>Ver más</a></p>}
            </>
          )}
      </main>
    </>
  )
}
