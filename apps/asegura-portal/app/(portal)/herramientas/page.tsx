import Link from 'next/link'
import { redirect } from 'next/navigation'

import { TEXTO_SOLICITUD_MODULO, type TarjetaModulo } from '@central/module-seguros-portal'

import { fechaEs } from '@/lib/fechas'
import { URL_PORTAL_EMPLEADO, agruparHerramientas } from '@/lib/herramientas'
import { tarjetasDeSesion } from '@/lib/modulos'

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
  const tarjetas = await tarjetasDeSesion()
  if (tarjetas === null) redirect('/')
  const { propias, solicitables, rrhh } = agruparHerramientas(tarjetas)
  const hayPatrimonio = propias.some((t) => t.id === 'alquileres')

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
        <li>
          <TarjetaPortal
            id="herr-calendario"
            antetitulo="Fechas"
            titulo="Calendario"
            accion={
              <>
                <Link className="boton" href="/boveda?vista=recordatorios">Abrir el calendario</Link>
                {hayPatrimonio && (
                  <Link className="boton secundario" href="/patrimonio/calendario">Calendario del patrimonio</Link>
                )}
              </>
            }
          >
            <p style={{ marginTop: 0 }}>
              Los vencimientos de tus seguros y tus propios recordatorios (ITV, carnet, caldera…) en un sitio.
            </p>
          </TarjetaPortal>
        </li>
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
        <li>
          <TarjetaPortal
            id="herr-rrhh"
            antetitulo="Para tu plantilla"
            titulo="Portal del Empleado (RRHH)"
            chip={rrhh?.disponibilidad ? <span className="chip">{ETIQUETA_DISPONIBILIDAD[rrhh.disponibilidad]}</span> : undefined}
            accion={
              <a className="boton" href={URL_PORTAL_EMPLEADO} target="_blank" rel="noopener noreferrer">
                Abrir el Portal del Empleado
              </a>
            }
          >
            <p style={{ marginTop: 0 }}>
              Fichaje, vacaciones, nóminas y documentos de tu plantilla, cada empleado con su acceso. Es otra aplicación,
              con su propia dirección y su propio acceso.
            </p>
            {rrhh && <SolicitudModulo t={rrhh} />}
          </TarjetaPortal>
        </li>
      </ul>

      {solicitables.length > 0 && (
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
  return (
    <TarjetaPortal
      id={`modulo-${t.id}`}
      antetitulo={t.id === 'flota' ? 'Empresa' : 'Inmuebles'}
      titulo={t.nombre}
      chip={t.disponibilidad !== null ? <span className="chip">{ETIQUETA_DISPONIBILIDAD[t.disponibilidad]}</span> : undefined}
      accion={t.accion.tipo === 'abrir' ? <Link className="boton" href={t.accion.href}>Abrir</Link> : undefined}
    >
      <p style={{ marginTop: 0, marginBottom: 4 }}>{t.descripcion}</p>
      <p className="suave" style={{ marginTop: 0, fontSize: 14 }}>Relacionado con: {t.seguros}</p>
      <SolicitudModulo t={t} />
    </TarjetaPortal>
  )
}

/** Lo que cuelga del botón de pedir: el texto, el botón o el estado de lo ya pedido. Nada si ya se abre. */
function SolicitudModulo({ t }: { t: TarjetaModulo }) {
  const a = t.accion
  if (a.tipo === 'solicitar' || a.tipo === 'apuntarse') {
    return (
      <>
        <p className="suave" style={{ fontSize: 14 }}>
          {TEXTO_SOLICITUD_MODULO}
          {t.id === 'rrhh' && ' Si aún no tienes acceso, pídelo aquí y te enviaremos el acceso cuando lo activemos.'}
        </p>
        <BotonSolicitarModulo modulo={t.id} rotulo={a.tipo === 'apuntarse' ? 'Apuntarme' : 'Solicitar'} />
      </>
    )
  }
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
