import type { Metadata } from 'next'
import Link from 'next/link'

import { MEDIADOR, FECHA_TEXTOS_LEGALES, VERSION_TEXTOS_LEGALES } from '@central/module-seguros'

import { ApartadoInquilino } from './ApartadoInquilino'
import { ApartadoSenalesPatrimonio } from './ApartadoSenalesPatrimonio'

export const metadata: Metadata = {
  title: 'Política de privacidad — Grupo ASegura',
  description:
    'Qué datos trata el portal del cliente de Grupo ASegura, con qué base legal, quién más los ve y cómo ejercer tus derechos.',
}

/**
 * Política de privacidad DEL PORTAL. No es la de la web pública ni una copia de
 * ella: describe lo que hace ESTA aplicación, que trata cosas que la web no
 * (documentos que el asegurado sube y que lee un modelo de lenguaje) y NO trata
 * cosas que la web sí (cotizaciones, contraseñas, analítica).
 *
 * 🚨 Regla al tocar este fichero: cada frase de aquí es una afirmación sobre el
 * código. Si se cambia el código —se añade un encargado, se guarda un dato
 * nuevo, se enciende una cookie— esta página cambia EN EL MISMO PR, y sube
 * `VERSION_TEXTOS_LEGALES`. Una política que describe una versión anterior de la
 * app no es un texto desactualizado: es información falsa al interesado.
 *
 * Lo que hoy es cierto y conviene no perder de vista al editar:
 *   - El correo NO se guarda en claro en ningún sitio (`portal_canal.valor_hash`).
 *   - No hay analítica, ni píxeles, ni terceros en el navegador. Una sola cookie.
 *   - Los documentos que sube el cliente SÍ salen a un tercero (OpenRouter) para
 *     leerlos. Es el punto más sensible de la app y va dicho con todas las letras.
 *   - Escáner (`lib/escaner-documento-ia.ts`) y «Revisar mi póliza»
 *     (`app/api/polizas/[id]/revision`) llaman SOLO a OpenRouter (`openrouterChat`/
 *     `openrouterVision`), nunca a la cadena de suplentes de `aiComplete`. A la revisión
 *     solo van las claves de `CLAVES_RAMO_PARA_IA` (`lib/revision-poliza.ts`).
 *   - La ubicación del parte solo existe si se pulsa «Usar mi ubicación», redondeada a
 *     4 decimales, y se retira si la persona cambia «Dónde» (`ParteSiniestro.tsx`).
 *   - `portal_prima_observada` guarda la última prima vista por póliza y muere con la
 *     identidad (ON DELETE CASCADE). El enlace de familia: token hasheado, 30 días, 10 usos.
 */
export default function Privacidad() {
  const { identidad, marca } = MEDIADOR

  return (
    <>
      <p className="legal-antetitulo">Protección de datos · RGPD y LOPDGDD</p>
      <h1>Política de privacidad del portal</h1>
      <p className="legal-entradilla">
        Esto es lo que hacemos con tus datos en <strong>{marca}</strong>, el portal donde ves tus
        seguros. Está escrito sobre lo que la aplicación hace de verdad, no sobre lo que suele
        ponerse en estas páginas.
      </p>

      <section>
        <h2>1. Quién responde de tus datos</h2>
        <p>
          <strong>{identidad.nombre}</strong>, NIF {identidad.nif}, {identidad.figura.toLowerCase()}{' '}
          inscrito en el registro de la DGSFP con la clave {identidad.claveDgsfp}. Domicilio:{' '}
          {identidad.domicilio}. Contacto: <a href={`mailto:${identidad.email}`}>{identidad.email}</a>.
        </p>
        <p>
          Puedes consultar la información completa del mediador en{' '}
          <Link href="/legal/mediador">Información del mediador</Link>.
        </p>
      </section>

      <section>
        <h2>2. Qué datos tratamos</h2>

        <h3>Para dejarte entrar</h3>
        <p>
          Tu correo electrónico y, si nos lo das, tu nombre. El correo{' '}
          <strong>no se guarda en claro</strong>: guardamos una huella criptográfica suya, que sirve
          para reconocerte cuando vuelves pero no para leerlo. El código de seis dígitos se guarda
          mientras es válido (diez minutos) junto al número de intentos, y deja de servir en cuanto
          lo usas.
        </p>
        <p>
          Cuando entras dejamos además <strong>constancia de que se te informó</strong>: la fecha, la
          versión exacta de estos textos legales, tu dirección IP y tu navegador. Es la prueba de que
          la información del mediador estaba delante antes de que operaras, y la ley pone esa carga
          de la prueba de nuestro lado (art. 173 del RDL 3/2020). No la usamos para perfilarte ni
          para medir tu navegación: se guarda una fila por cada versión de texto, no por cada visita.
        </p>

        <h3>Lo que tú declaras</h3>
        <ul>
          <li>Tus seguros: compañía, número de póliza, ramo, prima anual y fecha de vencimiento.</li>
          <li>
            Los bienes asegurados: matrícula, número de bastidor y fecha de matriculación de un
            vehículo; metros y año de una vivienda; y los datos descriptivos propios de cada ramo.
          </li>
          <li>
            Los documentos que subes: la póliza en PDF o foto, y los adjuntos de un parte de
            siniestro.
          </li>
          <li>
            Los partes que abres: qué pasó, cuándo, dónde, y si hubo heridos o terceros implicados.
            Si pulsas «Usar mi ubicación», también las coordenadas de dónde estás en ese momento,
            redondeadas a unos once metros. Es opcional: el portal solo pide el permiso cuando
            pulsas ese botón, no sigue tu ubicación, y si después cambias el campo «Dónde» las
            coordenadas no se envían.
          </li>
          <li>
            Los documentos que escaneas (un recibo o una carta de tu compañía) y lo que confirmas de
            ellos: qué son, su fecha, su importe y a qué póliza tuya pertenecen.
          </li>
          <li>
            Las autorizaciones que concedes o aceptas para que otra persona vea alguno de tus
            seguros.
          </li>
        </ul>

        <h3>Lo que el portal anota para avisarte</h3>
        <ul>
          <li>
            La <strong>última prima</strong> que vemos de cada una de tus pólizas, la de nuestra
            cartera y la que tú declaraste, para avisarte si sube más del porcentaje que elijas en
            «Configuración». Solo se usa para ese aviso.
          </li>
          <li>
            Si usas <strong>«Revisar mi póliza»</strong>, los puntos que salieron, para no repetir la
            revisión mientras los datos de la póliza no cambien.
          </li>
          <li>
            Si creas un <strong>enlace para invitar a tu familia</strong>, el enlace (guardado de forma
            que no se puede leer), cuándo caduca (a los 30 días) y cuántas cuentas nuevas se han creado
            con él (diez como máximo). Tú ves solo esa cifra, nunca quién entró. El enlace no da acceso
            a ninguno de tus seguros.
          </li>
        </ul>

        <h3>Lo que ya teníamos</h3>
        <p>
          Si eres cliente de la correduría, el portal enlaza tu identidad con tu ficha de nuestra
          cartera para enseñarte tus pólizas. Esos datos vienen de la relación de mediación que ya
          tenemos contigo, no de este portal.
        </p>

        <h3>Lo que no tratamos</h3>
        <p>
          El portal no pide ni guarda contraseñas, ni datos bancarios, ni datos de pago: la prima la
          cobra la entidad aseguradora. Tampoco recoge estadísticas de navegación (ver{' '}
          <Link href="/legal/cookies">Cookies</Link>).
        </p>

        <h3>Datos de salud y de terceras personas</h3>
        <p>
          Al describir un siniestro puedes acabar contando algo sobre la salud de alguien o los datos
          de otra persona. <strong>No hace falta y te pedimos que no lo hagas</strong>: para abrir el
          parte nos basta con lo ocurrido. Si aun así lo incluyes, lo tratamos únicamente para
          tramitar ese siniestro ante la compañía (art. 9.2.f RGPD, ejercicio de reclamaciones).
        </p>
      </section>

      <section>
        <h2>3. Para qué, y con qué base legal</h2>
        <div className="legal-tabla-scroll">
          <table className="legal-tabla">
            <thead>
              <tr>
                <th>Para qué</th>
                <th>Base legal</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Identificarte y darte acceso al portal</td>
                <td>Ejecución del contrato de mediación o medidas precontractuales (art. 6.1.b RGPD)</td>
              </tr>
              <tr>
                <td>Enseñarte tus seguros y avisarte de un vencimiento a tiempo</td>
                <td>Ejecución del contrato (art. 6.1.b) y deber de asesoramiento del corredor (Real Decreto-ley 3/2020, de distribución de seguros, título II)</td>
              </tr>
              <tr>
                <td>Recibir tu parte y trasladarlo a la compañía</td>
                <td>Ejecución del contrato (art. 6.1.b) y obligación legal de comunicación (art. 16 LCS)</td>
              </tr>
              <tr>
                <td>Leer automáticamente la póliza que subes para rellenar sus campos</td>
                <td>Ejecución del contrato (art. 6.1.b): es el servicio que has pedido al subirla</td>
              </tr>
              <tr>
                <td>
                  Leer el documento que escaneas para proponerte qué es y de qué póliza, y guardarlo cuando
                  lo confirmas
                </td>
                <td>Ejecución del contrato (art. 6.1.b): es el servicio que pides al escanearlo</td>
              </tr>
              <tr>
                <td>Revisar una póliza que has añadido y señalarte puntos que comentar, cuando pulsas el botón</td>
                <td>Ejecución del contrato (art. 6.1.b) y deber de asesoramiento del corredor (Real Decreto-ley 3/2020, de distribución de seguros, título II)</td>
              </tr>
              <tr>
                <td>Guardar la ubicación de un parte, si pulsas «Usar mi ubicación»</td>
                <td>Ejecución del contrato (art. 6.1.b): sirve para tramitar ese siniestro</td>
              </tr>
              <tr>
                <td>Avisarte de que sube el precio de una póliza, y del vencimiento de las que has añadido tú</td>
                <td>Ejecución del contrato (art. 6.1.b), con los avisos que tienes activados en «Configuración»</td>
              </tr>
              <tr>
                <td>Saber cuántas personas se han unido con tu enlace de invitación</td>
                <td>Interés legítimo (art. 6.1.f RGPD) en conocer cómo llega gente nueva al portal, sin saber quién es</td>
              </tr>
              <tr>
                <td>
                  Contestar a la petición de precio que haces como inquilino en «Mi alquiler» (apartado 3 ter)
                </td>
                <td>Medidas precontractuales a petición tuya (art. 6.1.b RGPD)</td>
              </tr>
              <tr>
                <td>
                  Enseñarte otras ofertas de seguros dentro del portal si eres inquilino — <strong>solo si marcas esa
                  casilla</strong>, aparte de la petición de precio
                </td>
                <td>Tu consentimiento (art. 6.1.a RGPD), revocable desmarcándola en «Mi alquiler»</td>
              </tr>
              <tr>
                <td>Conservar la documentación de la mediación</td>
                <td>Obligación legal (art. 6.1.c RGPD)</td>
              </tr>
              <tr>
                <td>Dejar constancia de que se te informó al entrar</td>
                <td>Obligación legal (art. 6.1.c RGPD y art. 173 RDL 3/2020)</td>
              </tr>
              <tr>
                <td>Atender tus derechos y tus reclamaciones</td>
                <td>Obligación legal (art. 6.1.c RGPD)</td>
              </tr>
              <tr>
                <td>
                  Revisar los seguros que guardas y contactarte con una propuesta cuando se acerque un
                  vencimiento — <strong>solo si marcas la casilla</strong> de «Mis datos»
                </td>
                <td>Tu consentimiento (art. 6.1.a RGPD), independiente del resto del servicio y revocable desde la misma casilla</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="legal-nota">
          Usar el portal, subir una póliza o guardar tus seguros no nos autoriza a enviarte propuestas ni
          publicidad. Eso solo ocurre si marcas la casilla de propuestas en «Mis datos», que nace sin
          marcar; desmarcarla lo retira, con la misma facilidad, y guardamos ambas cosas con su fecha.
        </p>
      </section>

      <ApartadoSenalesPatrimonio />

      <ApartadoInquilino />

      <section>
        <h2>4. Quién más ve tus datos</h2>
        <p>Solo quien hace falta para que el portal funcione:</p>
        <ul>
          <li>
            <strong>Supabase</strong> — la base de datos donde vive todo, alojada en la Unión Europea
            (Irlanda).
          </li>
          <li>
            <strong>Vercel</strong> — el alojamiento de la aplicación.
          </li>
          <li>
            <strong>Resend</strong> — el envío del correo con tu código de acceso. Recibe tu
            dirección de correo, y nada más.
          </li>
          <li>
            <strong>OpenRouter</strong> y el proveedor de modelo al que enrute — leen el documento que
            subes o escaneas, y los datos de la póliza que pides revisar. Explicado justo debajo.
          </li>
          <li>
            <strong>Telegram</strong> — el canal interno por el que la correduría recibe los avisos del
            portal que piden atención (por ejemplo, una carta de impago que escaneas o una petición de
            contacto). Lleva lo justo para atenderte.
          </li>
          <li>
            <strong>Sede Electrónica del Catastro</strong> — si escribes la dirección de una vivienda
            para localizar su referencia catastral, esa dirección se consulta en el servicio público
            del Catastro.
          </li>
          <li>
            <strong>Las entidades aseguradoras</strong> con las que tengas o vayas a tener una póliza,
            cuando sea necesario para gestionarla.
          </li>
        </ul>

        <h3>La lectura automática de tus documentos</h3>
        <p>
          Cuando subes una póliza, su contenido se envía a un modelo de lenguaje a través de{' '}
          <strong>OpenRouter</strong> (empresa estadounidense) para extraer compañía, número, ramo,
          prima y vencimiento y ahorrarte teclearlo. Eso implica que{' '}
          <strong>ese documento puede procesarse fuera del Espacio Económico Europeo</strong>, según a
          qué proveedor enrute la petición. Si no quieres que ocurra, no subas el documento: puedes
          escribir los datos de tu póliza a mano y el portal funciona igual.
        </p>
        <p>
          Lo mismo ocurre con el <strong>escáner de documentos</strong>: el contenido de la foto o del
          PDF que escaneas se envía por OpenRouter para proponerte qué es, su fecha, su importe y de qué
          póliza es. El documento no se guarda hasta que lo confirmas; entonces queda en tu ficha de la
          correduría. Si confirmas que es una carta de impago, avisamos a tu corredor.
        </p>
        <p>
          <strong>«Revisar mi póliza»</strong> solo funciona cuando pulsas el botón, y solo con las
          pólizas que has añadido tú. Al modelo, a través de OpenRouter, le enviamos lo que se leyó de la
          póliza: ramo, compañía, prima anual, vencimiento, coberturas y características del riesgo
          (capitales, metros, año de construcción, uso…). <strong>No le enviamos datos que te
          identifiquen</strong>: ni tu nombre, ni el de otras personas, ni tu DNI, ni la dirección, ni la
          fecha de nacimiento, ni la matrícula, ni el número de póliza. Lo que devuelve es orientativo:
          si quieres, tu corredor lo revisa contigo.
        </p>
        <p>
          Para el escáner y para la revisión no usamos ningún otro proveedor de inteligencia artificial
          que OpenRouter. Lo que el modelo devuelve es una propuesta, no una decisión: nada se da por bueno hasta que
          tú lo confirmas en pantalla. No hay decisiones automatizadas con efectos jurídicos sobre ti
          en el sentido del art. 22 RGPD.
        </p>
      </section>

      <section>
        <h2>5. Cuánto tiempo los guardamos</h2>
        <ul>
          <li>Los códigos de acceso, minutos: caducan a los diez y se invalidan al usarse.</li>
          <li>
            Tu identidad del portal y lo que hayas declarado, mientras mantengas la cuenta y la
            relación con la correduría.
          </li>
          <li>
            Las señales de la revisión de los seguros de tus inmuebles, 24 meses desde que se cierran o
            desde su última actualización (apartado 3 bis).
          </li>
          <li>
            Si pides precio como inquilino, la ficha con tu nombre y tu contacto: hoy sin borrado automático por plazo; la
            eliminamos si nos lo pides y no llegas a contratar (apartado 3 ter).
          </li>
          <li>
            La documentación de la mediación, durante los plazos que nos exige la normativa de
            seguros y la de prevención del blanqueo de capitales, y mientras puedan derivarse
            responsabilidades del contrato.
          </li>
        </ul>
        <p className="legal-nota">
          Por eso hay cosas que no podemos borrar aunque nos lo pidas: no es una negativa nuestra,
          es un deber de conservación. Cuando pase, te decimos qué se ha borrado y qué se queda, y
          por qué.
        </p>
      </section>

      <section>
        <h2>6. Tus derechos</h2>
        <p>
          Puedes pedirnos <strong>acceso</strong> a tus datos, su <strong>rectificación</strong>, su{' '}
          <strong>supresión</strong>, la <strong>limitación</strong> del tratamiento, la{' '}
          <strong>portabilidad</strong> de lo que nos hayas dado tú, y{' '}
          <strong>oponerte</strong> a un tratamiento. Se piden escribiendo a{' '}
          <a href={`mailto:${identidad.email}`}>{identidad.email}</a> desde la dirección con la que
          entras al portal, o desde otra acreditando quién eres.
        </p>
        <p>
          La <strong>supresión</strong> puedes pedirla además desde tu propia pantalla, en{' '}
          <strong>Mis seguros → Tus datos</strong>, sin escribir ningún correo.
        </p>
        <p>
          🚨 <strong>Sobre la supresión, con antelación:</strong> no podemos borrarlo todo, y
          preferimos decírtelo antes de que lo pidas. La normativa de seguros y la de prevención del
          blanqueo de capitales nos obligan a conservar la documentación de la mediación, y de un
          contrato pueden derivarse responsabilidades después: el propio Reglamento lo prevé y excluye
          la supresión en esos casos (art. 17.3.b y 17.3.e). Lo que sí hacemos es{' '}
          <strong>contestarte en un mes diciéndote, con nombres, qué se ha suprimido y qué se
          conserva y por qué</strong>. El alcance completo —lo que se borra y lo que no— lo tienes a
          la vista en esa misma pantalla antes de pulsar nada.
        </p>
        <p>
          Contestamos en el plazo de un mes. Si no te contestamos o no estás conforme con la
          respuesta, puedes reclamar ante la{' '}
          <a href="https://www.aepd.es" rel="noreferrer noopener" target="_blank">
            Agencia Española de Protección de Datos
          </a>
          .
        </p>
      </section>

      <section>
        <h2>7. Cómo protegemos el portal</h2>
        <ul>
          <li>Se entra con un código de un solo uso enviado a tu correo. No hay contraseña que robar.</li>
          <li>Tu correo se guarda como huella criptográfica, nunca en claro.</li>
          <li>
            La sesión viaja en una cookie que el navegador no deja leer a ningún script y que solo
            circula cifrada.
          </li>
          <li>
            Toda consulta del portal se limita a tu identidad. Que no puedas ver los datos de otra
            persona no depende de que la pantalla los oculte, sino de que la consulta nunca los pide.
          </li>
        </ul>
      </section>

      <section>
        <h2>8. Cambios</h2>
        <p>
          Si cambia lo que hacemos con tus datos, cambia esta página y sube su número de versión. La
          versión con la que aceptaste algo queda registrada, para que siempre se pueda saber qué
          texto era.
        </p>
      </section>

      <p className="legal-version">
        Versión {VERSION_TEXTOS_LEGALES} · última revisión {FECHA_TEXTOS_LEGALES}
      </p>
    </>
  )
}
