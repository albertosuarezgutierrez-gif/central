import {
  etiquetaRamo,
  loQueVeQuienEscanea,
  normalizarTokenHoja,
  polizasDeLaHoja,
} from '@central/module-seguros-portal'

import { canalDeCompania, type CanalCompania } from '@central/module-seguros-portal'
import { companiasConCanal } from '@/lib/canales-compania'
import { carteraDeIdentidad, type PolizaPortal } from '@/lib/cartera-lectura'
import { fechaEs } from '@/lib/fechas'
import { declaradasDeIdentidad, hojaPorToken, sellarUso, type DeclaradaEnHoja } from '@/lib/hojas'

import { MEDIADOR } from '@central/module-seguros'
import { MarcaAsegura } from '@/app/MarcaAsegura'
import QRCode from 'qrcode'

import { enlaceDeHoja } from '@/lib/enlace-hoja'

export const dynamic = 'force-dynamic'

/**
 * 🚨 `noindex` explícito. La URL lleva el token dentro, y todo el argumento
 * de seguridad de esta página —«el papel es la premisa»— da por hecho que esa
 * dirección viaja SOLO en papel. Un buscador que la indexara la sacaría del
 * papel sin que nadie se enterara.
 */
export const metadata = {
  title: 'Tus seguros — Grupo ASegura',
  robots: { index: false, follow: false },
}

/**
 * El masthead del papel. La marca a la IZQUIERDA (primera fijación del
 * barrido), qué es el papel en el centro y el QR a la derecha, donde llega el
 * pulgar de quien sujeta el móvil con la hoja pegada a la nevera.
 *
 * 🚨 El monograma va a 40 px y en `currentColor`: a los 15 px de la barra del
 * portal el contraojo de la «A» se cierra y desde dos metros es una mancha; y
 * en su cuadro de color sería un BACKGROUND, que Chrome descarta al imprimir.
 */
function Masthead({ titulo }: { titulo: string }) {
  const hoy = new Date()
  return (
    <div className="hoja-masthead">
      <div className="hoja-marca">
        <MarcaAsegura alto={40} className="hoja-monograma" />
        <span className="hoja-identidad">
          <span className="hoja-wordmark">{MEDIADOR.marca}</span>
          {/* La clave DGSFP sale del MEDIADOR, nunca tecleada: dos copias de
              `CS-F/0170` es una copia de más. */}
          <span className="hoja-dgsfp">
            Correduría de seguros · DGSFP {MEDIADOR.identidad.claveDgsfp}
          </span>
        </span>
      </div>
      <div className="hoja-titulo-bloque">
        <h1>{titulo}</h1>
        {/* Se lee EN VIVO, así que esta fecha es honesta — y dentro de un año
            es lo único que le dice a alguien «esto es viejo, escanea». */}
        <p className="hoja-fecha">Datos a día {fechaEs(hoy)}</p>
      </div>
    </div>
  )
}

/**
 * La HOJA que se abre al escanear el QR del papel de la nevera.
 *
 * Es PÚBLICA a propósito —vive fuera del grupo `(portal)`— y no pide sesión:
 * se abre en el arcén, con prisa, desde un papel que alguien imprimió hace
 * meses. Una pantalla de acceso aquí sería lo mismo que no tener hoja.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🚨 POR QUÉ UN TOKEN DE SOLO LECTURA ES ACEPTABLE AQUÍ.
 *
 * La objeción obvia es «quien fotografíe la hoja entra». Cierto — y da igual:
 * entra a ver **exactamente lo que ya está impreso en esa misma hoja**, porque
 * la selección del QR y lo que se imprime son la misma lista. El papel es la
 * premisa; el token no añade filtración sobre el papel. Lo que sí haría daño es
 * un QR que abriera la cartera ENTERA, y por eso la selección no es un adorno:
 * es lo que acota el token.
 *
 * De ahí las dos cosas que esta página NO hace, y que no se pueden «mejorar»:
 *   1. **No abre sesión.** El token dice QUÉ hoja es, no quién eres.
 *   2. **No enseña nada que no vaya en el papel**: ni prima, ni recibos, ni
 *      siniestros, ni DNI, ni la dirección del riesgo. Solo compañía, ramo, qué
 *      está asegurado, número de póliza, vencimiento y a quién llamar.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 🚨 Y lo que se pinta **se lee EN VIVO**, no es una foto del día que se creó:
 * se parte de la cartera actual de su dueño y la selección solo filtra. Si se
 * vendió el coche, esa póliza desaparece de la hoja sola. Guardar los datos al
 * crear el QR es exactamente cómo un imán de nevera acaba mintiendo.
 */
export default async function Hoja({ params }: { params: Promise<{ token: string }> }) {
  const { token: crudo } = await params
  const token = normalizarTokenHoja(crudo)
  const hoja = token === null ? null : await hojaPorToken(token)

  // La cartera de SU DUEÑO, no la de quien mira: aquí no hay sesión, y la
  // autorización es el token. Solo se lee si la hoja existe y está viva.
  let visibles: PolizaPortal[] = []
  let declaradas: DeclaradaEnHoja[] = []
  if (hoja && hoja.anuladaEn === null) {
    const [cartera, misDeclaradas] = await Promise.all([
      carteraDeIdentidad(hoja.identidadId),
      declaradasDeIdentidad(hoja.identidadId),
    ])
    const suyas = [...cartera.propias, ...cartera.autorizadas].flatMap((t) => t.polizas)
    visibles = polizasDeLaHoja(suyas, hoja.seleccion)
    declaradas = polizasDeLaHoja(misDeclaradas, hoja.seleccion)
  }

  const total = visibles.length + declaradas.length
  const que = loQueVeQuienEscanea(hoja, total)

  if (que !== 'hoja') {
    return (
      <main className="hoja">
        <Masthead titulo="Tus seguros" />
        <p className="hueco" style={{ marginTop: 20 }}>
          <span className="pendiente">
            {que === 'anulada' ? 'Hoja anulada' : que === 'vacia' ? 'Sin pólizas' : 'No encontrada'}
          </span>
          {/* 🚨 Las tres frases son distintas a propósito. «No existe» ante un QR
              anulado le haría pensar a quien lo escanea que el fallo es de su
              móvil, y volvería a intentarlo justo cuando tiene prisa. */}
          {que === 'anulada'
            ? 'Esta hoja se anuló y ya no muestra información. Si es tuya, entra en tu portal y crea una nueva.'
            : que === 'vacia'
              ? 'Esta hoja está activa, pero ninguna de las pólizas que llevaba sigue en vigor a día de hoy.'
              : 'Este enlace no corresponde a ninguna hoja. Comprueba que el código se ha leído entero.'}
        </p>
        <p className="suave">
          Si necesitas ayuda, escríbenos a <a href={`mailto:${MEDIADOR.identidad.email}`}>{MEDIADOR.identidad.email}</a>.
        </p>
      </main>
    )
  }

  // Se sella DESPUÉS de decidir qué se enseña y sin dejar que un fallo tumbe la
  // página: que no se pueda anotar la visita no es razón para dejar a alguien
  // sin sus datos en el arcén.
  if (token && hoja) await sellarUso(hoja.identidadId, token)

  const companias = await companiasConCanal()

  // 🔗 El QR de la propia hoja, para que el PAPEL impreso lleve la vuelta a la
  // versión viva. Se dibuja en SVG en el servidor: sin script, sin red, y se
  // imprime nítido a cualquier tamaño. `null` si no hay dominio: se enseña la
  // hoja igual, que es lo que hace falta ahora mismo, y sin QR.
  const enlace = token === null ? null : enlaceDeHoja(token)
  const qr =
    enlace === null
      ? null
      : // `margin: 2` es la zona de silencio: a 0 el QR toca el papel y,
        // pegado a un imán o al canto de un armario, la lectura se degrada de
        // verdad. `Q` sube la corrección de errores del 15 % al 25 % — unos
        // módulos más a cambio de aguantar un año de cocina.
        await QRCode.toString(enlace, { type: 'svg', margin: 2, errorCorrectionLevel: 'Q' })

  return (
    <main className="hoja">
      {/* 🚨 El titular dice QUÉ es el papel, no de quién es: la marca está a
          su izquierda con el monograma. Antes ponía «Grupo ASegura» de
          titular Y en la barra del portal — el nombre dos veces en 40 px, y
          ni una palabra de qué era la hoja. Dictado de Alberto (05/09/2026):
          «a nivel corporativo TUS SEGUROS y nombre Grupo ASegura». */}
      <Masthead titulo="Tus seguros" />

      {qr && (
        <div className="hoja-qr">
          {/* El QR lleva el ENLACE, no los datos: la imagen no caduca y la
              página detrás está siempre al día. */}
          <div aria-hidden dangerouslySetInnerHTML={{ __html: qr }} />
          <p>Escanea para ver esta hoja al día</p>
        </div>
      )}

      {/* 🚨 Qué se lleva el papel, dicho ANTES de que le den a imprimir. La
          vista previa enseña una tarjeta con el logo y el QR y nada más, y sin
          este aviso eso parece un fallo — el usuario le daría a cancelar
          pensando que la página no ha cargado. */}
      <p className="hoja-solo-pantalla">
        <strong>Al imprimir sale solo la tarjeta de arriba</strong>: tu logo, «Tus seguros» y el
        código. Los datos no se imprimen a propósito — así el papel no enseña tus pólizas a quien
        pase por delante, y no se queda anticuado cuando tu compañía cambie un teléfono. Quien
        necesite la información escanea el código y la ve al día.
      </p>

      <ul className="hoja-polizas">
        {visibles.map((p) => {
          const canal = canalDeCompania(p.compania, companias)
          return (
            <li key={p.id} className="hoja-poliza">
              <h2>{p.compania}</h2>
              {/* `etiquetaRamo`, no el enum: el mismo seguro no puede
                  llamarse «Auto» en pantalla y `auto` en el papel. */}
              <p className="hoja-ramo">{etiquetaRamo(p.ramo)}</p>
              {p.bien.cosa && <p className="hoja-bien">{p.bien.cosa}</p>}
              <dl>
                {p.numeroPoliza && (
                  <>
                    <dt>Póliza</dt>
                    <dd>{p.numeroPoliza}</dd>
                  </>
                )}
                <dt>Vencimiento</dt>
                {/* Sin fecha se DICE, no se deja el hueco: quien mire esto en el
                    arcén no puede quedarse con la duda de si está cubierto. */}
                {/* Un «no nos consta» con el peso de una fecha real es un
                    hueco disfrazado de dato. */}
                <dd className={p.fechaVencimiento === null ? 'sin-dato' : undefined}>
                  {fechaEs(p.fechaVencimiento) ?? 'no nos consta'}
                </dd>
              </dl>
              <Telefonos canal={canal} />
            </li>
          )
        })}

        {declaradas.map((d) => (
          <li key={d.id} className="hoja-poliza">
            <h2>{d.compania ?? 'Compañía sin identificar'}</h2>
            <p className="hoja-ramo">{d.ramo ? etiquetaRamo(d.ramo) : 'Tipo de seguro sin indicar'}</p>
            {d.matricula && <p className="hoja-bien">{d.matricula}</p>}
            <dl>
              {d.numeroPoliza && (
                <>
                  <dt>Póliza</dt>
                  <dd>{d.numeroPoliza}</dd>
                </>
              )}
              <dt>Vencimiento</dt>
              <dd className={d.fechaVencimiento === null ? 'sin-dato' : undefined}>
                {fechaEs(d.fechaVencimiento) ?? 'no nos consta'}
              </dd>
            </dl>
            {/* 🚨 Sin teléfonos: esta la añadió el cliente y la correduría no la
                gestiona, así que no tenemos su compañía cruzada ni la hemos
                verificado. Un número aquí sería inventado. */}
            <p className="hoja-nota">
              Esta la añadiste tú y no la lleva la correduría: llama directamente a tu compañía.
            </p>
          </li>
        ))}
      </ul>

      <p className="hoja-pie">
        {/* El punto de contacto es la correduría; el de la compañía va arriba,
            con su etiqueta de urgencia. Quitarle a alguien el número de la grúa
            para forzar que llame al corredor es un mal negocio el día que le
            pase de verdad. */}
        {MEDIADOR.marca} · <a href={`mailto:${MEDIADOR.identidad.email}`}>{MEDIADOR.identidad.email}</a>
      </p>
    </main>
  )
}

/**
 * Los teléfonos de la compañía. `sinDatos` = **no lo hemos verificado**, jamás
 * «esta compañía no tiene»: la hoja dice «pídenoslo». Misma regla y mismos datos
 * que el bloque de `ParteSiniestro.tsx`.
 */
function Telefonos({ canal }: { canal: CanalCompania }) {
  if (canal.sinDatos || canal.vias.length === 0) {
    return <p className="hoja-nota">No tenemos verificado su teléfono de siniestros. Pídenoslo y te lo damos.</p>
  }
  return (
    <>
      <ul className="hoja-vias">
        {canal.vias.map((v, i) => (
          <li key={i}>
            <strong>
              {/* Dar parte y asistencia NO se colapsan: en el arcén hace falta
                  la segunda, y en el salón de casa la primera. */}
              {v.tipo === 'whatsapp' ? 'WhatsApp' : v.uso === 'asistencia' ? 'Asistencia' : 'Dar parte'}
            </strong>{' '}
            <span className="hoja-numero">{v.numero}</span>
            {/* 🚨 El horario va con SU vía, no heredado: un canal de siniestros
                sin horario se lee como «siempre», y esa es la promesa que se
                rompe un sábado por la noche. */}
            {v.horario && <span className="hoja-horario">{v.horario}</span>}
          </li>
        ))}
      </ul>
      {/* La fecha de verificación va IMPRESA: un número comprobado hace tres
          años falla igual que uno equivocado, y en el mismo momento. */}
      {canal.verificadoEn && (
        <p className="hoja-nota">Teléfonos comprobados el {fechaEs(new Date(canal.verificadoEn))}.</p>
      )}
    </>
  )
}
