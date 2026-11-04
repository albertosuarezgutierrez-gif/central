import { redirect } from 'next/navigation'
import { paraPagina, configDe } from '@/lib/contexto'
import { textoAsegura } from '@/lib/consentimientos'
import { citaParaRecepcion, type TxCitas } from '@/lib/citas'
import { Cabecera } from '../_marca'
import { RecepcionCliente } from './RecepcionCliente'

export const dynamic = 'force-dynamic'
const PAGINA = 50

export default async function Pagina({ searchParams }: { searchParams: Promise<{ n?: string; cita?: string }> }) {
  const sp = await searchParams
  const n = Math.min(Math.max(Number(sp.n) || PAGINA, PAGINA), 1000)
  const datos = await paraPagina('recepcion', async (tx, c) => {
    const config = await configDe(tx, c.tallerId)
    const recientes = await tx.recepcion.findMany({ where: { tallerId: c.tallerId }, orderBy: { recibidoEn: 'desc' }, take: n + 1 })
    const vehs = await tx.vehiculo.findMany({ where: { tallerId: c.tallerId, id: { in: recientes.map((r) => r.vehiculoId) } }, select: { id: true, matricula: true } })
    const mat = new Map(vehs.map((v) => [v.id, v.matricula]))
    // Viene de la agenda («Ha llegado»): se precargan matrícula y cliente de la cita viva.
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    const dc = sp.cita && uuid.test(sp.cita) ? await citaParaRecepcion(tx as unknown as TxCitas, c.tallerId, sp.cita) : null
    return {
      config,
      inicial: dc ? { citaId: dc.cita.id, matricula: dc.cita.matricula, clienteId: dc.cliente?.id ?? null, nombre: dc.cliente?.nombre ?? '', movil: dc.cliente?.movil ?? '', correo: dc.cliente?.correo ?? '', motivo: dc.cita.motivo ?? '' } : null,
      hayMas: recientes.length > n,
      recientes: recientes.slice(0, n).map((r) => ({ id: r.id, matricula: mat.get(r.vehiculoId) ?? '—', fecha: r.recibidoEn.toISOString(), firmada: r.firmadoEn != null })),
    }
  })
  if (datos === 'sin_sesion') redirect('/login')
  return (
    <>
      <Cabecera conSalir />
      <main className="contenido">
        <h1>Recepción</h1>
        {datos === 'sin_permiso' ? (
          <p className="tenue">Tu perfil no incluye la recepción de vehículos.</p>
        ) : !datos.config ? (
          <p className="tenue">Este taller aún no tiene configuración de alta. Avisa a Grupo ASegura.</p>
        ) : (
          <>
            <RecepcionCliente
              key={datos.inicial?.citaId ?? 'libre'}
              inicial={datos.inicial}
              textoAsegura={textoAsegura().texto}
              textoTaller={datos.config.textos.textoConsentimientoComercialTaller}
            />
            <h2>Recepciones recientes</h2>
            {datos.recientes.length === 0 ? <p className="tenue">Todavía no hay recepciones.</p> : (
              <ul className="lista-simple">
                {datos.recientes.map((r) => (
                  <li key={r.id}>
                    <a href={`/recepcion/${r.id}/resguardo`}>{r.matricula}</a>
                    <span className="tenue"> · {new Date(r.fecha).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}{r.firmada ? '' : ' · sin firmar'}</span>
                  </li>
                ))}
              </ul>
            )}
            {datos.hayMas && <p><a className="btn btn-sec" href={`/recepcion?n=${n + PAGINA}`}>Ver más</a></p>}
          </>
        )}
        <p><a href="/" className="btn btn-sec">Volver</a></p>
      </main>
    </>
  )
}
