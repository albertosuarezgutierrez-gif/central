import { Cabecera } from '../../_cabecera'
import { FormAsiento } from './FormAsiento'
import { datosPagina } from '@/lib/pagina'
import { conRepo } from '@/lib/db'

export const dynamic = 'force-dynamic'

export default async function NuevoAsiento() {
  const { ctx, empresa, variasEmpresas, avisos } = await datosPagina()
  const { cuentas, abiertos } = await conRepo(ctx.empresaId, async (r) => {
    const [plan, ejercicios] = await Promise.all([r.planCuentas(), r.ejercicios()])
    return {
      cuentas: plan.filter((c) => c.admiteApuntes && c.activa).map((c) => ({ codigo: c.codigo, nombre: c.nombre })),
      abiertos: ejercicios.filter((e) => e.estado === 'abierto').map((e) => ({ anio: e.anio, inicio: e.inicio, fin: e.fin })),
    }
  })
  return (
    <>
      <Cabecera empresa={empresa} variasEmpresas={variasEmpresas} avisos={avisos} />
      <main className="contenido">
        <h1>Nuevo asiento</h1>
        <p className="tenue">El asiento solo se guarda si cuadra (Debe = Haber), usa cuentas que admiten apuntes y cae dentro de un ejercicio abierto. Una vez guardado no se edita: se corrige con un contraasiento.</p>
        {abiertos.length === 0
          ? <p className="aviso-error">Sin datos: no hay ningún ejercicio abierto. Pide al operador que complete el alta.</p>
          : <FormAsiento cuentas={cuentas} ejercicios={abiertos} />}
      </main>
    </>
  )
}
