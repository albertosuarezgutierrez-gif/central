import { amortizacionAcumuladaHasta, TABLA_AMORTIZACION_DEFECTO } from '@central/module-contabilidad'
import { Cabecera } from '../_cabecera'
import { BajaActivo, EditarTabla, FormAlta, FormAmortizar } from './Formularios'
import { datosPagina } from '@/lib/pagina'
import { conF5 } from '@/lib/cierre-carga'
import { fichasDe, tablaVigente } from '@/lib/cierre'
import { fechaEs, formatearCentimos } from '@/lib/importes'

export const dynamic = 'force-dynamic'

export default async function Inmovilizado() {
  const { ctx, empresa, variasEmpresas, avisos } = await datosPagina()
  const hoy = new Date()
  const hoyISO = hoy.toISOString().slice(0, 10)
  const mesActual = hoyISO.slice(0, 7)
  // Todo lo de 0005 en su propia transacción y a prueba de fallos: sin aplicar, la pantalla lo dice en vez de romper.
  const datos = await conF5(ctx.empresaId, async (repo, f5) => {
    const activos = await f5.activos()
    const tabla = await tablaVigente(f5)
    const sumas = await repo.sumasPorCuenta({ hasta: hoyISO })
    return { activos, tabla, contable28: sumas.filter((s) => s.cuenta.startsWith('28')).reduce((t, s) => t + s.haber - s.debe, 0) }
  }).catch(() => null)
  const activos = datos?.activos ?? []
  const fichas = fichasDe(activos)
  const mesAnterior = (() => { const [a, m] = mesActual.split('-').map(Number); return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}` })()
  const filas = activos.map((a, i) => {
    const acum = amortizacionAcumuladaHasta(fichas[i], mesActual)
    return { a, acum, neto: a.valorAdquisicion - acum }
  })
  const teorico = datos ? fichas.reduce((t, f) => t + amortizacionAcumuladaHasta(f, mesAnterior), 0) : null
  const tabla = datos?.tabla
  return (
    <>
      <Cabecera empresa={empresa} variasEmpresas={variasEmpresas} avisos={avisos} />
      <main className="contenido">
        <h1>Inmovilizado y amortizaciones</h1>
        <p className="aviso-legal" role="note">Método lineal. Los porcentajes de la tabla son una versión <strong>simplificada, pendiente de contrastar</strong> con la tabla fiscal vigente: revísalos con tu gestor. La amortización contable puede diferir de la fiscal.</p>
        {datos === null && <p className="aviso-error">Inmovilizado aún no está disponible para esta empresa (falta aplicar el esquema de la fase 5, 0005_cierre.sql).</p>}

        <h2>Bienes</h2>
        {filas.length === 0 ? <p className="tenue">Todavía no hay bienes. Otras verticales (p. ej. el material del empleado en RRHH) pueden darlos de alta; también puedes hacerlo a mano.</p> : (
          <div className="tabla-scroll">
            <table className="tabla-cards">
              <thead><tr><th>Bien</th><th>Alta</th><th className="num">Valor</th><th className="num">% anual</th><th className="num">Amortizado</th><th className="num">Neto</th><th>Estado</th><th /></tr></thead>
              <tbody>
                {filas.map(({ a, acum, neto }) => (
                  <tr key={a.id}>
                    <td><a href={`/inmovilizado/${encodeURIComponent(a.ref)}`}>{a.descripcion}</a> <span className="tenue">{a.ref} · {a.origen === 'manual' ? 'manual' : a.origen}</span></td>
                    <td data-label="Alta">{fechaEs(a.fechaAlta)}</td>
                    <td className="num" data-label="Valor">{formatearCentimos(a.valorAdquisicion)}</td>
                    <td className="num" data-label="% anual">{a.porcentajePb / 100} %</td>
                    <td className="num" data-label="Amortizado">{formatearCentimos(acum)}</td>
                    <td className="num" data-label="Neto">{formatearCentimos(neto)}</td>
                    <td data-label="Estado">{a.estado === 'baja' ? <span className="estado estado-aviso">Baja {a.fechaBaja ? fechaEs(a.fechaBaja) : ''}{a.resultadoBaja != null ? ` · ${a.resultadoBaja >= 0 ? 'beneficio' : 'pérdida'} ${formatearCentimos(Math.abs(a.resultadoBaja))}` : ''}</span> : <span className="estado estado-ok">Activo</span>}</td>
                    <td>{a.estado === 'activo' && <BajaActivo refActivo={a.ref} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {teorico !== null && datos && (
          <p className="tenue">Amortización acumulada teórica hasta {mesAnterior}: <strong>{formatearCentimos(teorico)}</strong> · contabilizada en las cuentas 280/281: <strong>{formatearCentimos(datos.contable28)}</strong>
            {teorico !== datos.contable28 ? <> · <span className="estado estado-aviso">Diferencia {formatearCentimos(teorico - datos.contable28)}: hay meses sin asentar o asentados sin ficha</span></> : null}</p>
        )}

        <h2>Asentar la amortización</h2>
        <p className="tenue">Un asiento por mes (o uno anual). Cada periodo se asienta una sola vez: repetirlo no duplica. Después, el ejercicio solo se puede cerrar con la amortización asentada.</p>
        <FormAmortizar anioPorDefecto={hoy.getUTCFullYear()} />

        <h2>Dar de alta un bien</h2>
        <FormAlta categorias={(tabla?.filas ?? TABLA_AMORTIZACION_DEFECTO).map((f) => ({ categoria: f.categoria, descripcion: f.descripcion, porcentajeMaximoPb: f.porcentajeMaximoPb }))} />

        <h2>Tabla de amortización{tabla?.version ? ` (versión ${tabla.version})` : ' (por defecto)'}</h2>
        <div className="tabla-scroll">
          <table className="tabla-cards">
            <thead><tr><th>Categoría</th><th>Cuenta del activo</th><th className="num">% máximo</th><th className="num">Años</th></tr></thead>
            <tbody>
              {(tabla?.filas ?? TABLA_AMORTIZACION_DEFECTO).map((f) => (
                <tr key={f.categoria}><td>{f.descripcion}</td><td data-label="Cuenta">{f.cuentaActivo}</td><td className="num" data-label="% máximo">{f.porcentajeMaximoPb / 100} %</td><td className="num" data-label="Años">{f.periodoMaximoAnios}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        {ctx.rol === 'dueno' && datos && <p><EditarTabla filas={(tabla?.filas ?? TABLA_AMORTIZACION_DEFECTO).map((f) => ({ categoria: f.categoria, descripcion: f.descripcion, cuentaActivo: f.cuentaActivo, cuentaAmortizacionAcumulada: f.cuentaAmortizacionAcumulada, cuentaGasto: f.cuentaGasto, porcentajeMaximoPb: f.porcentajeMaximoPb, periodoMaximoAnios: f.periodoMaximoAnios }))} /></p>}
      </main>
    </>
  )
}
