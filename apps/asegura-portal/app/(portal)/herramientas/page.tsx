import Link from 'next/link'
import { redirect } from 'next/navigation'

import { HECHOS_DESCONOCIDOS, TEXTO_SOLICITUD_MODULO, herramientasVisibles, hrefDeVista, type TarjetaModulo } from '@central/module-seguros-portal'

import { fechaEs } from '@/lib/fechas'
import { URL_PORTAL_EMPLEADO, agruparHerramientas } from '@/lib/herramientas'
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
 * «Herramientas» (26/10/2026, menú de cinco): LA ventana de las herramientas. Patrimonio, Flota, el calendario y Mi
 * resumen (lo que antes estaba repartido entre Inicio y el menú), el Portal del Empleado (otra aplicación, con su
 * enlace) y el catálogo solicitable. El estado de cada módulo sale de `tarjetasDeSesion` (lo que el cliente tiene
 * activo se abre; lo que no, se pide): nada se activa solo. Reglas puras en `module-seguros-portal/src/modulos.ts` y
 * el reparto en `lib/herramientas.ts`.
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

  return (
    <PaginaPortal antetitulo="Herramientas" titulo="Tus" acento="herramientas">
      <p className="suave" style={{ marginTop: 0 }}>
        Herramientas gratis para nuestros clientes, pensadas alrededor de sus seguros.
      </p>

      <ul className="rejilla-portal">
        {propias.map((t) => (
          <li key={t.id}>
            <TarjetaModuloPortal t={t} />
          </li>
        ))}
        {/* Mi QR: el mismo destino que el chip de Seguros. Se ofrece siempre que se ve esta pantalla: el chip de
            «Seguros» no tiene condición propia (`SUBVISTAS_SEGUROS`) y la hoja solo enseña lo que la bóveda ya ve. */}
        <li>
          <TarjetaPortal
            id="herr-qr"
            antetitulo="Para casa y el coche"
            titulo="Mi QR para la nevera y la guantera"
            accion={<Link className="boton" href={hrefDeVista('hoja')}>Ver mi QR</Link>}
          >
            <p style={{ marginTop: 0 }}>
              Una hoja con un código QR para pegar en la nevera o dejar en la guantera: quien la escanee llega a tus
              seguros y a cómo avisarnos en un siniestro.
            </p>
          </TarjetaPortal>
        </li>
        {ver.calendario && (
          <li>
            <TarjetaPortal
              id="herr-calendario"
              antetitulo="Fechas"
              titulo="Calendario"
              accion={<Link className="boton" href="/herramientas/calendario">Abrir el calendario</Link>}
            >
              <p style={{ marginTop: 0 }}>
                Vencimientos de tus seguros, recibos, avisos, las fechas de tu patrimonio y tus propios recordatorios
                (ITV, carnet, caldera…), en un solo sitio.
              </p>
            </TarjetaPortal>
          </li>
        )}
        {ver.resumen && (
          <li>
            <TarjetaPortal
              id="herr-resumen"
              antetitulo="Cada año"
              titulo="Mi resumen"
              accion={<Link className="boton" href="/resumen">Ver mi resumen</Link>}
            >
              <p style={{ marginTop: 0 }}>Tu año en seguros, para la renta.</p>
            </TarjetaPortal>
          </li>
        )}
        {ver.catalogo && (
          <li>
            <TarjetaPortal
              id="herr-rrhh"
              antetitulo="Para tu plantilla"
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
      </ul>

      {ver.catalogo && solicitables.length > 0 && (
        <>
          <h2 style={{ marginTop: 0 }}>Para pedir</h2>
          <ul className="rejilla-portal">
            {solicitables.map((t) => (
              <li key={t.id}>
                <TarjetaModuloPortal t={t} />
              </li>
            ))}
          </ul>
        </>
      )}
    </PaginaPortal>
  )
}

/** Una tarjeta del catálogo (Patrimonio, Flota): qué es, con qué seguros tiene que ver y su botón según el estado. */
function TarjetaModuloPortal({ t }: { t: TarjetaModulo }) {
  const a = t.accion
  const pide = a.tipo === 'solicitar' || a.tipo === 'apuntarse'
  return (
    <TarjetaPortal
      id={`modulo-${t.id}`}
      antetitulo={t.id === 'flota' ? 'Empresa' : 'Inmuebles'}
      titulo={t.nombre}
      chip={t.disponibilidad !== null ? <span className="chip">{ETIQUETA_DISPONIBILIDAD[t.disponibilidad]}</span> : undefined}
      accion={
        a.tipo === 'abrir' ? (
          <Link className="boton" href={a.href}>Abrir</Link>
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
