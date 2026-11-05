import { borrador200, borrador202, plazoModelo200, plazosCierreMercantil, DEPOSITO_XBRL_PENDIENTE, PORCENTAJE_202_ART40_2_PB, TIPO_GENERAL_IS_PB, ejercicioBase202, type CalculoIs, type LineaCuentaAnual } from '@central/module-contabilidad'
import { Cabecera } from '../_cabecera'
import { datosPagina } from '@/lib/pagina'
import { conF5 } from '@/lib/cierre-carga'
import { cuentasAnuales } from '@/lib/cierre'
import { entrada200, entrada202 } from '@/lib/sociedades-form'
import { fechaEs, formatearCentimos } from '@/lib/importes'

export const dynamic = 'force-dynamic'

type SP = Record<string, string | string[] | undefined>
const uno = (sp: SP, k: string) => { const v = sp[k]; return (Array.isArray(v) ? v[0] : v) ?? '' }
const LIBROS: [string, string][] = [
  ['libro-diario', 'Libro diario'], ['inventario-apertura', 'Inventario inicial'], ['balances-comprobacion', 'Balances de comprobación trimestrales'], ['inventario-cierre', 'Inventario de cierre'],
  ['balance-abreviado', 'Balance abreviado (activo)'], ['balance-abreviado-pasivo', 'Balance abreviado (patrimonio neto y pasivo)'], ['pyg-abreviada', 'Cuenta de pérdidas y ganancias abreviada'],
]

function Lineas({ lineas, total }: { lineas: readonly LineaCuentaAnual[]; total?: { etiqueta: string; importe: number; anterior: number | null } }) {
  return (
    <div className="tabla-scroll">
      <table className="tabla-cards">
        <thead><tr><th>Concepto</th><th className="num">Ejercicio</th><th className="num">Anterior</th></tr></thead>
        <tbody>
          {lineas.map((l) => (
            <tr key={l.clave}>
              <td style={{ paddingLeft: l.nivel === 2 ? 28 : undefined, fontWeight: l.nivel === 2 ? 400 : 700 }}>{l.etiqueta}</td>
              <td className="num" data-label="Ejercicio">{formatearCentimos(l.importe)}</td>
              <td className="num" data-label="Anterior">{l.anterior === null ? <span className="tenue" title="No se aportaron saldos del ejercicio anterior">—</span> : formatearCentimos(l.anterior)}</td>
            </tr>
          ))}
        </tbody>
        {total && <tfoot><tr><td><strong>{total.etiqueta}</strong></td><td className="num"><strong>{formatearCentimos(total.importe)}</strong></td><td className="num">{total.anterior === null ? '—' : formatearCentimos(total.anterior)}</td></tr></tfoot>}
      </table>
    </div>
  )
}

function Borrador({ c, errores, enlace }: { c: CalculoIs; errores: string[]; enlace: string }) {
  return (
    <>
      <p className="aviso-legal" role="note"><strong>Borrador sin validez ante la AEAT.</strong> Fichero oficial: {c.ficheroOficial}. Las casillas llevan identificadores propios y están <strong>pendientes de contrastar</strong> con el formulario vigente.</p>
      {errores.map((e) => <p key={e} className="aviso-error">{e}</p>)}
      {c.faltan.length > 0 && <div className="aviso-error" role="alert"><strong>Faltan datos: el resultado no se calcula hasta tenerlos.</strong><ul>{c.faltan.map((f) => <li key={f}>{f}</li>)}</ul></div>}
      <div className="tabla-scroll">
        <table className="tabla-cards">
          <thead><tr><th>Casilla</th><th>Concepto</th><th className="num">Importe</th></tr></thead>
          <tbody>
            {c.casillas.map((x) => (
              <tr key={x.codigo}>
                <td>{x.codigo} <span title="Pendiente de contrastar">*</span></td>
                <td data-label="Concepto">{x.descripcion}</td>
                <td className="num" data-label="Importe">{x.importe === null ? <span className="estado estado-aviso">pendiente: falta un dato</span> : x.codigo === 'TIPO' || x.codigo === 'PCT' ? `${x.importe / 100} %` : formatearCentimos(x.importe)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p><strong>Resultado:</strong> {c.resultado === null ? 'no calculable (faltan datos)' : formatearCentimos(c.resultado)}</p>
      {c.avisos.slice(2).map((a) => <p key={a} className="tenue">{a}</p>)}
      <p><a className="btn btn-sec" href={`${enlace}&formato=html`} target="_blank" rel="noreferrer">Borrador imprimible (PDF)</a> <a className="btn btn-sec" href={`${enlace}&formato=csv`}>CSV</a></p>
    </>
  )
}

export default async function CuentasAnualesPagina({ searchParams }: { searchParams: Promise<SP> }) {
  const { ctx, empresa, variasEmpresas, avisos } = await datosPagina()
  const sp = await searchParams
  const hoy = new Date()
  const q = Number(uno(sp, 'anio'))
  const anio = Number.isInteger(q) && q >= 2000 && q <= 2200 ? q : hoy.getUTCMonth() < 6 ? hoy.getUTCFullYear() - 1 : hoy.getUTCFullYear()
  const ca = await conF5(ctx.empresaId, (repo, f5) => cuentasAnuales(repo, f5, anio)).catch(() => undefined)
  const modelo = uno(sp, 'modelo')
  const qs = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === 'string' ? [[k, v] as [string, string]] : []))).toString()
  const enlaceIs = `/api/impuestos/sociedades?${qs}`
  let b200: { c: CalculoIs; errores: string[] } | null = null
  let b202: { c: CalculoIs; errores: string[] } | null = null
  if (ca && modelo === '200') { const r = entrada200(sp, anio, ca.pyg.resultadoAntesImpuestos); b200 = { c: borrador200(r.entrada), errores: r.errores } }
  if (modelo === '202') { const r = entrada202(sp, anio); b202 = { c: borrador202(r.entrada), errores: r.errores } }
  const saldo473 = ca ? ca.saldos.filter((s) => s.cuenta.startsWith('473')).reduce((t, s) => t + s.debe - s.haber, 0) : null
  const periodo202 = (uno(sp, 'periodo') || '1P') as '1P' | '2P' | '3P'
  return (
    <>
      <Cabecera empresa={empresa} variasEmpresas={variasEmpresas} avisos={avisos} />
      <main className="contenido">
        <h1>Cuentas anuales</h1>
        <p className="aviso-legal" role="note">Balance y cuenta de pérdidas y ganancias <strong>abreviados</strong> calculados desde tus saldos; la memoria es un <strong>borrador</strong>. La numeración de rúbricas está <strong>pendiente de contrastar</strong> con el modelo oficial vigente. La formulación, aprobación, legalización y depósito las hace el titular o su gestor: aquí solo se exporta.</p>
        <form className="filtros" method="get" action="/cuentas-anuales">
          <label className="campo">Ejercicio<input type="number" name="anio" min={2000} max={2200} defaultValue={anio} /></label>
          <button type="submit" className="btn btn-sec">Ver</button>
        </form>
        {ca === undefined && <p className="aviso-error">Las cuentas anuales aún no están disponibles para esta empresa (falta aplicar el esquema de la fase 5, 0005_cierre.sql).</p>}
        {ca === null && <p className="aviso-error">No existe el ejercicio {anio}.</p>}
        {ca && (
          <>
            <p>Estado del ejercicio: <span className={`estado ${ca.estado === 'cerrado' ? 'estado-ok' : 'estado-aviso'}`}>{ca.estado === 'cerrado' ? 'Cerrado' : 'Abierto: las cifras pueden cambiar'}</span> · <a href={`/cierre?anio=${anio}`}>Cierre del ejercicio</a></p>
            {!ca.balance.cuadra && <p className="aviso-error" role="alert">El balance no cuadra: activo {formatearCentimos(ca.balance.totalActivo)} ≠ patrimonio neto y pasivo {formatearCentimos(ca.balance.totalPatrimonioNetoYPasivo)}. Revisa el diario antes de formular.</p>}
            {ca.balance.avisos.slice(1).map((a) => <p key={a} className="tenue">{a}</p>)}
            <h2>Balance abreviado a 31/12/{anio}</h2>
            <h3>Activo</h3>
            <Lineas lineas={ca.balance.activo} total={{ etiqueta: 'TOTAL ACTIVO', importe: ca.balance.totalActivo, anterior: ca.balance.totalActivoAnterior }} />
            <h3>Patrimonio neto y pasivo</h3>
            <Lineas lineas={ca.balance.patrimonioNetoYPasivo} total={{ etiqueta: 'TOTAL PATRIMONIO NETO Y PASIVO', importe: ca.balance.totalPatrimonioNetoYPasivo, anterior: ca.balance.totalPatrimonioNetoYPasivoAnterior }} />
            <h2>Cuenta de pérdidas y ganancias abreviada {anio}</h2>
            <Lineas lineas={ca.pyg.lineas} />

            <h2>Memoria (borrador)</h2>
            <p className="tenue">Texto con los datos que hay; donde falta un dato aparece <strong>[PENDIENTE DE COMPLETAR]</strong>. <a href={`/api/cuentas-anuales?anio=${anio}&libro=memoria`}>Descargar el borrador (.txt)</a></p>
            {ca.memoria.secciones.map((s) => (
              <details key={s.titulo}><summary>{s.titulo}</summary><p style={{ whiteSpace: 'pre-line' }}>{s.texto}</p></details>
            ))}
            {ca.memoria.pendientes.length > 0 && <p className="tenue">{ca.memoria.pendientes.length} dato(s) pendientes de completar.</p>}

            <h2>Libros para legalizar y depósito (solo exportación)</h2>
            <p className="tenue">{DEPOSITO_XBRL_PENDIENTE}</p>
            <div className="tabla-scroll">
              <table className="tabla-cards">
                <thead><tr><th>Libro</th><th /></tr></thead>
                <tbody>
                  {LIBROS.map(([clave, nombre]) => (
                    <tr key={clave}><td>{nombre}</td><td><a className="btn btn-sec" href={`/api/cuentas-anuales?anio=${anio}&libro=${clave}&formato=html`} target="_blank" rel="noreferrer">PDF (imprimir)</a> <a className="btn btn-sec" href={`/api/cuentas-anuales?anio=${anio}&libro=${clave}&formato=csv`}>CSV</a></td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h3>Plazos de referencia (a contrastar)</h3>
            <ul>{plazosCierreMercantil(anio).map((p) => <li key={p.concepto}>{p.concepto}: {fechaEs(p.fecha)} <span className="tenue">({p.nota})</span></li>)}</ul>

            <h2>Borrador del modelo 200 (Impuesto sobre Sociedades) · {anio}</h2>
            <p className="tenue">Resultado contable antes de impuestos: <strong>{formatearCentimos(ca.pyg.resultadoAntesImpuestos)}</strong> (de tu contabilidad). Lo demás lo informas tú: un campo vacío es «no informado» y el resultado no se calcula; escribe 0 si de verdad es cero. Plazo orientativo: {fechaEs(plazoModelo200(anio).hasta)} ({plazoModelo200(anio).nota}).
              {saldo473 !== null && saldo473 !== 0 ? ` Saldo de retenciones y pagos a cuenta (473): ${formatearCentimos(saldo473)}.` : ''}</p>
            <form className="formulario" method="get" action="/cuentas-anuales">
              <input type="hidden" name="anio" value={anio} /><input type="hidden" name="modelo" value="200" />
              <fieldset>
                <legend>Datos del modelo 200</legend>
                <div className="dos-col">
                  <label className="campo">Ajustes positivos (€)<input name="ajp" inputMode="decimal" defaultValue={uno(sp, 'ajp')} /></label>
                  <label className="campo">Ajustes negativos (€)<input name="ajn" inputMode="decimal" defaultValue={uno(sp, 'ajn')} /></label>
                </div>
                <div className="dos-col">
                  <label className="campo">Compensación de bases negativas (€)<input name="comp" inputMode="decimal" defaultValue={uno(sp, 'comp')} /></label>
                  <label className="campo">Tipo de gravamen (%) — general: {TIPO_GENERAL_IS_PB / 100}<input name="tipo" inputMode="decimal" defaultValue={uno(sp, 'tipo')} placeholder={String(TIPO_GENERAL_IS_PB / 100)} /></label>
                </div>
                <div className="dos-col">
                  <label className="campo">Deducciones y bonificaciones (€)<input name="ded" inputMode="decimal" defaultValue={uno(sp, 'ded')} /></label>
                  <label className="campo">Retenciones e ingresos a cuenta (€)<input name="ret" inputMode="decimal" defaultValue={uno(sp, 'ret')} /></label>
                </div>
                <label className="campo">Pagos fraccionados (202) ya ingresados (€)<input name="pf" inputMode="decimal" defaultValue={uno(sp, 'pf')} /></label>
                <button type="submit" className="btn">Calcular el borrador</button>
              </fieldset>
            </form>
            {b200 && <Borrador c={b200.c} errores={b200.errores} enlace={enlaceIs} />}
          </>
        )}

        <h2>Borrador del modelo 202 (pagos fraccionados) · {anio}</h2>
        <p className="tenue">Elige la modalidad e informa los datos que pide; sin ellos el resultado no se calcula. El porcentaje por defecto ({PORCENTAJE_202_ART40_2_PB / 100} %) está <strong>pendiente de contrastar</strong>. En la modalidad del art. 40.2 la cuota base es la del ejercicio {ejercicioBase202(anio, periodo202)} (último con plazo de declaración vencido).</p>
        <form className="formulario" method="get" action="/cuentas-anuales">
          <input type="hidden" name="anio" value={anio} /><input type="hidden" name="modelo" value="202" />
          <fieldset>
            <legend>Datos del modelo 202</legend>
            <div className="dos-col">
              <label className="campo">Periodo<select name="periodo" defaultValue={uno(sp, 'periodo') || '1P'}><option value="1P">1P (abril)</option><option value="2P">2P (octubre)</option><option value="3P">3P (diciembre)</option></select></label>
              <label className="campo">Modalidad<select name="modalidad" defaultValue={uno(sp, 'modalidad')}><option value="">— elige —</option><option value="art40_2">Art. 40.2 (sobre la cuota del último ejercicio)</option><option value="art40_3">Art. 40.3 (sobre la base de los primeros meses)</option></select></label>
            </div>
            <div className="dos-col">
              <label className="campo">Art. 40.2 · Cuota íntegra (€)<input name="cib" inputMode="decimal" defaultValue={uno(sp, 'cib')} /></label>
              <label className="campo">Art. 40.2 · Deducciones y bonificaciones (€)<input name="dedb" inputMode="decimal" defaultValue={uno(sp, 'dedb')} /></label>
            </div>
            <div className="dos-col">
              <label className="campo">Art. 40.2 · Retenciones e ingresos a cuenta (€)<input name="retb" inputMode="decimal" defaultValue={uno(sp, 'retb')} /></label>
              <label className="campo">Art. 40.3 · Base imponible de los meses (€)<input name="bim" inputMode="decimal" defaultValue={uno(sp, 'bim')} /></label>
            </div>
            <div className="dos-col">
              <label className="campo">Art. 40.3 · Retenciones del periodo (€)<input name="retp" inputMode="decimal" defaultValue={uno(sp, 'retp')} /></label>
              <label className="campo">Pagos fraccionados anteriores del año (€, 2P y 3P)<input name="pag" inputMode="decimal" defaultValue={uno(sp, 'pag')} /></label>
            </div>
            <label className="campo">Porcentaje (%, opcional)<input name="pct" inputMode="decimal" defaultValue={uno(sp, 'pct')} placeholder={String(PORCENTAJE_202_ART40_2_PB / 100)} /></label>
            <button type="submit" className="btn">Calcular el borrador</button>
          </fieldset>
        </form>
        {b202 && <Borrador c={b202.c} errores={b202.errores} enlace={enlaceIs} />}
      </main>
    </>
  )
}
