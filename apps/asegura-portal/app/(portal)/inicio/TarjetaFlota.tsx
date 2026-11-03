import Link from 'next/link'

import { resumenFlotaInicio, textosFlotaInicio, type EntradaFlotaInicio } from '@/lib/flota-inicio'
import { destinoFlota } from '@/lib/flota-destino'

import { TarjetaPortal } from '../../TarjetaPortal'

/**
 * «Mi flota» en Inicio (27/10/2026), como `TarjetaPatrimonio`: lo PENDIENTE de la flota (ITV próximas, seguros de vehículos
 * que vencen, nombramientos de jefe de flota por aceptar); el trabajo diario está en la ficha de cada sociedad (`/flota`).
 * `entrada === null` = ni siquiera se pudo leer: «no hemos podido comprobar» (nunca un 0). Las cifras y los textos salen de
 * `lib/flota-inicio.ts` (puro, con test): aquí solo se pinta.
 */
export function TarjetaFlota({ entrada }: { entrada: EntradaFlotaInicio | null }) {
  const resumen = entrada === null ? null : resumenFlotaInicio(entrada)
  const textos = resumen === null ? null : textosFlotaInicio(resumen)
  const destino = entrada === null ? destinoFlota(null, null) : destinoFlota(entrada.sociedades, entrada.nombramientos)
  const lineas = textos === null
    ? [{ texto: 'Ahora no hemos podido comprobar tu flota.', sinComprobar: true }]
    : textos.lineas
  return (
    <TarjetaPortal
      id="inicio-flota"
      antetitulo="Tu empresa"
      titulo="Mi flota"
      tono={textos?.pideAtencion ? 'aviso' : undefined}
      accion={<Link className="boton" style={{ minHeight: 44 }} href={destino}>{textos?.hayNombramientos ? 'Revisar mi flota' : 'Ver mi flota'}</Link>}
    >
      {lineas.map((l) => (
        <p key={l.texto} className={l.sinComprobar ? 'suave' : undefined} style={{ margin: '0 0 4px' }} role={l.sinComprobar ? 'status' : undefined}>
          {l.texto}
        </p>
      ))}
    </TarjetaPortal>
  )
}
