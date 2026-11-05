import { redirect } from 'next/navigation'
import { formatearEur } from '@central/module-taller'
import { paraPagina } from '@/lib/contexto'
import { cargarPanel, type TxPanel } from '@/lib/panel-dueno'
import { leerConfigContabilidad } from '@/lib/enviar-hechos'
import { Cabecera } from '../_marca'

export const dynamic = 'force-dynamic'
const hm = (min: number | null) => (min === null ? '—' : `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, '0')} min`)
const nombreMes = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString('es-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' })

/** Panel del dueño: facturación, margen por OT, horas por mecánico y estado del envío a contabilidad. Solo `margenes_ver` (dueño). */
export default async function Pagina() {
  const d = await paraPagina('margenes_ver', (tx, c) => cargarPanel(tx as unknown as TxPanel, { tallerId: c.tallerId, ahora: new Date() }))
  if (d === 'sin_sesion') redirect('/login')
  if (d === 'sin_permiso') return <main className="contenido"><p className="tenue">El panel es solo para el dueño.</p></main>
  const f = d.facturacion
  const configurado = leerConfigContabilidad() !== null
  const hayProblemas = d.envio.rechazados + d.envio.conError > 0
  return (
    <>
      <Cabecera conSalir />
      <main className="contenido">
        <h1>Panel</h1>

        <h2>Facturación</h2>
        <div className="panel-kpis">
          <div className="kpi"><span className="kpi-t">{nombreMes(f.mes)} (en curso)</span><strong>{formatearEur(f.actual.base)}</strong><span className="tenue">base · {f.actual.facturas} facturas</span></div>
          <div className="kpi"><span className="kpi-t">{nombreMes(mesPrevio(f.mes))}</span><strong>{formatearEur(f.anterior.base)}</strong><span className="tenue">base · {f.anterior.facturas} facturas</span></div>
          <div className="kpi"><span className="kpi-t">Variación</span><strong>{f.variacionPct === null ? 'Sin base' : `${f.variacionPct > 0 ? '+' : ''}${String(f.variacionPct).replace('.', ',')} %`}</strong><span className="tenue">{f.variacionPct === null ? 'el mes anterior no facturó' : 'frente al mes anterior completo'}</span></div>
        </div>

        <h2>Cobros del mes por medio</h2>
        {d.cobros.length === 0 ? <p className="tenue">Aún no hay cobros este mes.</p> : (
          <div className="tabla-scroll"><table className="tabla-cards">
            <thead><tr><th>Medio</th><th className="num">Cobros</th><th className="num">Importe</th></tr></thead>
            <tbody>
              {d.cobros.map((c) => (
                <tr key={c.medio}><td>{c.medio}</td><td className="num" data-label="Cobros">{c.cobros}</td><td className="num" data-label="Importe">{formatearEur(c.importeCent)}</td></tr>
              ))}
            </tbody>
          </table></div>
        )}

        <h2>Margen por orden (este mes)</h2>
        {d.margenes.length === 0 ? <p className="tenue">Aún no hay órdenes facturadas este mes.</p> : (
          <div className="tabla-scroll"><table className="tabla-cards">
            <thead><tr><th>Orden</th><th className="num">Ventas</th><th className="num">Coste recambios</th><th className="num">Margen</th></tr></thead>
            <tbody>
              {d.margenes.map((m) => (
                <tr key={m.otId}>
                  <td><a href={`/ordenes/${m.otId}`}>OT {m.numero ?? '—'}{m.matricula ? ` · ${m.matricula}` : ''}</a></td>
                  <td className="num" data-label="Ventas">{formatearEur(m.margen.ventasCent)}</td>
                  <td className="num" data-label="Coste recambios">{m.margen.estado === 'ok' ? formatearEur(m.margen.costeCent) : '—'}</td>
                  <td className="num" data-label="Margen">
                    {m.margen.estado === 'ok' ? formatearEur(m.margen.margenCent)
                      : m.margen.estado === 'incompleto' ? <span className="estado estado-aviso">Incompleto: faltan {m.margen.faltan} costes</span>
                        : <span className="estado estado-neutro">Sin datos</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
        <p className="tenue">El margen es ventas (base) menos el coste de los recambios. Sin el coste de las piezas no se calcula: nunca se muestra el margen igual a las ventas.</p>

        <h2>Horas por mecánico (este mes)</h2>
        {d.horas.length === 0 ? <p className="tenue">Aún no hay partes de horas este mes.</p> : (
          <div className="tabla-scroll"><table className="tabla-cards">
            <thead><tr><th>Mecánico</th><th className="num">Horas reales</th><th className="num">Baremo</th><th className="num">Rendimiento</th></tr></thead>
            <tbody>
              {d.horas.map((h) => (
                <tr key={h.mecanicoId}>
                  <td>{h.nombre}{h.partesAbiertos > 0 ? ` (${h.partesAbiertos} parte abierto)` : ''}</td>
                  <td className="num" data-label="Horas reales">{hm(h.realesMin)}</td>
                  <td className="num" data-label="Baremo">{hm(h.baremoMin)}</td>
                  <td className="num" data-label="Rendimiento">{h.rendimientoPct === null ? 'Sin baremo' : `${String(h.rendimientoPct).replace('.', ',')} %`}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
        <p className="tenue">El baremo de cada orden se reparte entre los mecánicos en proporción a sus minutos. Más de 100 % = menos tiempo que el baremo. Las órdenes sin baremo no cuentan.</p>

        <h2>Envío a contabilidad</h2>
        {!configurado && <p className="aviso-error" role="status">El envío no está configurado en este entorno: los hechos se acumulan y salen cuando se configure.</p>}
        {configurado && !d.vinculado && <p className="aviso-error" role="status">Este taller aún no está vinculado a una empresa de contabilidad: nada se envía.</p>}
        <div className="panel-kpis">
          <div className="kpi"><span className="kpi-t">Pendientes</span><strong>{d.envio.pendientes}</strong></div>
          <div className="kpi"><span className="kpi-t">Con error (se reintenta)</span><strong>{d.envio.conError}</strong></div>
          <div className="kpi"><span className="kpi-t">Rechazados</span><strong>{d.envio.rechazados}</strong></div>
          <div className="kpi"><span className="kpi-t">No soportados</span><strong>{d.envio.noSoportados}</strong></div>
        </div>
        {hayProblemas && (
          <div className="tabla-scroll"><table className="tabla-cards">
            <thead><tr><th>Hecho</th><th>Estado</th><th className="num">Intentos</th><th>Motivo</th></tr></thead>
            <tbody>
              {d.envio.ultimosRechazados.map((h) => (
                <tr key={h.id}>
                  <td>{h.tipo} {h.ref}</td>
                  <td data-label="Estado"><span className={h.estado === 'rechazado' ? 'estado estado-alerta' : 'estado estado-aviso'}>{h.estado}</span></td>
                  <td className="num" data-label="Intentos">{Number(h.intentos)}</td>
                  <td data-label="Motivo">{h.ultimoError ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
        {d.envio.noSoportados > 0 && <p className="tenue">«No soportados»: abonos, rectificativas por sustitución y anulaciones. Contabilidad aún no los admite; hay que asentarlos allí a mano.</p>}
        <p><a href="/" className="btn btn-sec">Volver</a></p>
      </main>
    </>
  )
}

function mesPrevio(m: string): string {
  const [y, n] = m.split('-').map(Number)
  return n === 1 ? `${y - 1}-12` : `${y}-${String(n - 1).padStart(2, '0')}`
}
