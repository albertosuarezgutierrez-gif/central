import {
  ETIQUETA_RAMO,
  bienTieneAlgo,
  describirBien,
  etiquetaEstadoSiniestro,
  resumirHistorialSiniestros,
  tonoEstadoSiniestro,
  type BienAsegurado,
} from '@central/module-seguros-portal'

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

/**
 * El titular de una fila: **qué cosa es**, no de qué compañía.
 *
 * Nadie se sabe su número de póliza y a casi nadie le dice nada «Occident» a
 * secas cuando tiene dos con ellos. Lo que reconoce es su coche y su calle. Si
 * la compañía no ha informado el bien, se cae a compañía + ramo, que es lo
 * único cierto que queda — nunca a un hueco.
 */
export function tituloDePoliza(p: PolizaPortal): string {
  const b = p.bien
  return b.cosa ?? b.ubicacion ?? `${p.compania} · ${RAMO[p.ramo] ?? p.ramo}`
}

/** ¿El titular de la fila ya es el bien? Decide qué queda para la segunda línea. */
export function tituloEsBien(p: PolizaPortal): boolean {
  return p.bien.cosa !== null || p.bien.ubicacion !== null
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
 * información neutra («tu próximo recibo») y vive en `<Recibos>`, jamás aquí.
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
 * Recibos, en voz NEUTRA. Lo que alarma vive en `<AvisoReciboDevuelto>`.
 *
 * - `recibos === null` → el nivel de esta persona no enseña recibos. No es una
 *   ausencia del dato: se oculta y no se menciona.
 * - `total === 0` → **la compañía no ha informado recibos**, que NO es «estás al
 *   corriente». Esa frase se dice entera porque el silencio sí se leería así.
 */
export function Recibos({ p }: { p: PolizaPortal }) {
  if (p.recibos === null) return null
  const r = p.recibos
  if (r.total === 0) {
    return (
      <p className="hueco">
        <span className="pendiente">Sin informar</span>
        Tu compañía no nos ha informado de ningún recibo. No significa que estés al corriente.
      </p>
    )
  }

  const partes: string[] = []
  if (r.proximoAlCobro) {
    // `importe: null` = el EIAC no traía un importe legible. No es 0€, así que
    // se cuenta lo que se sabe (la fecha) y se calla lo que no.
    const cuando = fechaEs(r.proximoAlCobro.fechaVencimiento)
    const importe = r.proximoAlCobro.importe
    if (importe !== null) partes.push(`Tu próximo recibo: ${eur(importe)}${cuando ? ` el ${cuando}` : ''}`)
    else if (cuando) partes.push(`Tu próximo recibo vence el ${cuando}`)
  }
  if (r.ultimoCobrado) {
    const cuando = fechaEs(r.ultimoCobrado.fechaEmision)
    const importe = r.ultimoCobrado.importe
    if (importe !== null) partes.push(`último cobrado ${eur(importe)}${cuando ? ` (${cuando})` : ''}`)
    else if (cuando) partes.push(`último cobrado el ${cuando}`)
  }
  // Ni un solo dato que enseñar (recibos sin importe ni fecha): no se pinta una
  // línea vacía, y tampoco «ningún recibo al cobro», que se leería como «nada
  // que pagar» sin que nadie lo haya comprobado.
  if (partes.length === 0) return null
  return <div className="linea">{partes.join(' · ')}</div>
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
  return (
    <div className="linea">
      {c.lista.join(' · ')}
      {c.total > c.lista.length && ` y ${c.total - c.lista.length} más`}
    </div>
  )
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
export function HistorialSiniestros({ p }: { p: PolizaPortal }) {
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

  const r = resumirHistorialSiniestros(lista)
  return (
    <>
      <p className="suave" style={{ margin: '0 0 10px', fontSize: 13 }}>
        {r.total === 1 ? '1 siniestro' : `${r.total} siniestros`}
        {r.abiertos > 0 && ` · ${r.abiertos} sin cerrar`}
      </p>
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
            </li>
          )
        })}
      </ul>
    </>
  )
}
