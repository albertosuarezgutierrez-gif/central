import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import {
  HUECOS_CARTA,
  componerCartaNoRenovacion,
  estadoPlazoCarta,
  fechaEnLetra,
} from '@central/module-seguros-portal'

import { prisma } from '@/lib/db'
import { getIdentidad } from '@/lib/session'

import { AccionesCarta } from './AccionesCarta'

export const dynamic = 'force-dynamic'

/**
 * La carta de NO RENOVACIÓN de una póliza que el cliente AÑADIÓ (otra
 * compañía). Se compone con lo que sabemos, se enseña y la persona la copia o
 * la imprime. Aquí no se envía nada a nadie.
 *
 * 🚨 La identidad va DENTRO del `where`, igual que en la ficha de la póliza
 * añadida: si el id no es suyo, esto es un 404. Nunca un 403 (confirmaría que
 * esa póliza existe).
 *
 * 🚨 Solo para pólizas DECLARADAS. Una póliza de la cartera la media la
 * correduría: si el cliente no quiere renovarla se habla con Alberto, que es
 * quien la tramita con la compañía — y una carta «automática» ahí pisaría esa
 * relación. Por eso la ficha de la cartera no enlaza aquí.
 *
 * La otra mitad de la pantalla es la alternativa: no hace falta cancelar
 * para que la correduría pase a llevarla (cambio de mediador). Se enlaza a la
 * explicación de la web pública; el trámite en sí no está automatizado y no
 * se promete que lo esté.
 */
export default async function CartaNoRenovacion({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const identidad = await getIdentidad()
  if (!identidad) redirect('/')

  const p = await prisma.portalPolizaDeclarada.findFirst({
    where: { id, identidadId: identidad.id },
    select: { id: true, compania: true, numeroPoliza: true, ramo: true, fechaVencimiento: true, cartaEnviadaEn: true },
  })
  if (!p) notFound()

  const hoy = new Date()
  const plazo = estadoPlazoCarta({ fechaVencimiento: p.fechaVencimiento, hoy })
  const carta = componerCartaNoRenovacion({ poliza: p, tomador: identidad.nombre, hoy })

  return (
    <>
      <Link href={`/boveda/anadida/${p.id}`} className="volver solo-pantalla">
        ‹ Volver a la póliza
      </Link>

      <h1 className="ficha-titulo solo-pantalla">Carta de no renovación</h1>
      <p className="ficha-subtitulo solo-pantalla">
        {p.compania ?? 'Compañía sin identificar'}
        {p.numeroPoliza && ` · Póliza ${p.numeroPoliza}`}
      </p>

      {/* El plazo, ANTES de la carta. Es lo primero que la persona necesita
          saber, y es lo que más se pasa: el recibo llega después. */}
      <section className="seccion solo-pantalla" aria-labelledby="plazo-titulo">
        <h2 id="plazo-titulo">Tu plazo</h2>
        {plazo.estado === 'sin_fecha' && (
          <p className="pendiente" style={{ margin: 0 }}>
            No sabemos cuándo vence esta póliza, así que no podemos decirte hasta cuándo puedes enviarla.
            Ponle la fecha de vencimiento en su ficha y vuelve aquí.
          </p>
        )}
        {plazo.estado === 'en_plazo' && plazo.fechaLimite && (
          <p className="linea">
            Puedes enviarla <strong>hasta el {fechaEnLetra(plazo.fechaLimite)}</strong>
            {plazo.diasRestantes === 0 ? ' — es hoy.' : ` (quedan ${plazo.diasRestantes} días).`} Es un mes antes del
            vencimiento, que es el preaviso mínimo del tomador según el artículo 22 de la Ley de Contrato de
            Seguro. Manda la carta por un medio que deje constancia de la fecha (correo a la dirección oficial de
            la compañía, burofax o su área de cliente) y guarda el justificante.
          </p>
        )}
        {plazo.estado === 'fuera_de_plazo' && plazo.fechaLimite && (
          <p className="pendiente" style={{ margin: 0 }}>
            El último día para oponerte a esta renovación era el {fechaEnLetra(plazo.fechaLimite)}: ya ha pasado, y
            la póliza se prorroga un periodo más. La carta te sirve para el vencimiento siguiente; actualiza la
            fecha en la ficha cuando lo sepas.
          </p>
        )}
        {plazo.estado === 'vencida' && (
          <p className="pendiente" style={{ margin: 0 }}>
            La fecha de vencimiento que tenemos ya ha pasado. Lo normal es que la póliza se haya renovado y la
            fecha guardada esté vieja: corrígela en la ficha antes de fiarte de ningún plazo.
          </p>
        )}
      </section>

      {carta.huecos.length > 0 && (
        <p className="hueco solo-pantalla">
          <span className="pendiente">Rellena a mano</span>
          Antes de enviarla completa lo que va entre corchetes:{' '}
          {carta.huecos.map((h) => HUECOS_CARTA[h]).join(', ')}. No lo sabemos y no lo inventamos.
        </p>
      )}

      <section className="seccion carta" aria-labelledby="carta-titulo">
        <h2 id="carta-titulo" className="solo-pantalla">La carta</h2>
        <pre className="carta-texto">{carta.cuerpo}</pre>
        <AccionesCarta
          polizaId={p.id}
          asunto={carta.asunto}
          cuerpo={carta.cuerpo}
          enviadaEn={p.cartaEnviadaEn?.toISOString() ?? null}
          soloLectura={identidad.corredor !== null && identidad.corredor !== undefined}
        />
      </section>

      <section className="seccion solo-pantalla" aria-labelledby="alternativa-titulo">
        <p className="antetitulo">Otra opción</p>
        <h2 id="alternativa-titulo">Quedarte donde estás, y que la llevemos nosotros</h2>
        <p className="linea">
          No hace falta cancelar la póliza para que pase a llevarla la correduría: puedes nombrarnos mediador de
          esta misma póliza y sigue igual —mismas coberturas, mismo número, misma compañía—, pero con nosotros
          delante para revisarla y para el día del parte.{' '}
          <a href="https://grupoasegura.es/cambiar-de-correduria">Cómo funciona el cambio de correduría</a>.
        </p>
      </section>
    </>
  )
}
