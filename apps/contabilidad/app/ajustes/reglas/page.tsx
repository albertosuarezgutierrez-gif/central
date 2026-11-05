import { Cabecera } from '../../_cabecera'
import { FormRegla } from './FormRegla'
import { datosPagina } from '@/lib/pagina'
import { conRepo } from '@/lib/db'
import { bloquesDeReglas, nombrePlantilla } from '@/lib/reglas-vista'

export const dynamic = 'force-dynamic'

export default async function Reglas() {
  const { ctx, empresa, variasEmpresas, avisos } = await datosPagina()
  const { plan, reglas } = await conRepo(ctx.empresaId, async (r) => ({ plan: await r.planCuentas(), reglas: await r.reglasVigentes() }))
  const sector = empresa?.sector ?? 'generico'
  const bloques = bloquesDeReglas(sector, reglas)
  const hojas = plan.filter((c) => c.admiteApuntes && c.activa)
  return (
    <>
      <Cabecera empresa={empresa} variasEmpresas={variasEmpresas} avisos={avisos} />
      <main className="contenido">
        <h1>Ajustes · Reglas de asiento</h1>
        <p className="tenue">
          Qué cuenta usa cada tipo de movimiento. Orden: <strong>tu regla</strong> → plantilla del sector ({nombrePlantilla(sector)}) → genérica. Cada cuenta debe existir en tu plan y ser de nivel hoja.
          Un cambio crea una versión nueva y solo vale para movimientos futuros: los asientos ya hechos no se tocan.
        </p>
        <datalist id="cuentas-hoja">{hojas.map((c) => <option key={c.codigo} value={c.codigo}>{c.nombre}</option>)}</datalist>
        {plan.length === 0 && <p className="aviso-error">Sin datos: el plan de esta empresa aún no se ha sembrado.</p>}
        {bloques.map((b) => <FormRegla key={b.tipo} tipo={b.tipo} titulo={b.titulo} filas={b.filas} admiteCategorias={b.admiteCategorias} puedeEditar={ctx.rol === 'dueno'} />)}
      </main>
    </>
  )
}
