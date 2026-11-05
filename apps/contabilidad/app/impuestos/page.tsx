import { avisosFiscalesDeHoy, AVISO_PRESENTACION, esModeloAnual, modelosDeForma, proximosPlazos, vencimientoModelo, type EstadoDeclaracion, type ModeloAeat, type PeriodoModelo } from '@central/module-contabilidad'
import { Cabecera } from '../_cabecera'
import { datosPagina } from '@/lib/pagina'
import { conF4 } from '@/lib/impuestos-carga'
import type { FilaDeclaracion } from '@/lib/repo-f4'
import { fechaEs, formatearCentimos } from '@/lib/importes'

export const dynamic = 'force-dynamic'

const NOMBRES: Record<ModeloAeat, string> = {
  '303': 'IVA trimestral', '390': 'Resumen anual de IVA', '111': 'Retenciones trabajo y profesionales', '115': 'Retenciones por alquileres',
  '190': 'Resumen anual 111', '180': 'Resumen anual 115', '347': 'Operaciones con terceros', '349': 'Operaciones intracomunitarias', '130': 'Pago fraccionado IRPF (autónomos)',
}
const ETIQUETA: Record<EstadoDeclaracion | 'sin_calcular', string> = { sin_calcular: 'Sin calcular', borrador: 'Borrador', revisado: 'Revisado', presentado: 'Presentado' }
const CLASE: Record<EstadoDeclaracion | 'sin_calcular', string> = { sin_calcular: 'estado-aviso', borrador: 'estado-aviso', revisado: 'estado-ok', presentado: 'estado-ok' }

function ultima(ds: readonly FilaDeclaracion[], modelo: ModeloAeat, periodo: PeriodoModelo): FilaDeclaracion | undefined {
  return ds.filter((d) => d.modelo === modelo && d.periodo === periodo).sort((a, b) => b.version - a.version)[0]
}

export default async function Impuestos({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx, empresa, variasEmpresas, avisos } = await datosPagina()
  const hoy = new Date()
  const q = Number((await searchParams).anio)
  const anio = Number.isInteger(q) && q >= 2000 && q <= 2200 ? q : hoy.getUTCFullYear()
  const forma = empresa?.forma === 'autonomo' ? 'autonomo' : 'sociedad'
  // `declaraciones` es de 0004: si aún no está aplicada, la pantalla lo dice en vez de romper.
  const ds = await conF4(ctx.empresaId, (f4) => f4.declaraciones(anio)).catch(() => null)
  const dsPrev = await conF4(ctx.empresaId, (f4) => f4.declaraciones(anio - 1)).catch(() => null)
  const todas = [...(ds ?? []), ...(dsPrev ?? [])]
  const plazos = proximosPlazos(hoy, forma, 120)
  const avisosHoy = avisosFiscalesDeHoy(hoy, forma)
  const modelos = modelosDeForma(forma)
  const enlace = (m: ModeloAeat, a: number, p: PeriodoModelo) => `/impuestos/${m}/${a}/${p}`
  return (
    <>
      <Cabecera empresa={empresa} variasEmpresas={variasEmpresas} avisos={avisos} />
      <main className="contenido">
        <h1>Impuestos</h1>
        <p className="aviso-legal" role="note">{AVISO_PRESENTACION} Todo lo que ves aquí son <strong>borradores revisables</strong>: sin validez ante la AEAT.</p>
        <p className="tenue">Los plazos son los del calendario general (si caen en festivo se trasladan al siguiente día hábil): confírmalos con tu gestor. Prorrata y recargo de equivalencia no están soportados: si aparecen, el modelo se marca «no soportado» y no se calcula.</p>
        {ds === null && <p className="aviso-error">Impuestos aún no está disponible para esta empresa (falta aplicar el esquema de la fase 4). Los libros de IVA sí funcionan.</p>}

        {avisosHoy.length > 0 && (
          <>
            <h2>Vencen pronto</h2>
            <ul className="lista-avisos">
              {avisosHoy.map((a) => (
                <li key={`${a.vencimiento.id}-${a.umbral}`} className={a.umbral === 1 ? 'alerta' : 'aviso'}>
                  <strong>{a.vencimiento.titulo}</strong>
                  <span>Modelos {a.vencimiento.modelos}: {a.diasRestantes === 0 ? 'vence hoy' : `quedan ${a.diasRestantes} día(s)`} ({fechaEs(a.vencimiento.fecha)}).</span>
                </li>
              ))}
            </ul>
          </>
        )}

        <h2>Próximos vencimientos</h2>
        {plazos.length === 0 ? <p className="tenue">Sin vencimientos en los próximos 120 días.</p> : (
          <div className="tabla-scroll">
            <table className="tabla-cards">
              <thead><tr><th>Modelo</th><th>Periodo</th><th>Vence</th><th className="num">Días</th><th>Estado</th></tr></thead>
              <tbody>
                {plazos.map((p) => {
                  const d = todas.filter((x) => x.modelo === p.modelo && x.anio === p.anio && x.periodo === p.periodo).sort((x, y) => y.version - x.version)[0]
                  const e = d?.estado ?? 'sin_calcular'
                  return (
                    <tr key={`${p.modelo}-${p.anio}-${p.periodo}`}>
                      <td><a href={enlace(p.modelo, p.anio, p.periodo)}>Modelo {p.modelo}</a> <span className="tenue">{NOMBRES[p.modelo]}</span></td>
                      <td data-label="Periodo">{p.periodo === '0A' ? `Anual ${p.anio}` : `${p.periodo} ${p.anio}`}</td>
                      <td data-label="Vence">{fechaEs(p.vencimiento)}</td>
                      <td className="num" data-label="Días">{p.diasRestantes}</td>
                      <td data-label="Estado"><span className={`estado ${CLASE[e]}`}>{ETIQUETA[e]}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <h2>Estado por modelo · ejercicio {anio}</h2>
        <form className="filtros" method="get" action="/impuestos">
          <label className="campo">Ejercicio<input type="number" name="anio" min={2000} max={2200} defaultValue={anio} /></label>
          <button type="submit" className="btn btn-sec">Ver</button>
        </form>
        <div className="tabla-scroll">
          <table className="tabla-cards">
            <thead><tr><th>Modelo</th><th>1T</th><th>2T</th><th>3T</th><th>4T</th><th>Anual</th></tr></thead>
            <tbody>
              {modelos.map((m) => (
                <tr key={m}>
                  <td><strong>{m}</strong> <span className="tenue">{NOMBRES[m]}</span></td>
                  {(['1T', '2T', '3T', '4T', '0A'] as const).map((p) => {
                    if (esModeloAnual(m) !== (p === '0A')) return <td key={p} data-label={p === '0A' ? 'Anual' : p}><span className="tenue">—</span></td>
                    const d = ultima(ds ?? [], m, p)
                    const e = d?.estado ?? 'sin_calcular'
                    return (
                      <td key={p} data-label={p === '0A' ? 'Anual' : p}>
                        <a href={enlace(m, anio, p)} className={`estado ${CLASE[e]}`}>{ETIQUETA[e]}{d && d.version > 1 ? ` (compl. ${d.version})` : ''}</a>
                        {d?.resultado != null && <span className="tenue"> {formatearCentimos(d.resultado)}</span>}
                        {d && !d.completo && <span className="tenue"> · no soportado</span>}
                        <span className="tenue"> · vence {fechaEs(vencimientoModelo(m, anio, p))}</span>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2>Libros registro de IVA</h2>
        <p className="tenue">Facturas emitidas y recibidas con su desglose por tipo (21/10/4/0, exentas, inversión del sujeto pasivo, intracomunitarias), exportables a CSV y Excel. <a href="/impuestos/libros">Abrir los libros</a>.</p>
      </main>
    </>
  )
}
