import {
  ETIQUETA_RAMO,
  bienTieneAlgo,
  coberturaEspecificaDeRamo,
  describirBien,
  etiquetaEstadoSiniestro,
  explicarSiniestro,
  resumirHistorialSiniestros,
  tonoEstadoSiniestro,
  type BienAsegurado,
  type TramitacionSiniestro,
  tonoSituacionRecibo,
  etiquetaSituacionRecibo,
} from '@central/module-seguros-portal'

import Link from 'next/link'

import type { PolizaPortal } from '@/lib/cartera-lectura'
import { eur } from '@/lib/dinero'
import { fechaEs } from '@/lib/fechas'

/**
 * Las piezas con las que se pinta una póliza, compartidas por la LISTA
 * (`/boveda`) y por su FICHA (`/boveda/poliza/[id]`).
 *
 * 🚨 Viven aquí y no duplicadas en cada pantalla porque cada una de ellas
 * carga una regla de las que este portal no puede romper: `recibos.total === 0`
 * es «la compañía no ha informado», `coberturas.total === 0` es «no nos consta
 * el detalle», y un `null` por nivel no se pinta. Con dos copias, la segunda
 * pantalla que alguien escriba dirá «no tienes recibos» sin que nada falle.
 */

// La MISMA tabla que usa el calendario (`lib/obligaciones.ts`) y el módulo: un
// mapa local aquí es como se llegó a pintar «Responsabilidad civil» en la
// tarjeta y `responsabilidad_civil` en el calendario de la misma pantalla.
const RAMO: Record<string, string> = ETIQUETA_RAMO

export { RAMO }

export const ESTADO: Record<string, string> = {
  activa: 'En vigor',
  en_vigor: 'En vigor',
  en_renovacion: 'En renovación',
  recibo_devuelto: 'Recibo devuelto',
  cambio_clave: 'En vigor',
  vencida: 'Vencida',
  cancelada: 'Cancelada',
  fin_riesgo: 'Fin de riesgo',
  anula_al_vencimiento: 'Se anula al vencimiento',
  competencia: 'En otra correduría',
}


/**
 * El icono del ramo.
 *
 * 🚨 Es DECORACIÓN, y hay que tenerlo claro: dos pólizas de hogar de la misma
 * compañía llevan **el mismo icono**, así que un resumen que se apoye en él
 * para distinguirlas no distingue nada. Lo que identifica es el bien (la
 * dirección, la matrícula) y por eso va en el título de la fila. El icono solo
 * hace la lista más rápida de barrer con la vista.
 *
 * SVG en línea y `currentColor`: sin librería de iconos, sin una petición más
 * y siguiendo el color del tema (de noche el trazo tiene que aclararse solo).
 */
const TRAZOS: Record<string, string> = {
  // Coche.
  vehiculo: 'M5 17h14M5 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm14 0a2 2 0 1 0 4 0 2 2 0 0 0-4 0ZM3 17v-4l2-5h14l2 5v4M6 13h12',
  // Casa.
  inmueble: 'M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5M10 21v-6h4v6',
  // Persona (vida, salud, decesos, accidentes).
  persona: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1',
  // Escudo (responsabilidad civil, comercio, resto).
  general: 'M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z',
}

const FAMILIA_DE_RAMO: Record<string, keyof typeof TRAZOS> = {
  auto: 'vehiculo',
  moto: 'vehiculo',
  camion: 'vehiculo',
  furgoneta: 'vehiculo',
  flota: 'vehiculo',
  hogar: 'inmueble',
  comunidad: 'inmueble',
  comercio: 'inmueble',
  alquiler: 'inmueble',
  vida: 'persona',
  salud: 'persona',
  decesos: 'persona',
  accidentes: 'persona',
}

export function IconoRamo({ ramo }: { ramo: string | null }) {
  const familia = FAMILIA_DE_RAMO[(ramo ?? '').trim().toLowerCase()] ?? 'general'
  return (
    <svg
      className="poliza-icono"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      // Decorativo: el ramo ya va escrito al lado, así que anunciarlo otra vez
      // a un lector de pantalla es repetirlo.
      aria-hidden
      focusable="false"
    >
      <path d={TRAZOS[familia]} />
    </svg>
  )
}

/** La cobertura que especializa el ramo genérico de esta póliza (ver `coberturaEspecificaDeRamo`). */
function coberturaEspecifica(p: PolizaPortal): string | null {
  return coberturaEspecificaDeRamo(p.ramo, p.coberturas?.lista ?? [])
}

/**
 * El titular de una fila: **qué cosa es**, no de qué compañía.
 *
 * Nadie se sabe su número de póliza y a casi nadie le dice nada «Occident» a
 * secas cuando tiene dos con ellos. Lo que reconoce es su coche y su calle. Si
 * la compañía no ha informado el bien, se cae a la cobertura que especializa
 * el ramo (si la hay) y, si tampoco, a compañía + ramo — que es lo único
 * cierto que queda cuando no hay nada más específico.
 */
export function tituloDePoliza(p: PolizaPortal): string {
  const b = p.bien
  return b.cosa ?? b.ubicacion ?? coberturaEspecifica(p) ?? `${p.compania} · ${RAMO[p.ramo] ?? p.ramo}`
}

/** ¿El titular de la fila ya identifica la póliza por sí solo (bien o cobertura específica)? Decide qué queda para la segunda línea. */
export function tituloEsBien(p: PolizaPortal): boolean {
  return p.bien.cosa !== null || p.bien.ubicacion !== null || coberturaEspecifica(p) !== null
}


/**
 * Lo mismo para una póliza que ha aportado la propia persona.
 *
 * La matrícula vive en su COLUMNA (se consulta y se indexa) y el resto en el
 * `datos_ramo`, así que se juntan antes de describir — `describirBien` no sabe
 * de dónde viene cada clave, ni tiene por qué. La referencia catastral va
 * aparte porque no identifica el bien para una persona: nadie reconoce su casa
 * por ella, así que se dice detrás y en gris.
 */
export function BienDeclarada({
  ramo,
  matricula,
  referenciaCatastral,
  datosRamo,
}: {
  ramo: string | null
  matricula: string | null
  referenciaCatastral: string | null
  datosRamo: Record<string, unknown> | null
}) {
  const bien = describirBien(ramo, { ...(datosRamo ?? {}), ...(matricula ? { matricula } : {}) })
  const algo = bienTieneAlgo(bien)
  if (!algo && referenciaCatastral === null) return null
  return (
    <p className="cartera-bien">
      {algo ? (bien.cosa ?? bien.ubicacion) : null}
      {algo && bien.detalles.length > 0 && <span className="tenue"> · {bien.detalles.join(' · ')}</span>}
      {referenciaCatastral !== null && (
        <span className="tenue">
          {algo ? ' · ' : ''}Ref. catastral {referenciaCatastral}
        </span>
      )}
    </p>
  )
}

/**
 * QUÉ está asegurado: el coche, el piso.
 *
 * 🚨 No pinta NADA cuando no hay dato, y eso es deliberado: `null` aquí
 * significa «la compañía no nos lo ha informado» **o** «tu nivel no lo ve», y
 * ninguna de las dos cambia lo que esta persona puede hacer. Un «Matrícula: —»
 * solo genera una pregunta que Alberto tiene que contestar. Es la regla de
 * visibilidad del portal (`CLAUDE.md` de la app), no una omisión.
 *
 * Y `cosa` y `ubicacion` llegan ya filtradas por nivel desde
 * `lib/cartera-lectura.ts`: aquí no se decide quién ve qué.
 */
export function Bien({ bien }: { bien: BienAsegurado }) {
  if (!bienTieneAlgo(bien)) return null
  return (
    <p className="cartera-bien">
      {bien.cosa ?? bien.ubicacion}
      {bien.detalles.length > 0 && <span className="tenue"> · {bien.detalles.join(' · ')}</span>}
    </p>
  )
}

/**
 * 🚨 EL aviso de la pantalla: `devueltos > 0` significa que la compañía intentó
 * cobrar y NO pudo. Es lo único que puede dejar a esta persona sin cobertura
 * sin que ella se entere, así que va arriba y con una acción al lado.
 *
 * 🚨 Y la línea que no se puede cruzar: un recibo **devuelto** no es un recibo
 * **pendiente/al cobro**. El pendiente está emitido y aún sin cargar — es
 * información neutra («tu próximo recibo») y vive en `<RecibosDePoliza>`, jamás aquí.
 * Pintar un pendiente como impago acusa de moroso a quien está al día; es
 * exactamente el fallo que se corrigió en `/correduria` (PR #2179).
 *
 * No se pinta ningún importe: `RecibosPortal` da el NÚMERO de devueltos, no su
 * cuantía, y el importe del próximo al cobro es de otro recibo. Poner ahí una
 * cifra que no es la del devuelto sería inventarla.
 */
/** Buzón único de la correduría. No hay ninguna ruta de API para esto todavía:
 *  el aviso sale por el mismo canal que ya usa el correo del código
 *  (`PORTAL_MAIL_REPLY_TO`), y no se inventa un endpoint que no existe. */
const CORREO_CORREDURIA = 'hola@grupoasegura.es'

/**
 * La póliza que esta sustituye (el cliente se cambió de compañía) ya no sale aparte: lo dice la
 * nueva, para que no parezca que ha desaparecido un seguro. `null` = no sustituye a ninguna.
 *
 * 🚨 La fecha que cuenta es la del CAMBIO (inicio de la nueva), no el vencimiento de la vieja:
 * pueden no coincidir (Reale empezó el 22/09 y Mapfre vencía el 24/09). Sin inicio, no se inventa.
 */
export function textoSustitucion(p: PolizaPortal): string | null {
  const v = p.sustituyeA
  if (v === null) return null
  const f = fechaEs(p.fechaInicio)
  if (f === null) return `Sustituye a tu seguro de ${v.compania}`
  return `Te cambiaste de ${v.compania} a ${p.compania} el ${f}`
}

/**
 * Historial de compañías de este seguro, de la actual a la más antigua, con el día de cada cambio.
 * Sale en la ficha de cualquier póliza de la cadena (también en la vieja, para que diga a dónde fue).
 * Cada eslabón que no es esta enlaza a su ficha: la vieja sigue siendo del cliente.
 */
export function HistorialCompanias({ p }: { p: PolizaPortal }) {
  if (p.cambiosCompania.length === 0) return null
  const lista = [...p.cambiosCompania].reverse()
  return (
    <section className="seccion" aria-labelledby="historial-companias-titulo">
      <h2 id="historial-companias-titulo">Historial de compañías</h2>
      <ul className="siniestros">
        {lista.map((e, i) => {
          const anterior = lista[i + 1]
          const desde = fechaEs(e.desde)
          const hasta = fechaEs(e.hasta)
          const periodo =
            e.hasta === null && i === 0
              ? desde ? `Desde el ${desde}` : 'Fecha de inicio sin informar'
              : `${desde ? `Del ${desde}` : 'Inicio sin informar'} ${hasta ? `al ${hasta}` : '· fecha del cambio sin informar'}`
          return (
            <li key={e.id} className="siniestro">
              <strong>{e.compania}</strong>
              {e.id === p.id && <span className="chip ok">esta póliza</span>}
              <span className="suave">{periodo}</span>
              {e.numeroPoliza && <span className="tenue">Póliza {e.numeroPoliza}</span>}
              {anterior && (
                <span className="suave" style={{ flexBasis: '100%' }}>
                  Cambio desde {anterior.compania}
                  {fechaEs(e.desde) ? ` el ${fechaEs(e.desde)}` : ''}
                </span>
              )}
              {e.id !== p.id && <Link href={`/boveda/poliza/${e.id}`}>Ver esta póliza</Link>}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export function AvisoReciboDevuelto({ p }: { p: PolizaPortal }) {
  const devueltos = p.recibos?.devueltos ?? 0
  if (devueltos === 0) return null

  const identifica = p.numeroPoliza ? `póliza ${p.numeroPoliza}` : `póliza de ${p.compania} (${RAMO[p.ramo] ?? p.ramo})`
  const asunto = `Recibo devuelto · ${identifica}`
  const cuerpo = [
    'Hola:',
    '',
    `En el portal me aparece ${devueltos === 1 ? 'un recibo devuelto' : `${devueltos} recibos devueltos`} de mi ${identifica} con ${p.compania}.`,
    'Quiero regularizarlo. ¿Me decís cómo?',
    '',
    'Gracias.',
  ].join('\n')
  const mailto = `mailto:${CORREO_CORREDURIA}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`

  return (
    // 🚨 En tono NEGATIVO y con título propio, no en el ámbar de un aviso más:
    // es lo único de esta pantalla que puede dejar a alguien sin cobertura sin
    // que se entere. El resto de la tarjeta son datos; esto es una alarma.
    <div className="alarma" role="alert">
      <p className="alarma-titulo">
        {devueltos === 1 ? 'Tienes un recibo devuelto' : `Tienes ${devueltos} recibos devueltos`}
      </p>
      <p>
        El cobro se intentó y no salió. Mientras no se regularice, la compañía puede dejar de
        cubrirte.
      </p>
      <a className="boton" href={mailto}>
        Avisar a la correduría
      </a>
    </div>
  )
}

/**
 * Lo que la cabecera de una póliza plegada dice, y si esa póliza se puede
 * plegar siquiera.
 *
 * 🚨 `abrir` NO se deduce de `texto === null`, y por eso es un campo: hay
 * cabeceras que SÍ dicen algo y aun así no pueden esconder lo de dentro (un
 * recibo devuelto). Con la apertura derivada del texto, añadir mañana un caso
 * así obliga a vaciar la cabecera para que se abra — o sea, a elegir entre
 * enseñar el aviso y explicarlo.
 */
export type ResumenPoliza = { texto: string | null; abrir: boolean }

/**
 * Lo próximo que se paga y lo último que se pagó, en una línea — o `null`
 * cuando no hay NADA que resumir.
 *
 * 🚨 Es el titular de la póliza en la pestaña «Recibos», y por eso vive aquí
 * suelto: lo pinta el CUERPO (la ficha de una póliza) y lo pinta la CABECERA
 * del plegable (`VistaPorPoliza`), y con dos copias la cabecera acabaría
 * diciendo una cosa y el cuerpo otra sobre el mismo recibo.
 *
 * 🚨 `null` NO es «no debes nada»: es «de esta póliza no sabemos ni importe ni
 * fecha», o que su estado es `sin_informar`/`solo_anulados` y lo que hay dentro
 * es una explicación, no una lista. Quien lo use para decidir si plegar tiene
 * que dejarla ABIERTA — plegar una explicación tras una cabecera muda es
 * esconder el motivo por el que no se ve nada.
 */
export function lineaRecibos(p: PolizaPortal): string | null {
  if (p.recibos === null) return null
  const r = p.recibos
  if (r.estado !== 'con_recibos') return null

  const partes: string[] = []
  // 🚨 El DEVUELTO va primero, delante del próximo y del último cobrado. Es lo
  // único de una póliza que puede dejar a alguien sin cobertura sin que se
  // entere, y con la póliza plegada esta línea es TODO lo que se ve: enterrarlo
  // detrás de «último cobrado 65,51€» convierte la cabecera en una frase
  // tranquilizadora sobre un cobro que falló.
  if (r.devueltos > 0) {
    partes.push(r.devueltos === 1 ? '1 recibo devuelto' : `${r.devueltos} recibos devueltos`)
  }
  if (r.proximoAlCobro) {
    // `importe: null` = el EIAC no traía un importe legible. No es 0€, así que
    // se cuenta lo que se sabe (la fecha) y se calla lo que no.
    const cuando = fechaEs(r.proximoAlCobro.fechaVencimiento)
    const importe = r.proximoAlCobro.importe
    if (importe !== null) partes.push(`Tu próximo recibo: ${eur(importe)}${cuando ? ` el ${cuando}` : ''}`)
    else if (cuando) partes.push(`Tu próximo recibo vence el ${cuando}`)
    // Ni importe ni fecha legibles. Se dice IGUAL que hay uno pendiente: sin
    // esta rama la línea se queda en «último cobrado X», que con la póliza
    // plegada se lee como «estás al corriente» teniendo un recibo al cobro.
    else partes.push('Tienes un recibo pendiente')
  }
  if (r.ultimoCobrado) {
    const cuando = fechaEs(r.ultimoCobrado.fechaEmision)
    const importe = r.ultimoCobrado.importe
    if (importe !== null) partes.push(`último cobrado ${eur(importe)}${cuando ? ` (${cuando})` : ''}`)
    else if (cuando) partes.push(`último cobrado el ${cuando}`)
  }

  return partes.length > 0 ? partes.join(' · ') : null
}

/**
 * La misma línea, más si la póliza puede nacer plegada.
 *
 * 🚨 Con un recibo DEVUELTO nace ABIERTA aunque la cabecera lo nombre: el chip
 * rojo, su explicación y el botón de avisar a la correduría viven en la lista,
 * y este portal ya tiene escrito que el devuelto no se esconde detrás de un
 * clic. Sin texto que enseñar, abierta por la razón de siempre: dentro hay una
 * explicación, no una lista.
 */
export function resumenRecibos(p: PolizaPortal): ResumenPoliza {
  const texto = lineaRecibos(p)
  const devueltos = p.recibos?.devueltos ?? 0
  return { texto, abrir: texto === null || devueltos > 0 }
}

/**
 * TODO el bloque de recibos de una póliza, en voz NEUTRA. Lo que alarma vive en
 * `<AvisoReciboDevuelto>`.
 *
 * Es **un solo componente a propósito**: los tres estados de abajo se deciden en
 * un único sitio. Partirlo en «titular» + «lista» dejaba la frase de cada estado
 * en dos ficheros, y el día que alguien tocara uno la pantalla diría dos cosas
 * distintas sobre lo mismo.
 *
 * - `recibos === null` → el nivel de esta persona no enseña recibos. No es una
 *   ausencia del dato: se oculta y no se menciona.
 * - `estado === 'sin_informar'` → **la compañía no ha informado recibos**, que
 *   NO es «estás al corriente». La frase se dice entera porque el silencio sí se
 *   leería así.
 * - `estado === 'solo_anulados'` → informó recibos y **todos** están anulados.
 *   Son 20 de las 110 pólizas vivas, y hasta hoy no pintaban NADA: ni el hueco
 *   (el total contaba los anulados) ni una línea (no quedaba ninguno que
 *   enseñar). Veinte pólizas mudas de ciento diez.
 */
export function RecibosDePoliza({
  p,
  sinResumen = false,
}: {
  p: PolizaPortal
  /**
   * `true` cuando quien llama YA pinta la línea de resumen en otro sitio —hoy,
   * la cabecera del plegable de `VistaPorPoliza`—. No se toca nada más: los
   * tres estados y la lista siguen decidiéndose aquí.
   */
  sinResumen?: boolean
}) {
  if (p.recibos === null) return null
  const r = p.recibos

  if (r.estado === 'sin_informar') {
    return (
      <p className="hueco">
        <span className="pendiente">Sin informar</span>
        Tu compañía no nos ha informado de ningún recibo. No significa que estés al corriente.
      </p>
    )
  }

  if (r.estado === 'solo_anulados') {
    return (
      <p className="hueco">
        <span className="pendiente">Nada que enseñarte</span>
        {r.anulados === 1
          ? 'El único recibo que nos consta de esta póliza está anulado por tu compañía, así que no te cuenta ni como cobrado ni como pendiente.'
          : `Los ${r.anulados} recibos que nos constan de esta póliza están anulados por tu compañía, así que no te cuentan ni como cobrados ni como pendientes.`}{' '}
        Si esperabas ver un cobro aquí, dínoslo y lo miramos.
      </p>
    )
  }

  const linea = lineaRecibos(p)

  return (
    <>
      {/* Ni un solo dato que enseñar (recibos sin importe ni fecha): no se pinta
          una línea vacía, y tampoco «ningún recibo al cobro», que se leería como
          «nada que pagar» sin que nadie lo haya comprobado. */}
      {!sinResumen && linea !== null && <div className="linea">{linea}</div>}
      <ul className="recibos">
        {r.historial.map((rec, i) => {
          const tono = tonoSituacionRecibo(rec.situacion)
          const emision = fechaEs(rec.fechaEmision)
          const vence = fechaEs(rec.fechaVencimiento)
          return (
            // La `key` es el índice porque `poliza_recibos.id` NO se pide al
            // `select`: traerlo solo para esto sería sacar un identificador de
            // BD a la vista sin que nada de la pantalla lo use.
            <li className="recibo" key={i} data-tono={tono}>
              <span className="recibo-importe">
                {/* `null` = el EIAC no traía un importe legible. Un 0€ inventado
                    aquí sería un cobro que nadie hizo. */}
                {rec.importe !== null ? eur(rec.importe) : <span className="pendiente">Sin importe</span>}
              </span>
              <span className={tono === 'devuelto' ? 'chip peligro' : tono === 'al-cobro' ? 'chip acento' : 'chip'}>
                {etiquetaSituacionRecibo(rec.situacion)}
              </span>
              <span className="recibo-fechas">
                {tono === 'al-cobro'
                  ? vence
                    ? `Vence el ${vence}`
                    : 'Sin fecha de vencimiento'
                  : emision
                    ? `Emitido el ${emision}`
                    : 'Sin fecha'}
              </span>
            </li>
          )
        })}
      </ul>
      {/* Se DICE que hay anulados fuera de la lista, en vez de que el cliente
          eche cuentas y le falten. No se enseñan: son extornos y sus
          re-emisiones, que se cancelan entre sí (los hay de −1.268,18€), y un
          importe en negativo en esta lista no informa, hace llamar. */}
      {r.anulados > 0 && (
        <p className="suave" style={{ margin: '8px 0 0', fontSize: 13 }}>
          {r.anulados === 1
            ? 'Hay además un recibo anulado por tu compañía, que no se te cobró.'
            : `Hay además ${r.anulados} recibos anulados por tu compañía, que no se te cobraron.`}{' '}
          No se listan porque se cancelan entre sí.
        </p>
      )}
    </>
  )
}

/**
 * Coberturas. `null` = el nivel no las enseña (se oculta); `total === 0` = **no
 * nos consta el detalle**, que NO es «no tienes coberturas»: decirle eso a
 * alguien que sí las tiene es empujarle a contratar lo que ya paga.
 */
export function Coberturas({ p }: { p: PolizaPortal }) {
  if (p.coberturas === null) return null
  const c = p.coberturas
  if (c.total === 0)
    return (
      <p className="hueco">
        <span className="pendiente">Sin informar</span>
        No nos consta el detalle de tus coberturas. No significa que no las tengas.
      </p>
    )
  // `total > 0` con la lista vacía = las coberturas vienen sin descripción ni
  // código. Se dice cuántas hay, que es lo único cierto.
  if (c.lista.length === 0) {
    return <div className="linea">{c.total === 1 ? '1 cobertura informada' : `${c.total} coberturas informadas`}</div>
  }
  // 🚨 Se listan TODAS, una por línea (07/09/2026, «que el cliente vea todas
  // las coberturas que tiene»). Antes se pintaban cuatro seguidas y un «y 6
  // más» que no llevaba a ninguna parte: no había dónde ver esas seis. Una por
  // renglón además se lee: en un solo párrafo con puntos medios, nueve
  // coberturas son una frase larga que nadie termina.
  const sinTexto = c.total - c.lista.length
  return (
    <>
      <p className="suave" style={{ margin: '0 0 8px', fontSize: 13 }}>
        {c.total === 1 ? '1 cobertura' : `${c.total} coberturas`}
      </p>
      <ul className="coberturas">
        {c.lista.map((nombre, i) => (
          <li key={`${nombre}-${i}`}>
            {nombre}
            {c.capitales?.[i] === 'ilimitado'
              ? ': ilimitado'
              : typeof c.capitales?.[i] === 'number' && `: ${eur(c.capitales[i] as number)}`}
          </li>
        ))}
      </ul>
      {/* `total > lista.length` = filas informadas SIN descripción ni código.
          Se dice, en vez de dejar que el cliente cuente y le falten: el hueco es
          de la compañía, no una cobertura que le estemos escondiendo. */}
      {sinTexto > 0 && (
        <p className="suave" style={{ margin: '8px 0 0', fontSize: 13 }}>
          {sinTexto === 1
            ? 'Hay además 1 cobertura de la que tu compañía no nos ha informado el nombre.'
            : `Hay además ${sinTexto} coberturas de las que tu compañía no nos ha informado el nombre.`}
        </p>
      )}
    </>
  )
}

/**
 * Cuántos siniestros hay y cuántos siguen sin cerrar — o `null` cuando no nos
 * consta ninguno (y entonces lo que hay dentro es la frase de «sin informar»,
 * que NO es «no has tenido ninguno» y por eso no se pliega).
 *
 * Misma razón de existir que `lineaRecibos`: lo dice la ficha y lo dice la
 * cabecera del plegable, y tiene que decirlo igual.
 */
export function lineaSiniestros(p: PolizaPortal): string | null {
  if (p.siniestros === null || p.siniestros.length === 0) return null
  const r = resumirHistorialSiniestros(p.siniestros)
  const total = r.total === 1 ? '1 siniestro' : `${r.total} siniestros`
  return r.abiertos > 0 ? `${total} · ${r.abiertos} sin cerrar` : total
}

/**
 * Lo mismo para siniestros. Aquí no hay nada que la cabecera no pueda contar
 * —«1 sin cerrar» ya lo dice—, así que solo nace abierta la que no tiene
 * historial y lleva dentro la frase de «no nos consta ninguno».
 */
export function resumenSiniestros(p: PolizaPortal): ResumenPoliza {
  const texto = lineaSiniestros(p)
  return { texto, abrir: texto === null }
}

/**
 * El HISTORIAL de siniestros de una póliza.
 *
 * Alberto: «y los recibos? e historial siniestros?». No existía — la lectura
 * filtraba por `abierto|en_tramitacion`, así que de los 67 siniestros de la
 * cartera viva se veían 7 y **los 60 cerrados no los veía nadie**.
 *
 * Los tres estados de la regla de la casa, y aquí importan los tres:
 *
 * - `null` = **tu nivel no llega**. No se pinta NADA, ni un «no visible»: a un
 *   tercero, decirle que hay algo que no puede ver ya le cuenta que existe. Es
 *   el mismo criterio que los siniestros abiertos (04/09/2026).
 * - `[]` = **no nos consta ninguno**, que NO es «no has tenido ninguno». La
 *   compañía los informa por EIAC y puede no haberlo hecho; afirmar lo segundo
 *   es hablar de la vida de alguien sin haberla mirado. Por eso lleva la
 *   píldora de hueco y no una frase en gris.
 * - Con contenido = la lista, de lo más reciente a lo más antiguo.
 *
 * 🚨 Lo que NO se pinta, medido: el `tipo` (es un código numérico de la
 * compañía: 1107, 1915, 1312…) y cualquier fecha de cierre (esa columna no
 * existe — `updated_at` es la última vez que se tocó la fila, no el día que se
 * cerró). Ni tramitador ni perito: gestión del corredor, regla de visibilidad.
 */
export function HistorialSiniestros({
  p,
  sinResumen = false,
}: {
  p: PolizaPortal
  /** `true` cuando el recuento ya lo dice la cabecera del plegable. Ver `RecibosDePoliza`. */
  sinResumen?: boolean
}) {
  if (p.siniestros === null) return null
  const lista = p.siniestros

  if (lista.length === 0) {
    return (
      <p className="hueco">
        <span className="pendiente">Sin informar</span>
        No nos consta ningún siniestro en esta póliza. No significa que no hayas tenido ninguno: nos
        los informa tu compañía.
      </p>
    )
  }

  const resumen = lineaSiniestros(p)
  return (
    <>
      {!sinResumen && resumen !== null && (
        <p className="suave" style={{ margin: '0 0 10px', fontSize: 13 }}>
          {resumen}
        </p>
      )}
      <ul className="siniestros">
        {lista.map((s) => {
          const cuando = fechaEs(s.fechaHora)
          const tono = tonoEstadoSiniestro(s.estado)
          return (
            <li key={s.id} className="siniestro" data-tono={tono}>
              <span className="siniestro-fecha">
                {/* Es la fecha del HECHO, y se dice cuál es: sin la palabra, en
                    una lista de siniestros se lee como la de resolución. */}
                {cuando ? `Ocurrió el ${cuando}` : 'Sin fecha informada'}
              </span>
              <span
                className={`chip${tono === 'abierto' ? ' aviso' : tono === 'rechazado' ? ' peligro' : ''}`}
              >
                {etiquetaEstadoSiniestro(s.estado)}
              </span>
              {/* La referencia es con lo que la compañía contesta al teléfono
                  (informada en 67 de 67 de la cartera viva), así que va visible
                  y en cifras tabulares para poder leerla en voz alta. */}
              {s.referencia && <span className="siniestro-ref">Ref. {s.referencia}</span>}
              {/* DÓNDE pasó. Solo consta en 8 de los 69 de la cartera, así que
                  cuando falta no se pinta nada: un «Lugar: —» no informa. */}
              {/* QUÉ TIPO fue, con la tabla oficial de TIREA. Sin traducción no se pinta. */}
              {s.tipoLegible && <span className="siniestro-tipo">{s.tipoLegible}</span>}
              {s.lugar && <span className="siniestro-lugar">{s.lugar}</span>}
              {/* QUÉ pasó, en las palabras de quien lo tramitó y SIN recortar:
                  media frase de un siniestro es otro relato. Es lo que Alberto
                  pidió el 07/09/2026 («toda la información») y lo único que
                  contesta la pregunta que trae aquí a un cliente. `null` = la
                  compañía no lo contó, y entonces se calla: decir «sin
                  descripción» no le añade nada a quien ya ve la referencia. */}
              {s.descripcion && <p className="siniestro-desc">{s.descripcion}</p>}
              {/* El estado en lenguaje claro y qué hacer (plan ASegura OS §Q.8). Solo
                  lo que consta; lo que manda la compañía va debajo. */}
              {/* Cómo va según la COMPAÑÍA (EIAC), antes de qué hacer: primero
                  los hechos. Solo si la manda: callarse es lo correcto, porque
                  la explicación de abajo ya dice que se pregunte al corredor. */}
              {s.tramitacion && <TramitacionCompania t={s.tramitacion} />}
              <SiniestroExplicado estado={s.estado} fechaHora={s.fechaHora} />
            </li>
          )
        })}
      </ul>
    </>
  )
}

/**
 * La línea de tiempo que manda la compañía. Sin reserva, sin culpa y sin
 * nombres (lo garantiza `tramitacionSiniestro`, que ni los trae). «Lleva
 * pagado» y no «te ha pagado»: el total incluye lo que paga al perito o al
 * taller, que no es dinero del cliente.
 */
function TramitacionCompania({ t }: { t: TramitacionSiniestro }) {
  if (t.pasos.length === 0 && t.totalPagado === null && t.indemnizacion === null) return null
  return (
    <div className="siniestro-tramite">
      <p className="siniestro-tramite-titulo">Lo que nos cuenta tu compañía</p>
      {t.pasos.length > 0 && (
        <ol>
          {t.pasos.map((p, i) => {
            const cuando = p.fecha ? fechaEs(new Date(`${p.fecha}T00:00:00Z`)) : null
            return (
              <li key={i} data-tipo={p.tipo}>
                <span className="siniestro-tramite-fecha">{cuando ?? 'Sin fecha'}</span>
                <span>
                  {p.texto}
                  {p.importe !== null && `: ${eur(p.importe)}`}
                </span>
              </li>
            )
          })}
        </ol>
      )}
      {t.indemnizacion !== null && (
        <p className="siniestro-tramite-cifra">Indemnización informada: {eur(t.indemnizacion)}</p>
      )}
      {t.totalPagado !== null && (
        <p className="siniestro-tramite-cifra">La compañía lleva pagado en este siniestro: {eur(t.totalPagado)}</p>
      )}
    </div>
  )
}

function SiniestroExplicado({ estado, fechaHora }: { estado: string; fechaHora: Date | null }) {
  const x = explicarSiniestro(estado, fechaHora)
  return (
    <p className="siniestro-explica">
      <strong>{x.situacion}</strong> {x.queHacer}{' '}
      <a href="/mensajes">Escribir a tu corredor</a>
    </p>
  )
}
