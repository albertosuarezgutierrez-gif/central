import { redirect } from 'next/navigation'
import { exigirContexto } from '@/lib/contexto'
import { miembrosDeCuenta } from '@/lib/db'
import { Cabecera } from '../_cabecera'
import { AccesosCliente } from './AccesosCliente'
import { CATALOGO, puede } from '@central/core-herramientas'

export const dynamic = 'force-dynamic'

/** El DUEÑO reparte accesos de SU empresa: administración (por herramienta) o consulta (ve todo, no firma ni reparte). */
export default async function Accesos() {
  const ctx = await exigirContexto()
  const c = ctx.cuenta
  if (!c || !puede(c.rol, 'dar_acceso')) redirect('/')
  const miembros = await miembrosDeCuenta(ctx.personaId, c.id)
  const contratadas = c.herramientas.filter((h) => h.estado === 'activa' || h.estado === 'pendiente_firma').map((h) => ({ id: h.herramienta, nombre: CATALOGO[h.herramienta].nombre }))
  return (
    <>
      <Cabecera cuentas={ctx.cuentas} actual={c} />
      <main className="contenido">
        <h1>Accesos de {c.razonSocial}</h1>
        <p className="tenue">No se envía ningún correo: la persona entra en Mi empresa con su correo y un código. Para los empleados, el Portal del Empleado sigue siendo su entrada.</p>
        <AccesosCliente miembros={miembros} contratadas={contratadas} />
      </main>
    </>
  )
}
