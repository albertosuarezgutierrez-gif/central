import Link from 'next/link'

import { DIAS_ENLACE_TRAS_TERMINAR, DIAS_VALIDEZ_ENLACE_INQUILINO } from '@central/module-patrimonio'
import { MEDIADOR } from '@central/module-seguros'

/**
 * Apartado de la política de privacidad para el INQUILINO que entra por el enlace de su propietario (P17) y para la
 * petición de precio de «Mi alquiler» (27/10/2026, punto 5 del estudio de patrimonio). Entra con `VERSION_TEXTOS_LEGALES`
 * `2026-10-v3`. BORRADOR pendiente de revisión por abogado (docs/legal y el informe de la sesión).
 *
 * 🚨 Cada frase es una afirmación sobre el código; si cambia uno, cambia el otro en el MISMO PR:
 *   · «un solo uso, 14 días» → `DIAS_VALIDEZ_ENLACE_INQUILINO`, índice único de `enlace_id`.
 *   · «código a tu correo» → `/inquilino/[token]` + `EntrarConCodigo` (el correo se guarda como huella, `portal_canal`).
 *   · «lo que ves del contrato» → `CAMPOS_VISTA_CONTRATO_INQUILINO` (contacto, inmueble, fechas, renta, seguro, recibos).
 *   · «tu propietario ve tus justificantes y si el enlace está en uso o retirado» → carpeta `recibos`, `EnlaceVista.estado`.
 *   · «60 días tras terminar» → `DIAS_ENLACE_TRAS_TERMINAR`.
 *   · Petición de precio → `lib/inquilino/precio-inquilino.ts` + `apps/asegura/lib/patrimonio-inquilino-precio-*.ts`: ficha
 *     NUEVA de cliente potencial con nombre + UN contacto (cifrado en asegura), oportunidad y tarea; Telegram solo con ids;
 *     sin envíos automáticos; nada del contrato viaja; el propietario no lo ve (cepo `regression-portal-inquilino-precio`).
 *   · «sin plazo automático de borrado» → la purga RGPD de asegura (`lib/purga-rgpd.ts`) solo anonimiza fichas `fuente='web'`;
 *     estas son `fuente='portal'`. PENDIENTE de decidir plazo: cuando exista, esta frase cambia.
 *   · Casilla de ofertas → `TEXTO_CONSENTIMIENTO_INQUILINO` (`portal_patrimonio_inquilino_consentimiento`, append-only, con
 *     fecha y versión; no cruza a asegura). «Hoy no mostramos ofertas» → `inquilinoAceptaOfertas` no tiene llamador.
 */
export function ApartadoInquilino() {
  const { identidad } = MEDIADOR
  return (
    <section id="inquilino">
      <h2>3 ter. Si entras como inquilino</h2>
      <p>
        Si tu propietario usa el portal, puede darte un <strong>enlace</strong> para que veas tu contrato de alquiler. El
        enlace es de un solo uso y caduca a los {DIAS_VALIDEZ_ENLACE_INQUILINO} días; para entrar te mandamos un código a tu
        correo, como a cualquier usuario (tu correo se guarda como huella, no en claro). El portal no le envía el enlace a
        nadie: te lo pasa tu propietario.
      </p>
      <ul>
        <li>
          <strong>Qué ves:</strong> el nombre con el que se presenta tu propietario, la dirección del inmueble, las fechas y la
          renta del contrato, si el contrato exige seguro de hogar y los recibos que tu propietario decide compartir contigo.
          Nada más de él ni de otros inquilinos.
        </li>
        <li>
          <strong>Qué ve tu propietario de ti:</strong> los justificantes que subas (por ejemplo, el recibo de tu seguro) y si
          el enlace está en uso o lo has dejado de usar. Puedes dejar de ver el contrato cuando quieras; el acceso se corta
          también {DIAS_ENLACE_TRAS_TERMINAR} días después de que el contrato termine.
        </li>
      </ul>

      <h3>Si pides precio de un seguro para ti</h3>
      <p>
        En «Mi alquiler» puedes pedirnos precio de un seguro para tus cosas (contenido) y para tu responsabilidad civil como
        inquilino. Solo si lo pides tú:
      </p>
      <ul>
        <li>
          <strong>Qué guardamos:</strong> qué quieres asegurar, tu nombre y el correo o teléfono que nos escribas para
          contestarte. Con eso abrimos una ficha de cliente potencial en la cartera de la correduría (el contacto, cifrado) y una
          tarea para que el corredor te conteste. No usamos para esto ningún dato de tu contrato ni de tu propietario.
        </li>
        <li>
          <strong>Para qué y con qué base:</strong> solo para contestar a tu petición y darte precio. La base es que lo pides
          tú antes de contratar nada (medidas precontractuales a petición del interesado, art. 6.1.b RGPD). No te enviamos nada
          automático: te contesta el corredor por la vía que elijas.
        </li>
        <li>
          <strong>Tu propietario no lo ve.</strong> Ninguna pantalla suya enseña que has pedido precio ni lo que has marcado.
        </li>
        <li>
          <strong>Quién más lo ve:</strong> la correduría recibe un aviso interno por Telegram que solo lleva un número de
          referencia, ni tu nombre ni tu contacto. El resto, los encargados del apartado 4.
        </li>
        <li>
          <strong>Cuánto tiempo:</strong> hoy no borramos esa ficha automáticamente pasado un plazo. Si no llegas a contratar y
          quieres que la eliminemos, escríbenos a <a href={`mailto:${identidad.email}`}>{identidad.email}</a> y lo haremos,
          salvo lo que la ley nos obligue a conservar (apartado 6).
        </li>
      </ul>

      <h3>La casilla «Quiero recibir otras ofertas de seguros»</h3>
      <p>
        Es <strong>aparte</strong> de la petición de precio: opcional, nace sin marcar y puedes pedir precio sin marcarla. Si la
        marcas, guardamos tu decisión con su fecha y la versión exacta del texto que viste, y su base es tu consentimiento (art.
        6.1.a RGPD). Las ofertas solo se te enseñarían dentro de este portal, nunca por correo, teléfono ni mensajes; hoy el
        portal todavía no muestra ninguna. La retiras desmarcándola en «Mi alquiler», con la misma facilidad. Tu propietario no
        sabe si la has marcado. La revisión de seguros del <Link href="#senales-patrimonio">apartado 3 bis</Link> no usa tus
        datos.
      </p>
    </section>
  )
}
