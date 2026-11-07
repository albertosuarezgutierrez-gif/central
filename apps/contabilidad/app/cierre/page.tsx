import { repartirPeriodificacion } from '@central/module-contabilidad'
import { Cabecera } from '../_cabecera'
import { AccionesCierre, FormPeriodificacion } from './Formularios'
import { datosPagina } from '@/lib/pagina'
import { conF5 } from '@/lib/cierre-carga'
import { diagnosticoCierre } from '@/lib/cierre'
import { fechaEs, formatearCentimos } from '@/lib/importes'

export const dynamic = 'force-dynamic'

export default async function Cierre({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx, empresa, variasEmpresas, avisos } = await datosPagina()
  const hoy = new Date()
  const q = Number((await searchParams).anio)
  // Por defecto el ejercicio que toca cerrar: el anterior hasta junio, el actual después.
  const anio = Number.isInteger(q) && q >= 2000 && q <= 2200 ? q : hoy.getUTCMonth() < 6 ? hoy.getUTCFullYear() - 1 : hoy.getUTCFullYear()
  const datos = await conF5(ctx.empresaId, async (repo, f5) => ({
    dx: await diagnosticoCierre(repo, f5, anio, hoy), periodificaciones: await f5.periodificaciones(), cierres: await f5.cierres(), cierre: await f5.cierre(anio),
  })).catch(() => null)
  return (
    <>
      <Cabecera empresa={empresa} variasEmpresas={variasEmpresas} avisos={avisos} />
      <main className="contenido">
        <h1>Cierre del ejercicio</h1>
        <p className="aviso-legal" role="note">El cierre genera la <strong>regularización</strong> (cuentas 6 y 7 a la 129), el <strong>asiento de cierre</strong> y la <strong>apertura</strong> del ejercicio siguiente. Es <strong>definitivo</strong>. La aplicación del resultado (reservas, dividendos) la acuerda la junta y se asienta aparte.</p>
        {datos === null && <p className="aviso-error">El cierre aún no está disponible para esta empresa (falta aplicar el esquema de la fase 5, 0005_cierre.sql).</p>}
        <form className="filtros" method="get" action="/cierre">
          <label className="campo">Ejercicio<input type="number" name="anio" min={2000} max={2200} defaultValue={anio} /></label>
          <button type="submit" className="btn btn-sec">Ver</button>
        </form>

        {datos && (
          <>
            <h2>Comprobaciones previas · {anio}</h2>
            {datos.cierre ? (
              <p className="ok">Ejercicio {anio} cerrado. Resultado: <strong>{formatearCentimos(datos.cierre.resultado)}</strong> ({datos.cierre.resultado >= 0 ? 'beneficio' : 'pérdida'}). <a href={`/cuentas-anuales?anio=${anio}`}>Ver las cuentas anuales</a>.</p>
            ) : (
              <>
                <div className="tabla-scroll">
                  <table className="tabla-cards">
                    <thead><tr><th>Comprobación</th><th>Estado</th><th>Detalle</th></tr></thead>
                    <tbody>
                      {datos.dx.comprobaciones.map((c) => (
                        <tr key={c.clave}>
                          <td>{c.titulo}</td>
                          <td data-label="Estado"><span className={`estado ${c.ok ? 'estado-ok' : c.bloquea ? 'estado-alerta' : 'estado-aviso'}`}>{c.ok ? 'Correcto' : c.bloquea ? 'Pendiente' : 'Revisar'}</span></td>
                          <td data-label="Detalle">{c.detalle}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="tenue">Resultado provisional del ejercicio: {datos.dx.resultadoProvisional === null ? 'no disponible' : <strong>{formatearCentimos(datos.dx.resultadoProvisional)}</strong>}. <a href="/inmovilizado">Amortizaciones</a> · <a href={`/cuentas-anuales?anio=${anio}`}>Cuentas anuales y borrador del modelo 200</a>.</p>
                <AccionesCierre anio={anio} puedeCerrar={datos.dx.puedeCerrar} esDueno={ctx.rol === 'dueno'} />
              </>
            )}

            <h2>Periodificaciones</h2>
            <p className="tenue">Gastos pagados o ingresos cobrados por adelantado: al cierre, la parte que corresponde al futuro se difiere (480 / 485) y el 1 de enero se revierte.</p>
            {datos.periodificaciones.length === 0 ? <p className="tenue">No hay periodificaciones registradas.</p> : (
              <div className="tabla-scroll">
                <table className="tabla-cards">
                  <thead><tr><th>Concepto</th><th>Tipo</th><th>Periodo</th><th className="num">Importe</th><th className="num">A diferir al 31/12/{anio}</th></tr></thead>
                  <tbody>
                    {datos.periodificaciones.slice(0, 50).map((p) => (
                      <tr key={p.ref}>
                        <td>{p.descripcion} <span className="tenue">{p.ref} · {p.cuentaOrigen}</span></td>
                        <td data-label="Tipo">{p.tipo === 'gasto' ? 'Gasto anticipado' : 'Ingreso anticipado'}</td>
                        <td data-label="Periodo">{fechaEs(p.inicio)} – {fechaEs(p.fin)}</td>
                        <td className="num" data-label="Importe">{formatearCentimos(p.importe)}</td>
                        <td className="num" data-label="A diferir">{formatearCentimos(repartirPeriodificacion(p, `${anio}-12-31`).diferido)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {datos.periodificaciones.length > 50 && <p className="tenue">Se muestran las 50 primeras de {datos.periodificaciones.length}.</p>}
            <FormPeriodificacion />

            <h2>Ejercicios cerrados</h2>
            {datos.cierres.length === 0 ? <p className="tenue">Todavía no se ha cerrado ningún ejercicio.</p> : (
              <div className="tabla-scroll">
                <table className="tabla-cards">
                  <thead><tr><th>Ejercicio</th><th className="num">Resultado</th><th /></tr></thead>
                  <tbody>
                    {datos.cierres.map((c) => (
                      <tr key={c.anio}><td>{c.anio}</td><td className="num" data-label="Resultado">{formatearCentimos(c.resultado)}</td><td><a href={`/cuentas-anuales?anio=${c.anio}`}>Cuentas anuales</a></td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </main>
    </>
  )
}
