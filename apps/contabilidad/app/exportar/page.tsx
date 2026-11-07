import { Cabecera } from '../_cabecera'
import { datosPagina } from '@/lib/pagina'
import { conRepo } from '@/lib/db'
import { AVISO_PENDIENTE_CONTRASTAR, A3_LONGITUD_CUENTA_DEFECTO } from '@central/module-contabilidad'

export const dynamic = 'force-dynamic'

/** Exportación del diario y del plan a A3, Sage y Holded. El formulario es un GET normal a /api/exportar (descarga directa, sin JavaScript). */
export default async function Exportar() {
  const { ctx, empresa, variasEmpresas, avisos } = await datosPagina()
  const ejercicios = await conRepo(ctx.empresaId, (r) => r.ejercicios()).catch(() => [])
  const hoy = new Date().getUTCFullYear()
  return (
    <>
      <Cabecera empresa={empresa} variasEmpresas={variasEmpresas} avisos={avisos} />
      <main className="contenido">
        <h1>Exportar a la gestoría</h1>
        <p className="aviso-legal" role="note"><strong>Formatos pendientes de contrastar.</strong> {AVISO_PENDIENTE_CONTRASTAR} Hasta entonces, trátalos como un borrador de integración: el diseño exacto de A3 (posiciones del fichero) no se ha podido verificar contra un fichero real, y Sage y Holded siguen las columnas habituales sin confirmar con una importación de prueba.</p>
        <form className="formulario" method="get" action="/api/exportar">
          <label className="campo">Programa de destino
            <select name="formato" defaultValue="sage">
              <option value="a3">A3 (fichero de enlace, ancho fijo) · pendiente de contrastar</option>
              <option value="sage">Sage / ContaPlus (CSV) · pendiente de contrastar</option>
              <option value="holded">Holded (CSV) · pendiente de contrastar</option>
            </select>
          </label>
          <label className="campo">Qué exportar
            <select name="que" defaultValue="diario"><option value="diario">Libro diario del ejercicio</option><option value="plan">Plan de cuentas</option></select>
          </label>
          <label className="campo">Ejercicio (para el diario)
            <select name="anio" defaultValue={String(ejercicios[0]?.anio ?? hoy)}>
              {(ejercicios.length ? ejercicios.map((e) => e.anio) : [hoy]).map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>
          <fieldset>
            <legend>Solo para A3</legend>
            <div className="dos-col">
              <label className="campo">Código de la empresa en A3 (1-5 cifras)<input name="codigoA3" inputMode="numeric" maxLength={5} pattern="[0-9]{1,5}" placeholder="Te lo da tu gestoría" /></label>
              <label className="campo">Longitud de subcuenta<input name="longitudCuenta" inputMode="numeric" defaultValue={A3_LONGITUD_CUENTA_DEFECTO} maxLength={2} /></label>
            </div>
            <p className="tenue">El código de empresa es el que tiene la empresa en A3 (no es el NIF). No lo inventamos: sin él, la exportación a A3 se rechaza.</p>
          </fieldset>
          <button type="submit" className="btn">Descargar</button>
        </form>
        <p className="tenue">Un asiento descuadrado o con una cuenta que no está en el plan no se exporta: se avisa en vez de entregar un fichero a medias.</p>
      </main>
    </>
  )
}
