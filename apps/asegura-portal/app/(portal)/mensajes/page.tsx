import { redirect } from 'next/navigation'

import { agruparHilos } from '@central/module-seguros-portal'

import { carteraALaVista, carteraDeIdentidad } from '@/lib/cartera-lectura'
import { marcarLeidosDeSesion, mensajesDeSesion } from '@/lib/mensajes'
import { getIdentidad } from '@/lib/session'

import { RAMO } from '../boveda/PolizaVista'
import { Mensajes } from './Mensajes'

export const dynamic = 'force-dynamic'

/**
 * «Mensajes» con tu corredor (ASegura OS §Q.7): un hilo por póliza y uno general. Sustituye al
 * «te mando un correo y espero» y queda en la ficha. La identidad sale de la sesión; los temas que se
 * ofrecen son SUS pólizas (nunca un id de la URL), y el nombre de cada tema es el bien —matrícula o
 * dirección—, no el número de póliza, que nadie se sabe.
 */
export default async function PaginaMensajes() {
  const identidad = await getIdentidad()
  if (!identidad) redirect('/')

  const [lectura, cartera] = await Promise.all([
    mensajesDeSesion(),
    carteraDeIdentidad(identidad.id).then(carteraALaVista),
  ])

  const polizas = cartera.propias.flatMap((t) =>
    t.polizas
      .filter((p) => p.vigencia !== 'no_vigente')
      .map((p) => ({
        id: p.id,
        etiqueta: [RAMO[p.ramo] ?? p.ramo, p.compania, p.bien.matricula ?? p.bien.cosa ?? p.bien.ubicacion]
          .filter(Boolean)
          .join(' · '),
      })),
  )
  const etiquetaDe = new Map(polizas.map((p) => [p.id, p.etiqueta]))

  const hilos =
    lectura.estado === 'ok'
      ? agruparHilos(lectura.mensajes, 'cliente', (id) => (id === null ? 'General' : etiquetaDe.get(id) ?? 'Una de tus pólizas'))
      : []

  // Se sella DESPUÉS de leer (la pantalla aún marca como nuevo lo que el corredor contestó) y solo lo
  // enseñado. Un fallo al sellar no tumba la página: el mensaje sigue como no leído y ya está.
  if (lectura.estado === 'ok') {
    const vistos = lectura.mensajes.filter((m) => m.autor === 'corredor' && m.leidoAt === null).map((m) => m.id)
    await marcarLeidosDeSesion(vistos).catch((e) => {
      console.error('[mensajes] no se pudo sellar como leído:', e instanceof Error ? e.message : e)
    })
  }

  // Un hilo sobre una póliza que ya no se ofrece (vencida, o abierta por el corredor) sigue pudiendo
  // contestarse: se añade como tema para que el desplegable diga a dónde va el mensaje.
  for (const h of hilos) {
    if (h.polizaId !== null && !etiquetaDe.has(h.polizaId)) polizas.push({ id: h.polizaId, etiqueta: h.titulo })
  }

  return (
    <>
      <h1 id="titulo-vista">
        Mis <em>mensajes</em>
      </h1>
      <Mensajes
        hilos={hilos}
        polizas={polizas}
        puedeEscribir={lectura.estado === 'ok' && lectura.puedeEscribir}
        noPuede={lectura.estado === 'ok' ? lectura.noPuede : null}
        sinFicha={lectura.estado === 'sin_ficha'}
      />
    </>
  )
}
