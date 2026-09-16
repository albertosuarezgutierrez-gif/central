// ────────────────────────────────────────────────────────────────────────────
// La salud de la INGESTA de CIMA, tal y como la ve ALBERTO.
//
// 🚨 Por qué existe esta capa, si el vigía ya estaba escrito. El cron
// `correduria-ingesta` lleva desde el 01/09/2026 midiendo esto bien y avisando
// por Telegram, y el panel equivalente (`/salud-cima`) vive en el CRM de origen,
// `app.grupoasegura.com` — **una app en la que Alberto no entra**. Su única
// pantalla de la correduría es `plataforma → /correduria` (regla global «¿en qué
// pantalla lo va a ver?»). Así que el dato existía y no se veía: cuando el
// Telegram se pierde entre otros mensajes, no había ningún sitio donde mirar.
//
// Lo que Alberto pidió, literal: «que solo salgan errores y poder controlar; es
// muy importante que CIMA cuadre al 100%». De ahí las dos reglas de este módulo:
//
//   1. **Cuando todo va bien, no ocupa sitio.** `hayQueEnsenar` es falso y la
//      tarjeta de «Hoy» no se pinta. La sección de detalle sigue ahí para quien
//      quiera mirar el porqué.
//   2. **No poder mirar NO es estar bien.** Ni un fallo de red, ni un secreto
//      rechazado, ni una respuesta rara se pintan en verde: son `sin_comprobar`,
//      que es un estado propio y se dice con su motivo. Un panel que tranquiliza
//      cuando la consulta falló es peor que no tener panel.
//
// Todo aquí es puro: decide con la respuesta ya leída, sin red ni BD. La lectura
// vive en `ingesta-cima.ts` (servidor) y la pinta `Ingesta.tsx` (cliente).
// ────────────────────────────────────────────────────────────────────────────
import type { SaludIngesta, SilencioEntidad } from '@central/module-seguros'
import { HORAS_RECHAZO_RECIENTE } from '@central/module-seguros'

// ⚠️ Aquí NO se importa `MotivoError` de `app/(usuario)/correduria/estado-puerto`
// aunque los motivos sean los mismos: ese fichero se alcanza por el alias `@/`,
// que `node --test` no resuelve, y este módulo tiene que ser comprobable sin
// Next delante. El motivo viaja como `string` y la pantalla lo traduce con
// `MOTIVOS`, con el crudo de respaldo: un motivo que este repo no conozca se
// enseña tal cual en vez de tragarse el error.

/**
 * Lo que la pantalla sabe de la ingesta. Es la misma forma que devuelve
 * `leerIngestaCima()` por la API, pero validada aquí: lo que llegue con otra
 * forma NO se interpreta a medias, se degrada a «no se ha podido leer».
 */
export type VistaIngesta =
  | { estado: 'sin_configurar' }
  | { estado: 'error'; motivo: string }
  | {
      estado: 'ok'
      salud: SaludIngesta
      /** El puerto recortó la lista de huérfanas: los recuentos son un SUELO. */
      huerfanasTruncadas: boolean
      /** Huérfanas que el puerto no pudo atribuir a la correduría. `null` = no contadas. */
      huerfanasSinAmbito: number | null
    }

function esNumero(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function numeroONulo(v: unknown): number | null {
  return esNumero(v) ? v : null
}

/**
 * ¿Tiene forma de `SaludIngesta`?
 *
 * Se exige lo que la pantalla PINTA y nada más: si mañana el puerto añade un
 * campo (hay otra sesión ampliándolo), esta comprobación tiene que seguir
 * pasando — rechazar la respuesta entera por un campo de más convertiría una
 * versión nueva en «no se ha podido mirar», que es la mentira simétrica.
 */
function esSalud(v: unknown): v is SaludIngesta {
  if (typeof v !== 'object' || v === null) return false
  const s = v as Record<string, unknown>
  const estadoOk = s.estado === 'ok' || s.estado === 'degradada' || s.estado === 'sin_datos'
  return estadoOk
    && esNumero(s.total) && esNumero(s.recientes)
    && Array.isArray(s.porEntidad) && Array.isArray(s.porClave)
    && Array.isArray(s.motivos)
}

/**
 * Interpretación PURA de lo que devuelve `GET /api/correduria/ingesta`.
 *
 * Cualquier duda cae del lado conservador: `error`, nunca `ok`. Es la misma
 * regla de `interpretarIngesta`, un piso más abajo — aquí se vuelve a
 * comprobar porque entre aquel módulo y esta pantalla hay una red y un JSON,
 * y un `fetch` que devuelve un HTML de error de Vercel no puede acabar pintado
 * como «la ingesta va bien».
 */
export function interpretarVistaIngesta(status: number, json: unknown): VistaIngesta {
  if (status === 401 || status === 403) return { estado: 'error', motivo: 'secreto_rechazado' }
  if (status !== 200 || typeof json !== 'object' || json === null) {
    return { estado: 'error', motivo: 'respuesta_ilegible' }
  }
  const r = json as Record<string, unknown>
  if (r.estado === 'sin_configurar') return { estado: 'sin_configurar' }
  if (r.estado === 'error') {
    return { estado: 'error', motivo: typeof r.motivo === 'string' ? r.motivo : 'respuesta_ilegible' }
  }
  if (r.estado !== 'ok' || !esSalud(r.salud)) return { estado: 'error', motivo: 'respuesta_ilegible' }
  // 🚨 `salud.sin_datos` dentro de una respuesta `ok` sigue siendo «no se ha
  // podido mirar»: se traduce a error para que la pantalla no tenga DOS formas
  // de decir lo mismo y se le olvide una.
  if (r.salud.estado === 'sin_datos') return { estado: 'error', motivo: 'respuesta_ilegible' }
  return {
    estado: 'ok',
    salud: r.salud,
    // Ante la duda, el estado conservador: si no consta que NO se recortó, se
    // asume que sí. Un total presentado como completo sin serlo es peor que
    // una nota de más.
    huerfanasTruncadas: r.huerfanasTruncadas !== false,
    huerfanasSinAmbito: numeroONulo(r.huerfanasSinAmbito),
  }
}

// ── El veredicto de pantalla ────────────────────────────────────────────────

/** Tres estados, y el tercero NO es el primero. */
export type VeredictoPantalla =
  /** Se ha podido mirar y no se está perdiendo nada. */
  | 'ok'
  /** Se ha podido mirar y SÍ hay pérdida medida. */
  | 'incidencia'
  /** No se ha podido mirar (o se ha mirado a medias). NO es «va bien». */
  | 'sin_comprobar'

/**
 * Una cosa que hay que mirar, ya redactada.
 *
 * `tipo` separa lo que se ha MEDIDO de lo que no se ha podido comprobar,
 * porque son dos trabajos distintos: uno se arregla llamando a la compañía, el
 * otro mirando por qué la consulta no responde. Mezclarlos en una sola lista de
 * «avisos» es como se acaba tratando un hueco de conocimiento como una alarma
 * más — y al revés, que es peor.
 */
export type SenalIngesta = {
  clave: 'cuarentena' | 'huerfanas' | 'rechazos' | 'silencio' | 'backlog'
  tipo: 'perdida' | 'hueco'
  titulo: string
  detalle: string
  /** Cuántos elementos. `null` = consta el problema pero no cuántos son. */
  n: number | null
}

function companiasMudas(silencio: SilencioEntidad[] | null): SilencioEntidad[] {
  return (silencio ?? []).filter(e => e.veredicto === 'silencio')
}

function rechazosRecientes(s: SaludIngesta) {
  return (s.rechazos ?? []).filter(
    r => r.horasDesdeUltimo !== null && r.horasDesdeUltimo <= HORAS_RECHAZO_RECIENTE && r.n > 0,
  )
}

/**
 * Las señales de la pantalla, en el orden en que se atienden.
 *
 * Primero lo que se está perdiendo AHORA (fichero atascado reciente, compañía
 * que enmudeció, envío rechazado, huérfana), después los huecos de conocimiento
 * y al final el backlog viejo, que se informa pero no despierta a nadie: un
 * vigía que grita todos los días por lo mismo se acaba silenciando, y entonces
 * no avisa el día que importa.
 */
export function senalesIngesta(s: SaludIngesta): SenalIngesta[] {
  const out: SenalIngesta[] = []

  const mudas = companiasMudas(s.silencio)
  if (mudas.length > 0) {
    out.push({
      clave: 'silencio', tipo: 'perdida', n: mudas.length,
      titulo: `${mudas.map(m => m.entidad).join(', ')} ha(n) dejado de mandar datos`,
      detalle:
        'No hay nada atascado que reprocesar: sencillamente no llega. Compruébalo en ' +
        'CIMA/Codeoscopic desde fuera y mira si el adaptador sigue vivo.',
    })
  }

  if (s.recientes > 0) {
    const culpable = s.porClave[0]
    out.push({
      clave: 'cuarentena', tipo: 'perdida', n: s.recientes,
      titulo: `${s.recientes} fichero(s) sin procesar de los últimos días`,
      detalle: culpable
        ? `Sobre todo ${culpable.entidad}${culpable.clave ? ` / clave ${culpable.clave}` : ' (clave no legible en el nombre)'}.`
        : 'Un recibo o un siniestro que no entra no aparece en ninguna pantalla, y su comisión tampoco.',
    })
  }

  const rechazos = rechazosRecientes(s)
  if (rechazos.length > 0) {
    const total = rechazos.reduce((n, r) => n + r.n, 0)
    out.push({
      clave: 'rechazos', tipo: 'perdida', n: total,
      titulo: `${total} envío(s) rechazados en ${HORAS_RECHAZO_RECIENTE} h`,
      detalle: `Nos lo mandan y no lo aceptamos: ${rechazos.map(r => `${r.evento} (${r.origen ?? 'origen no informado'})`).join(' · ')}.`,
    })
  }

  if (s.huerfanas !== null && s.huerfanas > 0) {
    const pedir = s.huerfanasReparto?.totalPedir ?? null
    const repro = s.huerfanasReparto?.totalReprocesar ?? null
    out.push({
      clave: 'huerfanas', tipo: 'perdida', n: s.huerfanas,
      titulo: `${s.huerfanas} póliza(s) con recibos o siniestros que no encuentran su póliza`,
      detalle: s.huerfanasReparto === null
        ? 'No se ha podido obtener la lista: sé cuántas son, no cuáles pedir.'
        : `${pedir} hay que pedírselas a la compañía · ${repro} se arreglan reprocesando en la ingesta de origen.`,
    })
  }

  // Los huecos de conocimiento van APARTE y se dicen igual: callarlos los
  // convierte en un «va bien» que nadie ha comprobado.
  if (s.silencio === null) {
    out.push({
      clave: 'silencio', tipo: 'hueco', n: null,
      titulo: 'Sin comprobar si alguna compañía ha dejado de mandar',
      detalle: 'No significa que todas manden: significa que hoy no se ha podido mirar.',
    })
  }
  if (s.rechazos === null) {
    out.push({
      clave: 'rechazos', tipo: 'hueco', n: null,
      titulo: 'Sin comprobar los envíos rechazados',
      detalle: 'La puerta por la que entra Codeoscopic no se ha podido mirar en esta lectura.',
    })
  }
  if (s.huerfanas !== null && s.huerfanas > 0 && s.huerfanasReparto === null) {
    out.push({
      clave: 'huerfanas', tipo: 'hueco', n: null,
      titulo: 'Sin la lista de pólizas huérfanas',
      detalle: 'Se sabe cuántas son, no cuáles: no se le puede pedir a la compañía una lista que no se tiene.',
    })
  }

  const backlog = s.total - s.recientes
  if (backlog > 0) {
    out.push({
      clave: 'backlog', tipo: 'hueco', n: backlog,
      titulo: `${backlog} fichero(s) arrastrados de antes`,
      detalle: 'Backlog ya conocido. No es una novedad, pero sigue sin procesarse.',
    })
  }

  return out
}

/** ¿Hay pérdida MEDIDA? Es lo único que autoriza a decir «se está perdiendo». */
export function hayPerdida(s: SaludIngesta): boolean {
  return senalesIngesta(s).some(x => x.tipo === 'perdida')
}

/** ¿Hay algo que no se ha podido comprobar dentro de una lectura que sí llegó? */
export function hayHuecos(s: SaludIngesta): boolean {
  return s.silencio === null || s.rechazos === null
    || (s.huerfanas !== null && s.huerfanas > 0 && s.huerfanasReparto === null)
}

export function veredictoIngesta(v: VistaIngesta | null): VeredictoPantalla | null {
  // `null` = todavía no ha contestado. NO es «sin comprobar»: confundirlos
  // pinta una alarma durante el segundo que tarda la lectura, y eso enseña a
  // ignorar la alarma.
  if (v === null) return null
  if (v.estado !== 'ok') return 'sin_comprobar'
  if (hayPerdida(v.salud)) return 'incidencia'
  return hayHuecos(v.salud) ? 'sin_comprobar' : 'ok'
}

/**
 * ¿Se pinta la tarjeta de «Hoy»?
 *
 * Solo cuando hay algo que decir. «Todo bien» no ocupa sitio — que es
 * literalmente lo que pidió Alberto («que solo salgan errores»). Y lo que NO
 * se ha podido comprobar SÍ se pinta: es la mitad del encargo.
 */
export function hayQueEnsenar(v: VistaIngesta | null): boolean {
  const ver = veredictoIngesta(v)
  return ver === 'incidencia' || ver === 'sin_comprobar'
}

/** El titular de la tarjeta. Nunca promete calma sobre algo que no se ha mirado. */
export function tituloIngesta(v: VistaIngesta | null): string {
  const ver = veredictoIngesta(v)
  if (ver === null) return 'Comprobando la ingesta de CIMA…'
  if (v!.estado !== 'ok') return 'No se ha podido comprobar la ingesta de CIMA'
  if (ver === 'ok') return 'La ingesta de CIMA está al día'
  const s = (v as Extract<VistaIngesta, { estado: 'ok' }>).salud
  const mudas = companiasMudas(s.silencio)
  if (mudas.length > 0) return `${mudas.map(m => m.entidad).join(', ')} ha(n) dejado de mandar datos`
  if (ver === 'incidencia') return 'Se están perdiendo datos de CIMA'
  return 'La ingesta de CIMA solo se ha podido comprobar a medias'
}

/** El contador de la pestaña: `{n, parcial}` o `null` («!»), jamás un 0 de relleno. */
export function contadorIngesta(v: VistaIngesta | null): { n: number; parcial: boolean } | null | undefined {
  if (v === null) return undefined // todavía cargando: ni número ni alarma
  if (v.estado !== 'ok') return null // no se ha podido leer: «!»
  const senales = senalesIngesta(v.salud)
  const perdidas = senales.filter(x => x.tipo === 'perdida').length
  // `parcial` = el número es un SUELO: hay colas de la ingesta que esta lectura
  // no ha podido mirar, así que puede haber más pérdida de la que se cuenta.
  return { n: perdidas, parcial: hayHuecos(v.salud) }
}
