import { notFound } from 'next/navigation'
import { Cabecera } from '../../_cabecera'
import { datosPagina } from '@/lib/pagina'
import { conRepo } from '@/lib/db'
import { informePorClave, type ColumnaInforme } from '@/lib/informes/catalogo'
import { generarInforme, parametrosDe, type Celda } from '@/lib/informes/generar'
import { fuenteDeRepo } from '@/lib/informes/fuente'
import { limiteDe, PASO, MAXIMO } from '@/lib/paginas'
import { formatearCentimos, fechaEs } from '@/lib/importes'

export const dynamic = 'force-dynamic'

function texto(v: Celda, c: ColumnaInforme): string {
  if (v === null) return ''
  if (typeof v === 'number') return c.tipo === 'dinero' ? formatearCentimos(v) : String(v)
  return c.tipo === 'fecha' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? fechaEs(v) : v
}

export default async function Informe({ params, searchParams }: { params: Promise<{ clave: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { clave } = await params
  const def = informePorClave(clave)
  if (!def) notFound()
  const { ctx, empresa, variasEmpresas, avisos } = await datosPagina()
  const sp = await searchParams
  const p = parametrosDe(sp, new Date())
  const limite = limiteDe(sp.n)
  const tabla = (await conRepo(ctx.empresaId, (repo) => generarInforme(clave, p, fuenteDeRepo(repo)), { timeout: 30_000 }))!
  const qs = new URLSearchParams({ desde: p.desde, hasta: p.hasta, ...(p.cuenta ? { cuenta: p.cuenta } : {}) })
  const enlace = (formato: string) => `/api/informes/${clave}?${qs}&formato=${formato}`
  const visibles = tabla.filas.slice(0, limite)
  const num = (c: ColumnaInforme) => (c.tipo === 'dinero' || c.tipo === 'numero' ? 'num' : undefined)
  return (
    <>
      <Cabecera empresa={empresa} variasEmpresas={variasEmpresas} avisos={avisos} />
      <main className="contenido">
        <p className="tenue"><a href="/informes">← Informes</a></p>
        <h1>{tabla.titulo}</h1>
        <p className="tenue">{tabla.subtitulo}</p>
        <form className="filtros" method="get" action={`/informes/${clave}`}>
          {def.filtros.includes('periodo') && <label className="campo">Desde<input type="date" name="desde" defaultValue={p.desde} /></label>}
          <label className="campo">{def.filtros.includes('corte') ? 'Fecha de corte' : 'Hasta'}<input type="date" name="hasta" defaultValue={p.hasta} /></label>
          {def.filtros.includes('cuenta') && <label className="campo">Cuenta<input name="cuenta" inputMode="numeric" defaultValue={p.cuenta ?? ''} placeholder="p. ej. 430" pattern="[1-9][0-9]{0,11}" required /></label>}
          <button type="submit" className="btn">Ver informe</button>
        </form>
        <div className="descargas no-imprimir">
          <a className="btn btn-sec" href={enlace('xlsx')}>Descargar Excel</a>
          <a className="btn btn-sec" href={enlace('csv')}>Descargar CSV</a>
          <a className="btn btn-sec" href={enlace('html')} target="_blank" rel="noopener">PDF / imprimir</a>
        </div>
        {tabla.avisos.map((a) => <p key={a} className="aviso-lectura">{a}</p>)}
        {tabla.filas.length > 0 && (
          <div className="tabla-scroll">
            <table className="tabla-cards">
              <thead><tr>{tabla.columnas.map((c) => <th key={c.clave} className={num(c)}>{c.etiqueta}</th>)}</tr></thead>
              <tbody>
                {visibles.map((f, i) => (
                  <tr key={i}>{tabla.columnas.map((c, j) => <td key={c.clave} className={num(c)} data-label={j === 0 ? undefined : c.etiqueta}>{texto(f[c.clave] ?? null, c)}</td>)}</tr>
                ))}
              </tbody>
              {tabla.totales && (
                <tfoot><tr>{tabla.columnas.map((c, j) => <td key={c.clave} className={num(c)} data-label={j === 0 ? undefined : c.etiqueta}><strong>{texto(tabla.totales![c.clave] ?? null, c)}</strong></td>)}</tr></tfoot>
              )}
            </table>
          </div>
        )}
        {tabla.filas.length > limite && limite < MAXIMO && (
          <p className="ver-mas"><a className="btn btn-sec" href={`/informes/${clave}?${qs}&n=${limite + PASO}`}>Ver más ({tabla.filas.length - limite} filas más; la descarga las trae todas)</a></p>
        )}
      </main>
    </>
  )
}
