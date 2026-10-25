import Link from 'next/link'
import { redirect } from 'next/navigation'

import { MEDIADOR, nombreDePila, telefonoLegible } from '@central/module-seguros'

import { resumenInicio } from '@/lib/inicio'
import {
  chipPendientes,
  nombreAccesibleFamilia,
  textoCalendario,
  textoFlota,
  textoPatrimonio,
  textoTarjetaFamilia,
} from '@/lib/inicio-tarjetas'
import { getIdentidad } from '@/lib/session'

import { HuecosProteccion } from '../boveda/HuecosProteccion'

// Lee la cookie: nunca estática (si se cachease, todos verían el Inicio del primero).
export const dynamic = 'force-dynamic'

/** Una tarjeta = UN enlace con nombre accesible completo (spec §1.5). */
function Tarjeta({ href, titulo, lineas, aviso, cta, etiqueta, ancha, chip }: {
  href: string
  titulo: string
  lineas: string[]
  aviso?: string[]
  cta?: string | null
  etiqueta: string
  ancha?: boolean
  /** «N pendientes»: lo que esta tarjeta pide al cliente ahora. */
  chip?: string | null
}) {
  const cuerpo = (
    <>
      <span className="inicio-tarjeta-titulo">
        <span>{titulo}</span>
        <span aria-hidden="true">›</span>
      </span>
      {lineas.map((l) => <span key={l} className="inicio-tarjeta-linea">{l}</span>)}
      {chip && <span className="inicio-tarjeta-aviso"><span aria-hidden="true">⚠ </span>{chip}</span>}
      {aviso?.map((l) => <span key={l} className="inicio-tarjeta-aviso"><span aria-hidden="true">⚠ </span>{l}</span>)}
      {cta && <span className="inicio-tarjeta-cta">{cta}</span>}
    </>
  )
  return (
    <li className={ancha ? 'inicio-ancha' : undefined} style={{ minWidth: 0 }}>
      {href.startsWith('tel:') ? (
        <a className="inicio-tarjeta" href={href} aria-label={etiqueta}>{cuerpo}</a>
      ) : (
        <Link className="inicio-tarjeta" href={href} aria-label={etiqueta}>{cuerpo}</Link>
      )}
    </li>
  )
}

/**
 * «Inicio» (24/10/2026, spec §1): primero los seguros (por familia), después las herramientas. Una sola sugerencia
 * comercial, cerrable. Cada fuente se lee aparte (`lib/inicio.ts`): la que falla dice «no hemos podido comprobarlo»
 * y las demás se pintan. Ningún vacío se dice como «no tienes»: «no nos consta» / «aún no vemos».
 */
export default async function InicioPage() {
  const identidad = await getIdentidad()
  if (!identidad) redirect('/')
  const r = await resumenInicio(identidad.id)
  if (r === null) redirect('/')

  // El nombre sale de la IDENTIDAD; si duda, sin nombre (nunca «Hola, cliente»).
  const pila = nombreDePila(identidad.nombre)
  const tel = MEDIADOR.identidad.telefono
  const patrimonio = textoPatrimonio(r.patrimonio, r.vinculada, r.polizasSinInmueble)
  const calendario = textoCalendario(r.calendario)
  const flota = textoFlota(r.flota)

  return (
    <>
      <h1>Inicio</h1>
      {pila && <p className="suave" style={{ marginTop: 0 }}>Hola, {pila}</p>}

      <section aria-labelledby="inicio-seguros">
        <h2 id="inicio-seguros">Tus seguros</h2>
        <ul className="inicio-rejilla">
          {r.familias.map((t) => {
            const txt = textoTarjetaFamilia(t, tel)
            return (
              <Tarjeta key={t.familia} href={txt.href} titulo={t.nombre} lineas={txt.lineas} cta={txt.cta}
                chip={chipPendientes(t)} etiqueta={nombreAccesibleFamilia(t, txt)} />
            )
          })}
        </ul>
        {/* Máximo UNA sugerencia comercial por pantalla: Inicio no es un escaparate. */}
        {r.sugerencia && <HuecosProteccion huecos={r.sugerencia.huecos} estado={r.sugerencia.estado} />}
      </section>

      <section aria-labelledby="inicio-herramientas">
        <h2 id="inicio-herramientas">Tus herramientas</h2>
        <ul className="inicio-rejilla">
          <Tarjeta
            href={patrimonio.href}
            titulo="Patrimonio"
            lineas={patrimonio.aviso ? patrimonio.lineas.slice(0, 1) : patrimonio.lineas}
            aviso={patrimonio.aviso ? patrimonio.lineas.slice(1) : undefined}
            cta={patrimonio.cta}
            etiqueta={['Patrimonio:', ...patrimonio.lineas, patrimonio.cta].filter(Boolean).join(' ')}
            ancha
          />
          {flota && (
            <Tarjeta href="/flota" titulo="Flota" lineas={flota.lineas} etiqueta={['Flota:', ...flota.lineas].join(' ')} />
          )}
          <Tarjeta href="/boveda?vista=recordatorios" titulo="Calendario" lineas={calendario.lineas}
            etiqueta={['Calendario:', ...calendario.lineas].join(' ')} />
          <Tarjeta href="/boveda?vista=hoja" titulo="Mi QR" lineas={['La hoja para la nevera y el coche']}
            etiqueta="Mi QR: la hoja para la nevera y el coche" />
          <Tarjeta href="/resumen" titulo="Mi resumen" lineas={['Tu año en seguros, para la renta']}
            etiqueta="Mi resumen: tu año en seguros, para la renta" />
        </ul>
        <p style={{ margin: '0 0 24px' }}>
          <Link className="inicio-mas" href="/herramientas">Más herramientas ›</Link>
        </p>
      </section>

      <p>
        <a className="boton-secundario" href={`tel:${tel}`} style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>
          Llamar a tu corredor · {telefonoLegible()}
        </a>
      </p>
    </>
  )
}
