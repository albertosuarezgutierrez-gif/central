import { redirect } from 'next/navigation'

import { getIdentidad } from '@/lib/session'

import { SeccionPlegable } from './SeccionPlegable'
import { Autorizaciones } from './Autorizaciones'

export const dynamic = 'force-dynamic'

/**
 * «Quién puede ver mis seguros» — la pantalla donde José deja que su mujer María
 * vea la póliza del coche, y donde María acepta o rechaza lo que le han dado.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Es la pantalla del CONSENTIMIENTO, así que su trabajo no es tranquilizar: es
 * dejar demostrable quién concedió qué, a quién, cuándo y hasta cuándo (art. 7.1
 * RGPD). Toda la doctrina está en la cabecera de
 * `packages/module-seguros-portal/src/autorizacion.ts` y de ahí sale el copy:
 *
 *   - Nace APAGADA. Desde el 25/09/2026 NO caduca (Alberto: «es un lío volver a
 *     pedir acceso»): el divorcio —nadie entra a revocar el día que se separa—
 *     lo cubre la pregunta anual al otorgante («¿lo mantienes?»).
 *   - DOBLE aceptación: el otorgante concede y el autorizado ACEPTA. Sin esa
 *     segunda mitad, María mira los datos de otro sin saber que existe un
 *     registro con su nombre — y ese registro es justo lo que la hace
 *     responsable de lo que mire.
 *   - DOS permisos (25/09/2026): «Solo ver» (`ver_economico`) y «Acceso total»
 *     (`total`). Con «Solo ver» un tercero nunca ve al otorgante, solo a sus
 *     seguros (`NUNCA_A_UN_TERCERO`); el acceso total SÍ abre DNI, IBAN y
 *     documentos, y deja actuar — decisión expresa de Alberto, con su propio
 *     texto de consentimiento. Nadie reautoriza a un cuarto con ninguno.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * La página es deliberadamente delgada: NO lee la BD. Todo sale de
 * `GET /api/autorizaciones`, que es quien conoce el vínculo de esta identidad —
 * ningún `clienteId` entra por la request y aquí no hay ninguno que pudiera
 * entrar. Lo único que se resuelve en el servidor es la sesión, con la puerta
 * única (`lib/session.ts`), para no pintar una pantalla de permisos a quien ni
 * siquiera ha entrado.
 */
export default async function AutorizacionesPage() {
  const identidad = await getIdentidad()
  if (!identidad) redirect('/')

  return (
    <>
      {/* El `<main>`, el ancho y la navegación los pone el armazón del grupo
          (`app/(portal)/layout.tsx`): esta pantalla es una sección más del
          portal, no una página suelta a la que se llegó por un enlace. */}
      {/* 08/09/2026: «Contactos». La pantalla es la misma —quién ve lo tuyo,
          qué ves tú, y a quién invitas—; lo que cambió es el nombre, porque
          Alberto pidió «una pestaña de contactos» y esto ya lo era. */}
      <h1>Mis contactos</h1>
      <p className="suave" style={{ marginTop: 0 }}>
        Quién ve tus seguros, cuáles ves tú y a quién has invitado.
      </p>

      {/* Va en el servidor, fuera del componente que carga los datos, para que
          esto se lea SIEMPRE: aunque la petición falle, aunque no haya nadie a
          quien autorizar. Es lo que la ley obliga a que se sepa antes de
          consentir, no una nota de ayuda. */}
      {/* 🚨 Plegable (25/09/2026) pero ABIERTO de salida: es lo que hay que
          saber antes de consentir, y un resumen de una línea no puede decir a
          la vez «solo mirar» (tus seguros) y «ve la cuenta y da partes» (los
          de tu sociedad). Quien ya lo ha leído lo cierra. */}
      <SeccionPlegable titulo="Qué es exactamente lo que das" abierto>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
          Hay <strong>dos permisos</strong>, y eliges uno para cada persona:
        </p>
        <p style={{ margin: '10px 0 0', fontSize: 14, lineHeight: 1.5 }}>
          <strong>Solo ver.</strong> Ve tus seguros y lo que pagas, y <strong>no puede hacer nada</strong>:
          ni dar partes, ni contratar, ni cambiar, ni anular. De una persona no ve su DNI, su cuenta bancaria
          ni sus documentos.
        </p>
        <p style={{ margin: '10px 0 0', fontSize: 14, lineHeight: 1.5 }}>
          <strong>Acceso total.</strong> Ve <strong>lo mismo que tú</strong> —también tu DNI, tu cuenta
          bancaria y tus documentos— y <strong>puede actuar en tu nombre</strong>: dar partes y hacer
          gestiones sobre tus pólizas. Dáselo solo a quien te lleve los seguros de verdad.
        </p>
        {/* 🚨 La otra mitad, desde el 03/09/2026: en una SOCIEDAD no se ceden datos
            personales sino representación, y quien la ejerce puede obligar a la
            empresa. Callarlo haría creer en una protección que no existe. */}
        <p style={{ margin: '10px 0 0', fontSize: 14, lineHeight: 1.5 }}>
          Si los seguros son de una <strong>sociedad tuya</strong>, estás diciendo{' '}
          <strong>quién puede representarla</strong>: con cualquiera de los dos permisos ve lo que paga la
          empresa, su CIF y su cuenta, y con el acceso total además da partes en su nombre — por eso se te
          pide con qué título lo hace.
        </p>
        <p style={{ margin: '10px 0 0', fontSize: 14, lineHeight: 1.5 }}>
          En los dos casos: nadie puede autorizar a nadie más, el acceso <strong>no caduca</strong> (una vez
          al año te preguntaremos si lo mantienes) y <strong>puedes revocarlo cuando quieras desde esta
          misma pantalla</strong>.
        </p>
      </SeccionPlegable>

      <Autorizaciones />
    </>
  )
}
