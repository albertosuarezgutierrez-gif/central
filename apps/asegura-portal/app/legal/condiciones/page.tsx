import type { Metadata } from 'next'
import Link from 'next/link'

import { MEDIADOR, FECHA_TEXTOS_LEGALES, VERSION_TEXTOS_LEGALES } from '@central/module-seguros'

export const metadata: Metadata = {
  title: 'Condiciones de uso — Grupo Asegura',
  description:
    'Qué es y qué no es el portal del cliente de Grupo Asegura: para qué sirve, qué no sustituye y de qué responde cada parte.',
}

/**
 * Condiciones de uso del portal.
 *
 * La mitad del valor de esta página está en el apartado «lo que este portal NO
 * hace». Un asegurado que cree haber dado el parte porque lo escribió aquí, y no
 * lo ha comunicado a nadie más, se queda fuera del plazo de siete días del art.
 * 16 LCS creyendo estar cubierto. Ese malentendido es el único daño grave que
 * esta aplicación puede causar por sí sola, y se evita diciéndolo, no
 * suponiéndolo entendido.
 */
export default function Condiciones() {
  const { identidad, marca } = MEDIADOR

  return (
    <>
      <p className="legal-antetitulo">Condiciones de uso</p>
      <h1>Condiciones de uso del portal</h1>
      <p className="legal-entradilla">
        {marca} es el portal donde ves tus seguros y hablas con tu correduría. Lo gestiona{' '}
        {identidad.nombre}, {identidad.figura.toLowerCase()} (
        <Link href="/legal/mediador">información del mediador</Link>). Usarlo implica aceptar lo que
        sigue.
      </p>

      <section>
        <h2>1. Para qué sirve</h2>
        <ul>
          <li>Ver las pólizas que tienes con nosotros y las que tú añadas.</li>
          <li>Saber cuándo vence cada una y con cuánta antelación puedes moverla.</li>
          <li>Comunicarnos un siniestro para que lo tramitemos.</li>
          <li>Dejar que otra persona vea alguno de tus seguros, y retirárselo cuando quieras.</li>
        </ul>
      </section>

      <section>
        <h2>2. Lo que este portal NO hace</h2>
        <p className="legal-destacado">
          Abrir un parte aquí <strong>no es comunicar el siniestro a tu aseguradora</strong>. Nos lo
          comunicas a nosotros y nosotros lo trasladamos a la compañía; hasta que el portal no te
          diga que está abierto en la compañía, no lo está. La ley te da{' '}
          <strong>siete días</strong> desde que conoces el siniestro para comunicarlo (art. 16 de la
          Ley de Contrato de Seguro): si el plazo aprieta, si hay heridos o si es fin de semana,
          llámanos o llama directamente a tu compañía. No te quedes esperando.
        </p>
        <ul>
          <li>
            <strong>No se contrata nada desde aquí.</strong> Ver o añadir una póliza no la contrata,
            no la renueva y no la anula.
          </li>
          <li>
            <strong>No sustituye a tu póliza.</strong> Lo que cubre tu seguro es lo que digan sus
            condiciones, no el resumen que veas en pantalla.
          </li>
          <li>
            <strong>No sabemos de lo que no nos consta.</strong> Solo podemos avisarte del
            vencimiento de un seguro que esté aquí; de uno que no nos hayas dicho que tienes, no.
          </li>
        </ul>
      </section>

      <section>
        <h2>3. Tu acceso</h2>
        <p>
          Se entra con un código de un solo uso enviado a tu correo. Ese código es personal: quien lo
          tenga entra. No lo reenvíes ni lo dictes por teléfono a nadie —tampoco a alguien que diga
          llamar de nuestra parte, porque nunca te lo vamos a pedir—. Si crees que alguien ha entrado
          en tu cuenta, escríbenos a{' '}
          <a href={`mailto:${identidad.email}`}>{identidad.email}</a>.
        </p>
      </section>

      <section>
        <h2>4. Lo que tú aportas</h2>
        <p>
          Los datos y documentos que subes son tuyos y respondes de que sean ciertos y de tener
          derecho a aportarlos. Los usamos para lo que dice la{' '}
          <Link href="/legal/privacidad">política de privacidad</Link> — incluida la lectura
          automática del documento por un tercero, que ahí se explica— y para nada más.
        </p>
        <p>
          Una póliza que añades tú aparece marcada como declarada por ti: no la hemos verificado, y
          los avisos que salgan de ella dependen de que lo que escribiste sea correcto.
        </p>
      </section>

      <section>
        <h2>5. Autorizar a otra persona</h2>
        <p>
          Puedes dejar que alguien vea alguno de tus seguros. Esa autorización nace apagada, tiene
          fecha de fin, la otra persona tiene que aceptarla, y puedes retirarla cuando quieras.
          Autorizar es dejar mirar: no le da a nadie poder para contratar, modificar ni anular nada
          tuyo. Tus documentos, tu DNI y tus datos bancarios no entran en ninguna autorización.
        </p>
      </section>

      <section>
        <h2>6. Disponibilidad</h2>
        <p>
          Ponemos los medios razonables para que el portal esté disponible, pero es una herramienta y
          puede fallar o estar en mantenimiento. Que el portal esté caído no cambia ninguno de tus
          plazos: si tienes que comunicar algo y no puedes hacerlo aquí, llámanos o escríbenos a{' '}
          <a href={`mailto:${identidad.email}`}>{identidad.email}</a>.
        </p>
        <p>
          Podemos suspender un acceso que se esté usando para entrar en datos de otra persona o para
          atacar el servicio.
        </p>
      </section>

      <section>
        <h2>7. Reclamaciones y ley aplicable</h2>
        <p>
          Las quejas se dirigen primero a nuestro Servicio de Atención al Cliente y después, si no se
          resuelven, a la DGSFP: el detalle y los canales están en la{' '}
          <Link href="/legal/mediador">información del mediador</Link>.
        </p>
        <p>
          Se aplica la ley española. Si eres consumidor, puedes acudir a los tribunales de tu
          domicilio.
        </p>
      </section>

      <p className="legal-version">
        Versión {VERSION_TEXTOS_LEGALES} · última revisión {FECHA_TEXTOS_LEGALES}
      </p>
    </>
  )
}
