import { redirect } from 'next/navigation'
import { diaSemanaDe, fechaLocal, sumarDias } from '@central/module-taller'
import { paraPagina, configDe } from '@/lib/contexto'
import { agendaDias, citasPendientes, listarInvitaciones, type TxCitas } from '@/lib/citas'
import { Cabecera } from '../_marca'
import { InvitarCita } from './InvitarCita'
import { CitasCliente, type CitaUi, type DiaUi } from './CitasCliente'

export const dynamic = 'force-dynamic'

const ISO = /^\d{4}-\d{2}-\d{2}$/
const ui = (c: Awaited<ReturnType<typeof citasPendientes>>[number]): CitaUi => ({
  id: c.id, inicio: c.inicio.toISOString(), duracionMinutos: c.duracionMinutos, estado: c.estado, origen: c.origen, motivo: c.motivo,
  matricula: c.matricula, clienteNombre: c.clienteNombre, clienteMovil: c.clienteMovil, recepcionId: c.recepcionId,
})

/** Agenda del taller: ocupación por día (coches por franja y % de capacidad), citas pendientes y alta de invitaciones. */
export default async function Pagina({ searchParams }: { searchParams: Promise<{ d?: string; v?: string }> }) {
  const sp = await searchParams
  const datos = await paraPagina('citas', async (tx, c) => {
    const ahora = new Date()
    const config = await configDe(tx, c.tallerId)
    if (!config) return null
    const hoy = fechaLocal(ahora, config.agenda.zonaHoraria)
    const ancla = sp.d && ISO.test(sp.d) ? sp.d : hoy
    const vista: 'dia' | 'semana' = sp.v === 'dia' ? 'dia' : 'semana'
    const desde = vista === 'dia' ? ancla : sumarDias(ancla, -((diaSemanaDe(ancla) + 6) % 7)) // lunes de esa semana
    const dias = vista === 'dia' ? 1 : 7
    const t = tx as unknown as TxCitas
    const [agenda, pendientes, invitaciones] = await Promise.all([
      agendaDias(t, { tallerId: c.tallerId, config, desde, dias, ahora }),
      citasPendientes(t, c.tallerId, ahora),
      listarInvitaciones(t, c.tallerId, ahora),
    ])
    return {
      hoy, desde, vista, dias, caducaDias: config.agenda.invitacionCaducaDias, sinHorario: config.horarioCitas.franjas.length === 0,
      confirmacion: config.agenda.confirmacion,
      agenda: agenda.map((d): DiaUi => ({
        fecha: d.ocupacion.fecha, capacidadMin: d.ocupacion.capacidadMin, ocupadoMin: d.ocupacion.ocupadoMin, otsMin: d.ocupacion.otsMin,
        porcentaje: d.ocupacion.porcentaje, saturado: d.ocupacion.saturado, franjas: d.ocupacion.franjas.map((f) => ({ hora: f.hora, coches: f.coches, max: f.maxCoches, llena: f.llena })),
        citas: d.citas.map(ui),
      })),
      pendientes: pendientes.map(ui),
      invitaciones: invitaciones.map((i) => ({ ...i, creadaEn: i.creadaEn.toISOString(), caducaEn: i.caducaEn.toISOString() })),
    }
  })
  if (datos === 'sin_sesion') redirect('/login')
  return (
    <>
      <Cabecera conSalir />
      <main className="contenido">
        <h1>Citas</h1>
        {datos === 'sin_permiso' ? (
          <p className="tenue">Tu perfil no incluye la agenda de citas.</p>
        ) : !datos ? (
          <p className="tenue">Este taller aún no tiene configuración de alta. Avisa a Grupo ASegura.</p>
        ) : (
          <>
            {datos.sinHorario && <p className="aviso-error" role="status">Sin horario de citas: configúralo en Ajustes antes de invitar a nadie.</p>}
            <InvitarCita caducaDias={datos.caducaDias} invitaciones={datos.invitaciones} />
            <CitasCliente
              desde={datos.desde} hoy={datos.hoy} vista={datos.vista} dias={datos.agenda} pendientes={datos.pendientes}
              anterior={sumarDias(datos.desde, -datos.dias)} siguiente={sumarDias(datos.desde, datos.dias)}
              confirmacion={datos.confirmacion}
            />
          </>
        )}
        <p><a href="/" className="btn btn-sec">Volver</a></p>
      </main>
    </>
  )
}
