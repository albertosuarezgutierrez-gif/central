import { notFound } from 'next/navigation'
import {
  AVISO_PRESENTACION, DISENO_OFICIAL_PENDIENTE, esModeloAeat, esModeloAnual, esPeriodoModelo, vencimientoModelo, valorCasilla,
  type CalculoModelo, type CuadreIva,
} from '@central/module-contabilidad'
import { Cabecera } from '../../../../_cabecera'
import { Acciones } from './Acciones'
import { datosPagina } from '@/lib/pagina'
import { conF4 } from '@/lib/impuestos-carga'
import { extrasDeSnapshot } from '@/lib/impuestos-tablas'
import { fechaEs, formatearCentimos } from '@/lib/importes'

export const dynamic = 'force-dynamic'

type Snapshot = CalculoModelo & { cuadre?: CuadreIva | null; refAAsiento?: Record<string, string> } & Record<string, unknown>
const ETIQUETA = { borrador: 'Borrador', revisado: 'Revisado', presentado: 'Presentado' } as const

export default async function Modelo({ params }: { params: Promise<{ modelo: string; anio: string; periodo: string }> }) {
  const p = await params
  const anio = Number(p.anio)
  if (!esModeloAeat(p.modelo) || !esPeriodoModelo(p.periodo) || !Number.isInteger(anio) || anio < 2000 || anio > 2200 || esModeloAnual(p.modelo) !== (p.periodo === '0A')) notFound()
  const { ctx, empresa, variasEmpresas, avisos } = await datosPagina()
  const modelo = p.modelo
  const periodo = p.periodo
  // `declaraciones` es de 0004: si no está aplicada, la pantalla lo dice.
  const d = await conF4(ctx.empresaId, (f4) => f4.ultimaVersion(modelo, anio, periodo)).catch(() => 'sin_esquema' as const)
  const snap = d && d !== 'sin_esquema' && d.calculo ? (d.calculo as Snapshot) : null
  const refs = snap?.refAAsiento ?? {}
  const origen = (xs: readonly string[]) => (xs.length === 0 ? '' : xs.slice(0, 8).map((r) => (refs[r] ? `${r} (asiento ${refs[r]})` : r)).join(', ') + (xs.length > 8 ? ` … +${xs.length - 8}` : ''))
  const extras = snap ? extrasDeSnapshot(snap) : []
  return (
    <>
      <Cabecera empresa={empresa} variasEmpresas={variasEmpresas} avisos={avisos} />
      <main className="contenido">
        <p className="tenue"><a href="/impuestos">← Impuestos</a></p>
        <h1>Modelo {modelo} · {periodo === '0A' ? `ejercicio ${anio}` : `${periodo} ${anio}`}</h1>
        <p className="tenue">
          {d && d !== 'sin_esquema' ? <span className={`estado ${d.estado === 'borrador' ? 'estado-aviso' : 'estado-ok'}`}>{ETIQUETA[d.estado]}{d.version > 1 ? ` · complementaria ${d.version}` : ''}</span> : <span className="estado estado-aviso">Sin calcular</span>}
          {' '}Vence el {fechaEs(vencimientoModelo(modelo, anio, periodo))} (plazo general; confírmalo con tu gestor).
        </p>
        <p className="aviso-legal" role="note">{AVISO_PRESENTACION} Fichero oficial: {DISENO_OFICIAL_PENDIENTE}; mientras tanto, el borrador se descarga en HTML/PDF o CSV.</p>
        {d === 'sin_esquema' && <p className="aviso-error">Impuestos aún no está disponible para esta empresa (falta aplicar el esquema de la fase 4).</p>}
        {d !== 'sin_esquema' && (
          <Acciones id={d?.id ?? null} modelo={modelo} anio={anio} periodo={periodo} estado={d?.estado ?? null} completo={d?.completo ?? true} contabiliza={modelo === '303' || modelo === '111' || modelo === '115'} />
        )}
        {d && d !== 'sin_esquema' && d.estado === 'presentado' && (
          <p className="ok">Presentado el {d.presentadoEl ? fechaEs(d.presentadoEl) : '—'} · justificante: {d.justificante}</p>
        )}

        {snap && (
          <>
            {snap.noSoportado.length > 0 && (
              <div className="aviso-error" role="alert"><strong>No soportado (no se calcula):</strong><ul>{snap.noSoportado.map((x) => <li key={x}>{x}</li>)}</ul></div>
            )}
            {snap.cuadre && (
              snap.cuadre.ok
                ? <p className="ok">Cuadre: los libros de IVA coinciden con el mayor 477/472 de ese periodo.</p>
                : <div className="aviso-error" role="alert"><strong>Descuadre libros ↔ mayor:</strong><ul>{snap.cuadre.mensajes.map((x) => <li key={x}>{x}</li>)}</ul></div>
            )}
            {snap.avisos.length > 0 && <div className="aviso-legal"><strong>Avisos</strong><ul>{snap.avisos.map((x) => <li key={x}>{x}</li>)}</ul></div>}
            <h2>Casillas</h2>
            <p className="tenue">Las marcadas con * están pendientes de contrastar con el formulario vigente. «Origen» lista las operaciones/asientos que suman cada casilla.</p>
            <div className="tabla-scroll casillas">
              <table className="tabla-cards">
                <thead><tr><th>Casilla</th><th>Concepto</th><th className="num">Importe</th><th>Origen</th></tr></thead>
                <tbody>
                  {snap.casillas.map((c) => (
                    <tr key={c.casilla}>
                      <td>{c.casilla}{c.certeza === 'media' && <span className="media" title="Pendiente de contrastar"> *</span>}</td>
                      <td data-label="Concepto">{c.descripcion}</td>
                      <td className="num" data-label="Importe">{valorCasilla(c)}</td>
                      <td className="origen" data-label="Origen">{origen(c.origen)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr><td colSpan={2}>Resultado</td><td className="num">{snap.resultado === null ? 'no calculable' : formatearCentimos(snap.resultado)}</td><td /></tr></tfoot>
              </table>
            </div>
            {extras.map((t) => (
              <div key={t.titulo}>
                <h2>{t.titulo}</h2>
                {t.filas.length === 0 ? <p className="tenue">Sin datos.</p> : (
                  <div className="tabla-scroll">
                    <table><thead><tr>{t.columnas.map((h) => <th key={h}>{h}</th>)}</tr></thead>
                      <tbody>{t.filas.slice(0, 200).map((f, i) => <tr key={i}>{f.map((v, j) => <td key={j}>{v}</td>)}</tr>)}</tbody></table>
                  </div>
                )}
                {t.filas.length > 200 && <p className="tenue">Se muestran 200 de {t.filas.length}; el borrador descargable las incluye todas.</p>}
              </div>
            ))}
            {snap.excluidas.length > 0 && (
              <>
                <h2>Fuera del cálculo</h2>
                <ul>{snap.excluidas.slice(0, 50).map((e) => <li key={`${e.ref}-${e.motivo}`}>{e.ref}: {e.motivo}</li>)}</ul>
                {snap.excluidas.length > 50 && <p className="tenue">… y {snap.excluidas.length - 50} más.</p>}
              </>
            )}
          </>
        )}
      </main>
    </>
  )
}
