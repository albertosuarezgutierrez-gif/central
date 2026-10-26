import { MEDIADOR } from '@central/module-seguros'

/**
 * Apartado de la política de privacidad sobre la revisión de seguros de los inmuebles (P15, PUBLICADO 26/10/2026).
 * Variante «interés legítimo informado» (decisión de Alberto). Entra con `VERSION_TEXTOS_LEGALES` `2026-10-v2`.
 * Se publica SIEMPRE, también con el motor apagado: con interés legítimo hay que informar ANTES de calcular.
 * Texto y notas: docs/legal/2026-10-26-borrador-p15-patrimonio.md (§3, variante A publicada).
 *
 * 🚨 Cada frase es una afirmación sobre el código (`packages/module-patrimonio/src/senales.ts`, el cron
 * `apps/asegura/app/api/cron/senales-patrimonio`): si cambia uno, cambia el otro en el MISMO PR.
 *   · «una vez al día» → el cron es diario.
 *   · «salvo que te opongas» → `puedeCalcularSenales` (`POLITICA_CALCULO = 'interes_legitimo'`), oposición =
 *     `oposicion_senales_patrimonio` (`/api/oposicion-senales-patrimonio`, «Configuración» y «Patrimonio»).
 *   · «no enviamos ningún mensaje» → ni el motor ni la cola escriben a nadie (cepo en `test/regression-portal-patrimonio-senales.test.ts`).
 *   · «contactar requiere que lo pidas o lo consientas» → `permisoContacto` (pedido / `comercial`).
 *   · «180 días» → `DIAS_TRAS_DESCARTE`. «24 meses» → `MESES_RETENCION_SENALES` (el cron borra lo caducado).
 */
export function ApartadoSenalesPatrimonio() {
  return (
    <section id="senales-patrimonio">
      <h2>3 bis. Revisión de los seguros de tus inmuebles</h2>
      <p>
        Para ayudarte a no quedarte sin cobertura, una vez al día comparamos los inmuebles, los contratos de alquiler y las
        pólizas de otras compañías que has apuntado en «Patrimonio» con los seguros que tienes con nosotros, y la correduría
        anota una «señal» cuando detecta alguna de estas situaciones: un inmueble que nos has dicho que no tiene seguro; un
        capital asegurado por debajo del valor de reconstrucción estimado a partir del Catastro; un alquiler vivo sin seguro
        de impago; una póliza con otra compañía que vence en los próximos 60 días; o un inmueble con hipoteca.
      </p>
      <ul>
        <li>
          <strong>Qué datos usa y guarda:</strong> el nombre que tú das al inmueble, el tipo de señal y las cifras del riesgo
          (metros cuadrados, valor estimado, capital asegurado, fecha de vencimiento). No usa ni guarda el nombre, el DNI,
          el correo ni la renta de ningún inquilino, ni los datos de tu comunidad de propietarios o de su administrador.
        </li>
        <li>
          <strong>Quién lo ve:</strong> solo la correduría, en su pantalla interna. No se comunica a ninguna compañía ni a
          terceros.
        </li>
        <li>
          <strong>Qué no hace:</strong> no enviamos ningún mensaje por esta causa. Contactar contigo con una propuesta sigue
          requiriendo que lo hayas pedido (con «Pedir precio») o que hayas aceptado recibir propuestas de la correduría.
        </li>
        <li>
          <strong>Base legal:</strong> nuestro interés legítimo en ofrecer a nuestros clientes la revisión de sus seguros
          (art. 6.1.f RGPD), tras ponderarlo con tus derechos: solo usamos datos que tú has apuntado, no usamos datos de
          inquilinos ni de la comunidad, no te enviamos ningún mensaje por esta causa y solo la correduría ve la señal.
        </li>
        <li>
          <strong>Puedes oponerte en cualquier momento</strong> (art. 21 RGPD), sin dar explicaciones: marcando «No quiero
          que Grupo ASegura revise los seguros de los inmuebles…» en <strong>Configuración → Privacidad</strong> o en la
          propia pantalla «Patrimonio», o escribiendo a{' '}
          <a href={`mailto:${MEDIADOR.identidad.email}`}>{MEDIADOR.identidad.email}</a>. Si te opones, dejamos de calcular y
          retiramos las señales que estuvieran abiertas (puede tardar hasta un día). Puedes retirar tu oposición desde el
          mismo sitio.
        </li>
        <li>
          <strong>Descartes:</strong> si la correduría descarta una señal, no se vuelve a anotar hasta pasados 180 días, y
          solo si la situación sigue siendo la misma.
        </li>
        <li>
          <strong>Cuánto la guardamos:</strong> una señal se borra a los 24 meses de cerrarse (descartada, resuelta o
          retirada) o, si sigue abierta o se convirtió en una propuesta, a los 24 meses de su última actualización.
        </li>
      </ul>
    </section>
  )
}
