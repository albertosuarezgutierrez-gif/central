import { Cabecera } from '../_cabecera'
import { datosPagina } from '@/lib/pagina'
import { conRepo } from '@/lib/db'
import { limiteDe, PASO, MAXIMO } from '@/lib/paginas'
import { formatearCentimos, fechaEs } from '@/lib/importes'

export const dynamic = 'force-dynamic'

const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ''

export default async function Mayor({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx, empresa, variasEmpresas, avisos } = await datosPagina()
  const sp = await searchParams
  const cuenta = /^[1-9][0-9]{0,11}$/.test(uno(sp.cuenta)) ? uno(sp.cuenta) : ''
  const limite = limiteDe(sp.n)
  const { plan, ejercicios, mayor, anio } = await conRepo(ctx.empresaId, async (r) => {
    const [plan, ejercicios] = await Promise.all([r.planCuentas(), r.ejercicios()])
    const pedido = Number(uno(sp.ejercicio))
    const anio = ejercicios.some((e) => e.anio === pedido) ? pedido : ejercicios[0]?.anio
    const mayor = cuenta && anio !== undefined ? await r.mayor(cuenta, { limite, ejercicio: anio }) : null
    return { plan, ejercicios, mayor, anio }
  })
  const nombre = plan.find((c) => c.codigo === cuenta)?.nombre
  const qs = (n: number) => `/mayor?cuenta=${cuenta}&ejercicio=${anio}&n=${n}`
  return (
    <>
      <Cabecera empresa={empresa} variasEmpresas={variasEmpresas} avisos={avisos} />
      <main className="contenido">
        <h1>Mayor</h1>
        <form className="fila" method="get" action="/mayor">
          <label className="campo" style={{ flex: '1 1 200px' }}>Cuenta (incluye sus subcuentas)
            <input name="cuenta" list="cuentas" inputMode="numeric" defaultValue={cuenta} placeholder="p. ej. 572" required pattern="[1-9][0-9]{0,11}" />
          </label>
          <datalist id="cuentas">{plan.map((c) => <option key={c.codigo} value={c.codigo}>{c.nombre}</option>)}</datalist>
          <label className="campo" style={{ flex: '0 1 140px' }}>Ejercicio
            <select name="ejercicio" defaultValue={anio}>{ejercicios.map((e) => <option key={e.anio} value={e.anio}>{e.anio}</option>)}</select>
          </label>
          <button type="submit" className="btn" style={{ alignSelf: 'end' }}>Ver mayor</button>
        </form>
        {ejercicios.length === 0 && <p className="tenue">Sin datos: la empresa no tiene ningún ejercicio abierto todavía.</p>}
        {mayor && (
          <>
            <h2>{cuenta}{nombre ? ` · ${nombre}` : ''} · {anio}</h2>
            {mayor.n === 0
              ? <p className="tenue">Sin movimientos en {anio}.</p>
              : (
                <>
                  <p className="tenue">Movimientos: {mayor.n} · Debe {formatearCentimos(mayor.totalDebe)} · Haber {formatearCentimos(mayor.totalHaber)} · Saldo {formatearCentimos(mayor.totalDebe - mayor.totalHaber)} (positivo = deudor). Se ven primero los más recientes.</p>
                  <div className="tabla-scroll">
                    <table className="tabla-cards">
                      <thead><tr><th>Fecha · nº</th><th>Concepto</th><th>Cuenta</th><th className="num">Debe</th><th className="num">Haber</th><th className="num">Saldo</th></tr></thead>
                      <tbody>
                        {mayor.lineas.map((l, i) => (
                          <tr key={`${l.numero}-${i}`}>
                            <td>{fechaEs(l.fecha)} · {l.numero}</td>
                            <td data-label="Concepto">{l.concepto}</td>
                            <td data-label="Cuenta">{l.cuenta}</td>
                            <td data-label="Debe" className="num">{l.debe ? formatearCentimos(l.debe) : ''}</td>
                            <td data-label="Haber" className="num">{l.haber ? formatearCentimos(l.haber) : ''}</td>
                            <td data-label="Saldo" className="num">{formatearCentimos(l.saldo)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {mayor.hayMas && limite < MAXIMO && <p className="ver-mas"><a className="btn btn-sec" href={qs(limite + PASO)}>Ver más</a></p>}
                </>
              )}
          </>
        )}
      </main>
    </>
  )
}
