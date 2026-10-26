import Link from 'next/link'

import { normalizarTokenEnlaceInquilino } from '@central/module-patrimonio'

import { enlaceVigente } from '@/lib/inquilino/inquilino-api'
import { puertosInquilino } from '@/lib/inquilino/inquilino-bd'
import { getIdentidad } from '@/lib/session'

import { EntrarConCodigo } from '../../invitacion/[token]/Invitacion'
import { PaginaPortal } from '../../PaginaPortal'
import { TarjetaPortal } from '../../TarjetaPortal'
import { AceptarEnlace } from './AceptarEnlace'

export const dynamic = 'force-dynamic'

/**
 * La pantalla del ENLACE que el propietario le pasa a su inquilino (P17). Pública a propósito (el inquilino no ha entrado nunca).
 *
 * 🚨 EL TOKEN NO ABRE SESIÓN. Dice QUÉ contrato; el código de un solo uso a su correo o móvil dice QUIÉN es. Por eso:
 *   1. Sin sesión → solo se invita a entrar. NI UN DATO del contrato, del inmueble ni del propietario: el enlace es reenviable.
 *   2. Con sesión → se explica qué va a ver y se pide un gesto explícito (aceptar). Aceptar GASTA el enlace (un uso).
 * Y el enlace muerto (no existe, anulado, gastado, caducado) sale por UNA página neutra: ni oráculo de tokens.
 * Aquí NO hay ninguna oferta ni consentimiento comercial: eso es opcional y va dentro, después, nunca como condición.
 */
export default async function EnlaceInquilinoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token: crudo } = await params
  const token = normalizarTokenEnlaceInquilino(crudo)
  if (token === null) return <EnlaceMuerto />

  const identidad = await getIdentidad()
  if (identidad === null) {
    // Sin identidad no hay filtro posible: solo se mira si el token es canjeable (sí/no), sin datos.
    const puertos = puertosInquilino('00000000-0000-0000-0000-000000000000')
    if (!(await enlaceVigente(puertos, token))) return <EnlaceMuerto />
    return (
      <PaginaPortal suelta estrecha antetitulo="Inquilino" titulo="Tu contrato de" acento="alquiler">
        <TarjetaPortal>
          <p className="suave" style={{ marginTop: 0 }}>
            Tu propietario te ha dado un enlace para que veas tu contrato de alquiler. <strong>Entra con tu correo</strong>: te
            mandamos un código de un solo uso. No hace falta contraseña.
          </p>
          <EntrarConCodigo />
        </TarjetaPortal>
      </PaginaPortal>
    )
  }

  if (!(await enlaceVigente(puertosInquilino(identidad.id), token))) return <EnlaceMuerto />

  return (
    <PaginaPortal suelta estrecha antetitulo="Inquilino" titulo="Tu contrato de" acento="alquiler">
      <TarjetaPortal>
        <p style={{ marginTop: 0 }}>
          Tu propietario te invita a ver aquí <strong>solo tu contrato</strong>: la renta, las fechas y los recibos que él decida
          compartir contigo. También podrás subir justificantes (por ejemplo, el recibo de tu seguro de hogar).
        </p>
        <ul className="suave" style={{ paddingLeft: 18 }}>
          <li>No verás nada de otros inmuebles ni del resto de sus datos, solo el nombre con el que se presenta.</li>
          <li>Tu propietario no verá nada tuyo más allá de lo que subas tú.</li>
          <li>Puedes dejar de ver el contrato cuando quieras, y él también puede retirártelo.</li>
          <li>No te mostraremos ninguna oferta a menos que lo pidas tú, más adelante y de forma opcional.</li>
        </ul>
        <AceptarEnlace token={token} />
      </TarjetaPortal>
    </PaginaPortal>
  )
}

/** UNA sola página para los cuatro finales del enlace (no existe, anulado, ya usado, caducado). */
function EnlaceMuerto() {
  return (
    <PaginaPortal suelta estrecha antetitulo="Inquilino" titulo="Este enlace" acento="ya no vale">
      <TarjetaPortal>
        <p style={{ marginTop: 0 }}>Pide a tu propietario que te dé un enlace nuevo.</p>
        <p className="suave" style={{ marginBottom: 0 }}>
          Si ya aceptaste uno, entra con tu correo y verás tu contrato: <Link href="/mi-alquiler">Ir a mi alquiler</Link>
        </p>
      </TarjetaPortal>
    </PaginaPortal>
  )
}
