import { ETIQUETA_DESGLOSE, esPeriodoModelo, libroRegistroIva, rangoDeModelo, type PeriodoModelo } from '@central/module-contabilidad'
import { Cabecera } from '../../_cabecera'
import { datosPagina } from '@/lib/pagina'
import { cargarDatosFiscales } from '@/lib/impuestos-carga'
import { formatearCentimos, fechaEs } from '@/lib/importes'
import { limiteDe, PASO, MAXIMO } from '@/lib/paginas'

export const dynamic = 'force-dynamic'

export default async function Libros({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx, empresa, variasEmpresas, avisos } = await datosPagina()
  const sp = await searchParams
  const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
  const hoy = new Date()
  const qa = Number(uno(sp.anio))
  const anio = Number.isInteger(qa) && qa >= 2000 && qa <= 2200 ? qa : hoy.getUTCFullYear()
  const periodo: PeriodoModelo = esPeriodoModelo(uno(sp.periodo)) ? (uno(sp.periodo) as PeriodoModelo) : (`${Math.floor(hoy.getUTCMonth() / 3) + 1}T` as PeriodoModelo)
  const sentido = uno(sp.sentido) === 'recibidas' ? 'recibida' : 'emitida'
  const limite = limiteDe(sp.n)
  const rango = rangoDeModelo(anio, periodo)
  const { datos, truncado } = await cargarDatosFiscales(ctx.empresaId, rango.desde, rango.hasta)
  const libro = libroRegistroIva(datos.ops, sentido, rango)
  const base = new URLSearchParams({ sentido: sentido === 'emitida' ? 'emitidas' : 'recibidas', anio: String(anio), periodo })
  const descarga = (formato: string, vista = 'libro') => `/api/impuestos/libros?${base}&vista=${vista}&formato=${formato}`
  const mas = (n: number) => `/impuestos/libros?${base}&n=${n}`
  return (
    <>
      <Cabecera empresa={empresa} variasEmpresas={variasEmpresas} avisos={avisos} />
      <main className="contenido">
        <p className="tenue"><a href="/impuestos">← Impuestos</a></p>
        <h1>Libros registro de IVA</h1>
        <p className="aviso-legal" role="note">Borrador construido desde tus asientos: sin validez ante la AEAT. Úsalo para revisar con tu gestor.</p>
        <form className="filtros" method="get" action="/impuestos/libros">
          <label className="campo">Libro<select name="sentido" defaultValue={sentido === 'emitida' ? 'emitidas' : 'recibidas'}><option value="emitidas">Facturas emitidas</option><option value="recibidas">Facturas recibidas</option></select></label>
          <label className="campo">Ejercicio<input type="number" name="anio" min={2000} max={2200} defaultValue={anio} /></label>
          <label className="campo">Periodo<select name="periodo" defaultValue={periodo}>{['1T', '2T', '3T', '4T', '0A'].map((p) => <option key={p} value={p}>{p === '0A' ? 'Año completo' : p}</option>)}</select></label>
          <button type="submit" className="btn">Ver</button>
        </form>
        <p>
          <a className="btn btn-sec" href={descarga('csv')}>CSV</a>{' '}<a className="btn btn-sec" href={descarga('xlsx')}>Excel</a>{' '}
          <a className="btn btn-sec" href={descarga('html')} target="_blank" rel="noreferrer">PDF (imprimir)</a>{' '}<a className="btn btn-sec" href={descarga('xlsx', 'resumen')}>Resumen por tipo (Excel)</a>
        </p>
        {truncado && <p className="aviso-error">Hay más hechos de los que se pueden leer de una vez: el libro está incompleto.</p>}
        {[...libro.avisos, ...datos.avisos].map((a) => <p key={a} className="tenue">{a}</p>)}

        <h2>Resumen por tipo</h2>
        {libro.resumen.length === 0 ? <p className="tenue">Sin datos.</p> : (
          <div className="tabla-scroll">
            <table className="tabla-cards">
              <thead><tr><th>Desglose</th><th className="num">Líneas</th><th className="num">Base</th><th className="num">Cuota</th><th className="num">Total</th></tr></thead>
              <tbody>{libro.resumen.map((r) => <tr key={r.clave}><td>{r.etiqueta}</td><td className="num" data-label="Líneas">{r.lineas}</td><td className="num" data-label="Base">{formatearCentimos(r.base)}</td><td className="num" data-label="Cuota">{formatearCentimos(r.cuota)}</td><td className="num" data-label="Total">{formatearCentimos(r.total)}</td></tr>)}</tbody>
              <tfoot><tr><td colSpan={2}>Totales</td><td className="num">{formatearCentimos(libro.totales.base)}</td><td className="num">{formatearCentimos(libro.totales.cuota)}</td><td className="num">{formatearCentimos(libro.totales.total)}</td></tr></tfoot>
            </table>
          </div>
        )}

        <h2>Registro</h2>
        {libro.lineas.length === 0 ? <p className="tenue">Sin datos: no hay facturas en el periodo.</p> : (
          <div className="tabla-scroll">
            <table className="tabla-cards">
              <thead><tr><th>Nº</th><th>Fecha</th><th>Factura</th><th>{sentido === 'emitida' ? 'Cliente' : 'Proveedor'}</th><th>Desglose</th><th className="num">Base</th><th className="num">Tipo</th><th className="num">Cuota</th><th className="num">Total</th></tr></thead>
              <tbody>
                {libro.lineas.slice(0, limite).map((l) => (
                  <tr key={`${l.orden}`}>
                    <td>{l.orden}</td>
                    <td data-label="Fecha">{fechaEs(l.fecha)}</td>
                    <td data-label="Factura">{l.numero}</td>
                    <td data-label="Tercero">{l.nombre || '—'}<span className="tenue"> {l.nif ?? 'sin NIF'}</span></td>
                    <td data-label="Desglose">{ETIQUETA_DESGLOSE[l.clave]}{l.noDeducible ? ' · no deducible' : ''}</td>
                    <td className="num" data-label="Base">{formatearCentimos(l.base)}</td>
                    <td className="num" data-label="Tipo">{l.tipoIva} %</td>
                    <td className="num" data-label="Cuota">{formatearCentimos(l.cuota)}</td>
                    <td className="num" data-label="Total">{formatearCentimos(l.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {libro.lineas.length > limite && limite < MAXIMO && <p className="ver-mas"><a className="btn btn-sec" href={mas(limite + PASO)}>Ver más</a></p>}
      </main>
    </>
  )
}
