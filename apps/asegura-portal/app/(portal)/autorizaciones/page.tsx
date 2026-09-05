import { redirect } from 'next/navigation'

import { getIdentidad } from '@/lib/session'

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
 *   - Nace APAGADA y con fecha de fin (un año). El caso que revienta un booleano
 *     eterno es el divorcio: nadie entra al portal a revocar el día que se separa.
 *   - DOBLE aceptación: el otorgante concede y el autorizado ACEPTA. Sin esa
 *     segunda mitad, María mira los datos de otro sin saber que existe un
 *     registro con su nombre — y ese registro es justo lo que la hace
 *     responsable de lo que mire.
 *   - Leer no es actuar: `partes` y `documentos` están en el vocabulario pero
 *     NO se conceden hoy (`ALCANCES_CONCEDIBLES`), porque un tick en una
 *     pantalla no es un poder.
 *   - Un tercero nunca ve al otorgante, solo a sus seguros: IBAN, DNI y
 *     documentos quedan fuera de CUALQUIER alcance (`NUNCA_A_UN_TERCERO` de
 *     `camposDeAlcance`). Por eso el párrafo de abajo se puede afirmar: no es
 *     una promesa de la UI, lo garantiza el módulo puro.
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
      <h1>Quién puede ver mis seguros</h1>

      {/* Va en el servidor, fuera del componente que carga los datos, para que
          esto se lea SIEMPRE: aunque la petición falle, aunque no haya nadie a
          quien autorizar. Es lo que la ley obliga a que se sepa antes de
          consentir, no una nota de ayuda. */}
      <section className="seccion" aria-labelledby="limites-titulo">
        <h2 id="limites-titulo">Qué es exactamente lo que das</h2>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
          Si los seguros son <strong>tuyos</strong>, quien reciba el acceso{' '}
          <strong>solo puede mirarlos</strong>. Nunca ve tu DNI, ni tu IBAN, ni tus documentos, y{' '}
          <strong>no puede dar partes ni tocar nada en tu nombre</strong>: ni contratar, ni cambiar, ni
          anular. Cada acceso <strong>caduca al año</strong> y{' '}
          <strong>puedes revocarlo cuando quieras desde esta misma pantalla</strong>.
        </p>
        {/* 🚨 La otra mitad, desde el 03/09/2026. Dejar solo el párrafo de arriba
            era prometer sobre una EMPRESA una protección que no existe: lo que se
            delega ahí no es consentimiento —una sociedad no tiene datos
            personales— sino representación mercantil, y quien la ejerce ve la
            cuenta y puede obligar a la empresa. Callarlo sería lo peor de las dos
            cosas: no impide nada y hace creer que sí. */}
        <p style={{ margin: '10px 0 0', fontSize: 14, lineHeight: 1.5 }}>
          Si los seguros son de una <strong>sociedad tuya</strong>, es distinto: ahí no estás cediendo
          datos personales, estás diciendo <strong>quién puede representarla</strong>. Esa persona{' '}
          <strong>sí ve lo que paga la empresa, su CIF y su cuenta</strong>, y puede llegar a{' '}
          <strong>dar partes en su nombre</strong> — por eso se te pide con qué título lo hace. Lo que no
          puede hacer nunca es autorizar a nadie más.
        </p>
      </section>

      <Autorizaciones />
    </>
  )
}
