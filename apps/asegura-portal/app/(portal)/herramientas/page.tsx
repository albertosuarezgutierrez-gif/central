import Link from 'next/link'
import { redirect } from 'next/navigation'

import { CATALOGO_MODULOS, HECHOS_DESCONOCIDOS, TEXTO_SOLICITUD_MODULO, herramientasVisibles, type TarjetaModulo } from '@central/module-seguros-portal'

import { fechaEs } from '@/lib/fechas'
import { empresasDeFlota, nombramientosPendientes } from '@/lib/flota'
import { RUTA_FLOTA, destinoFlota } from '@/lib/flota-destino'
import { MODULO_RRHH, URL_PORTAL_EMPLEADO, agruparHerramientas } from '@/lib/herramientas'
import { menuDeSesion } from '@/lib/menu-portal'
import { tarjetasDeSesion } from '@/lib/modulos'
import { puertaDeSesion } from '@/lib/puertas-portal'
import { getIdentidad } from '@/lib/session'

import { PaginaPortal } from '../../PaginaPortal'
import { TarjetaPortal } from '../../TarjetaPortal'
import { BotonSolicitarModulo } from './BotonSolicitarModulo'

export const dynamic = 'force-dynamic'

const ETIQUETA_DISPONIBILIDAD = {
  disponible: 'Disponible',
  bajo_solicitud: 'Bajo solicitud',
  proximamente: 'Próximamente',
} as const

/**
 * «Herramientas» (26/10/2026, menú de cinco): LA ventana de las herramientas, en DOS bloques (27/10/2026):
 *  · «Herramientas que puedes activar» = los MÓDULOS (Patrimonio, Flota, Portal del Empleado…): aquí se activan, se abren
 *    o se solicitan; el trabajo diario vive en la FICHA de cada cosa y lo pendiente, en Inicio.
 *  · «Utilidades» = el calendario y Mi resumen: vistas transversales, no se activan.
 * El estado de cada módulo sale de `tarjetasDeSesion` (lo que el cliente tiene activo se abre; lo que no, se pide): nada se
 * activa solo. El rótulo de cada tarjeta sale del catálogo (`CATALOGO_MODULOS[id].antetitulo`, `modulos.ts`), no de un
 * `if` por id. «Mi QR» ya no está aquí: vive dentro de Seguros (chip «Mi QR»). Reglas puras en
 * `module-seguros-portal/src/modulos.ts` y el reparto en `lib/herramientas.ts`.
 */
export default async function HerramientasPage() {
  const identidad = await getIdentidad()
  if (!identidad) redirect('/')
  if (!(await puertaDeSesion('herramientas', 'lectura'))) redirect('/inicio')
  const tarjetas = await tarjetasDeSesion()
  if (tarjetas === null) redirect('/')
  const { propias, solicitables, rrhh } = agruparHerramientas(tarjetas)
  // Qué se ofrece a ESTA persona (26/10/2026): quien solo tiene un alcance de flota no ve el catálogo, ni «Mi resumen»
  // (calculado sobre pólizas propias). Solo visibilidad; sin lectura (`null`) se ofrece todo.
  const ver = (await menuDeSesion().catch(() => null))?.herramientas ?? herramientasVisibles(HECHOS_DESCONOCIDOS)

  // «Abrir» Flota salta directo a la sociedad cuando solo hay una (como el atajo de «Seguros»): `destinoFlota`. Solo se lee si
  // alguna tarjeta de flota se abre; si la lectura falla, al índice (`null` no salta).
  const abreFlota = tarjetas.some((t) => t.id === 'flota' && t.accion.tipo === 'abrir')
  const hrefFlota = abreFlota
    ? await Promise.all([empresasDeFlota(identidad.id), nombramientosPendientes(identidad.id)])
        .then(([empresas, pendientes]) => destinoFlota(empresas, pendientes.length))
        .catch(() => destinoFlota(null, null))
    : destinoFlota(null, null)

  // Qué hay en cada bloque. Los módulos abiertos se ven siempre; el catálogo (RRHH y lo solicitable) solo si `ver.catalogo`.
  const hayModulos = propias.length > 0 || ver.catalogo
  const hayUtilidades = ver.calendario || ver.resumen

  return (
    <PaginaPortal antetitulo="Herramientas" titulo="Tus" acento="herramientas">
      <p className="suave" style={{ marginTop: 0 }}>
        Herramientas gratis, pensadas alrededor de tus seguros. No hace falta tenerlos con nosotros: el acceso lo autoriza la correduría.
      </p>

      {hayModulos && (
        <>
          <h2 id="herramientas-activar" style={{ marginTop: 0 }}>Herramientas que puedes activar</h2>
          <ul className="rejilla-portal" aria-labelledby="herramientas-activar">
            {propias.map((t) => (
              <li key={t.id}>
                <TarjetaModuloPortal t={t} hrefFlota={hrefFlota} />
              </li>
            ))}
            {ver.catalogo && (
              <li>
                <TarjetaPortal
                  id="herr-rrhh"
                  antetitulo={CATALOGO_MODULOS[MODULO_RRHH].antetitulo}
                  nivel={3}
                  titulo="Portal del Empleado (RRHH)"
                  accion={
                    <>
                      <a className="boton" href={URL_PORTAL_EMPLEADO} target="_blank" rel="noopener noreferrer">
                        Abrir el Portal del Empleado
                      </a>
                      {rrhh && (rrhh.accion.tipo === 'solicitar' || rrhh.accion.tipo === 'apuntarse') && (
                        <div className="acciones-nota">
                          ¿Tu empresa aún no lo tiene? <BotonSolicitarModulo modulo={rrhh.id} rotulo="Solicítalo" variante="enlace" />
                        </div>
                      )}
                    </>
                  }
                >
                  <p style={{ marginTop: 0 }}>
                    Fichaje, vacaciones, nóminas y documentos de tu plantilla. Es otra aplicación, con su propio acceso.
                  </p>
                  {rrhh && <EstadoSolicitud t={rrhh} />}
                </TarjetaPortal>
              </li>
            )}
            {ver.catalogo && solicitables.length > 0 && solicitables.map((t) => (
              <li key={t.id}>
                <TarjetaModuloPortal t={t} hrefFlota={hrefFlota} />
              </li>
            ))}
          </ul>
        </>
      )}

      {hayUtilidades && (
        <>
          <h2 id="herramientas-utilidades" style={hayModulos ? undefined : { marginTop: 0 }}>Utilidades</h2>
          <ul className="rejilla-portal" aria-labelledby="herramientas-utilidades">
            {ver.calendario && (
              <li>
                <TarjetaPortal
                  id="herr-calendario"
                  antetitulo="Fechas"
                  nivel={3}
                  titulo="Calendario"
                  accion={<Link className="boton" href="/herramientas/calendario">Abrir el calendario</Link>}
                >
                  <p style={{ marginTop: 0 }}>
                    Vencimientos de tus seguros, recibos, avisos, las fechas de tu patrimonio, la ITV de tu flota y tus propios
                    recordatorios (carnet, caldera…), en un solo sitio.
                  </p>
                </TarjetaPortal>
              </li>
            )}
            {ver.resumen && (
              <li>
                <TarjetaPortal
                  id="herr-resumen"
                  antetitulo="Cada año"
                  nivel={3}
                  titulo="Mi resumen"
                  accion={<Link className="boton" href="/resumen">Ver mi resumen</Link>}
                >
                  <p style={{ marginTop: 0 }}>Tu año en seguros, para la renta.</p>
                </TarjetaPortal>
              </li>
            )}
          </ul>
        </>
      )}
    </PaginaPortal>
  )
}

/**
 * Una tarjeta del catálogo (Patrimonio, Flota): qué es, con qué seguros tiene que ver y su botón según el estado. El rótulo
 * pequeño es `t.antetitulo` (del catálogo). «Abrir» de Flota va a `hrefFlota` (directo a la sociedad si solo hay una).
 */
function TarjetaModuloPortal({ t, hrefFlota }: { t: TarjetaModulo; hrefFlota: string }) {
  const a = t.accion
  const pide = a.tipo === 'solicitar' || a.tipo === 'apuntarse'
  return (
    <TarjetaPortal
      id={`modulo-${t.id}`}
      antetitulo={t.antetitulo}
      nivel={3}
      titulo={t.nombre}
      chip={t.disponibilidad !== null ? <span className="chip">{ETIQUETA_DISPONIBILIDAD[t.disponibilidad]}</span> : undefined}
      accion={
        a.tipo === 'abrir' ? (
          <Link className="boton" href={t.id === 'flota' && a.href === RUTA_FLOTA ? hrefFlota : a.href}>Abrir</Link>
        ) : pide ? (
          <BotonSolicitarModulo modulo={t.id} rotulo={a.tipo === 'apuntarse' ? 'Apuntarme' : 'Solicitar'} />
        ) : undefined
      }
    >
      <p style={{ marginTop: 0, marginBottom: 4 }}>{t.descripcion}</p>
      <p className="suave" style={{ marginTop: 0, fontSize: 14 }}>Relacionado con: {t.seguros}</p>
      {pide && <p className="suave" style={{ fontSize: 14 }}>{TEXTO_SOLICITUD_MODULO}</p>}
      <EstadoSolicitud t={t} />
    </TarjetaPortal>
  )
}

/** El estado de lo ya pedido (o activo, o sin comprobar). El botón de pedir NO va aquí: va en `.acciones` de la tarjeta. */
function EstadoSolicitud({ t }: { t: TarjetaModulo }) {
  const a = t.accion
  if (a.tipo === 'solicitado') {
    return (
      <p className="aviso-linea" role="status" style={{ marginBottom: 0 }}>
        Lo pediste el {fechaEs(a.desde)}. Tu corredor se pondrá en contacto contigo para activarlo.
      </p>
    )
  }
  if (a.tipo === 'activo') {
    return <p className="aviso-linea" role="status" style={{ marginBottom: 0 }}>{a.texto}</p>
  }
  if (a.tipo === 'sin_comprobar') {
    return (
      <p className="aviso-linea" role="status" style={{ marginBottom: 0 }}>
        Ahora mismo no hemos podido comprobar si ya lo tienes o lo has pedido. Vuelve a intentarlo en un rato.
      </p>
    )
  }
  return null
}
