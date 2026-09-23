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
import { DIAS_AVISO_PURGA, HORAS_PULL_MUDO, HORAS_RECHAZO_RECIENTE } from '@central/module-seguros'

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
  const estadoOk = s.estado === 'ok' || s.estado === 'degradada'
    || s.estado === 'parcial' || s.estado === 'sin_datos'
  return estadoOk
    && esNumero(s.total) && esNumero(s.recientes)
    && Array.isArray(s.porEntidad) && Array.isArray(s.porClave)
    && Array.isArray(s.motivos)
}

/**
 * 🚨 La frontera donde el tipo MIENTE, y hay que rehacerlo.
 *
 * `SaludIngesta` declara `crudo: CrudoPendiente | null`, pero esto viene de un
 * JSON por red: si `apps/asegura` está desplegada con una versión anterior a
 * las señales nuevas, esas claves no vienen y llegan como `undefined`, no como
 * `null`. Y `undefined !== null` es `true`, así que la guarda
 * `s.crudo !== null && s.crudo.purgaInminente` entraría en la rama y reventaría
 * al leer la propiedad — pantalla en blanco en vez de panel.
 *
 * No es hipotético: plataforma y asegura se despliegan por separado, así que la
 * ventana en la que una va por delante de la otra existe en cada release.
 *
 * `esSalud` no lo cubre a propósito (tolera campos nuevos para no romperse con
 * versiones futuras), así que la normalización va aquí: ausente se convierte en
 * `null`, que es exactamente lo que significa — «no me lo han contado».
 */
function normalizarSenalesNuevas(s: SaludIngesta): SaludIngesta {
  return {
    ...s,
    crudo: s.crudo ?? null,
    cobertura: s.cobertura ?? null,
    cajaNegra: s.cajaNegra ?? null,
    ultimoPull: s.ultimoPull ?? null,
    parciales: s.parciales ?? null,
    objetosEnRevision: s.objetosEnRevision ?? null,
    // `huecos` ausente = un servidor que no sabe decir QUÉ no pudo comprobar.
    // El defecto no puede ser `[]` («se miró todo»): eso es justo la afirmación
    // tranquilizadora que nadie ha hecho. Se declara como hueco en sí mismo.
    huecos: Array.isArray(s.huecos)
      ? s.huecos
      : ['No consta qué comprobaciones se han podido hacer en esta lectura.'],
  }
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
    salud: normalizarSenalesNuevas(r.salud),
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
  clave:
    | 'cuarentena'
    | 'huerfanas'
    | 'rechazos'
    | 'silencio'
    | 'backlog'
    | 'cron'
    | 'crudo'
    | 'caja_negra'
    | 'cobertura'
    | 'parciales'
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

  // 🚨 EL PRIMERO, y por delante de todo lo demás: si el cron no ha corrido,
  // ninguna de las otras señales significa nada. No hay ficheros atascados
  // porque no se ha ido a buscar ninguno, no hay rechazos porque no se ha
  // pedido nada — todas saldrían a cero y la pantalla diría «va bien» con la
  // ingesta parada. Leer las demás antes que esta es leerlas al revés.
  if (s.ultimoPull !== null && s.ultimoPull.horas > HORAS_PULL_MUDO) {
    out.push({
      clave: 'cron', tipo: 'perdida', n: s.ultimoPull.horas,
      titulo: `La ingesta de CIMA lleva ${s.ultimoPull.horas} h sin correr`,
      detalle:
        'No es que no haya datos: es que no se ha ido a buscarlos. Mientras siga así, ' +
        'el resto de esta pantalla está en cero porque no ha entrado nada, no porque todo vaya bien.',
    })
  }

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

  // 🚨 Va por delante de rechazos y huérfanas porque es la ÚNICA de la lista
  // que no se puede volver a pedir: el fichero ya está confirmado a TIREA.
  if (s.objetosEnRevision !== null && s.objetosEnRevision > 0) {
    const n = s.parciales?.length ?? 0
    const peor = [...(s.parciales ?? [])].sort((a, b) => b.enRevision - a.enRevision)[0]
    out.push({
      clave: 'parciales', tipo: 'perdida', n: s.objetosEnRevision,
      titulo: `${s.objetosEnRevision} objeto(s) no se guardaron de ${n} fichero(s) ya dados por buenos`,
      detalle:
        (peor
          ? `El peor, ${peor.entidad}${peor.clave ? ` / clave ${peor.clave}` : ''} ${peor.tipo}: ` +
            `${peor.enRevision} de ${peor.declarados} (${peor.fichero}). `
          : '') +
        'CIMA ya confirmó esos ficheros a TIREA y no los reenvía: pedirlos otra vez no sirve. Mira el motivo ' +
        'de cada objeto en la ingesta de origen: si es el mapper, se corrige; si es «sin póliza», suele ser ' +
        'una póliza duplicada por fusionar. Después se reprocesa el crudo antes de que caduque (solo existe ' +
        'desde el 17/09/2026: los ficheros anteriores hay que bajarlos del Portal CIMA).',
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

  // ⏳ Lo único con FECHA LÍMITE de toda la pantalla: cuando el TTL pase, la
  // última copia de ese fichero se borra y CIMA no lo reenvía (ya lo confirmó
  // a TIREA). Las demás señales esperan; esta caduca.
  if (s.crudo !== null && s.crudo.purgaInminente > 0) {
    out.push({
      clave: 'crudo', tipo: 'perdida', n: s.crudo.purgaInminente,
      titulo: `${s.crudo.purgaInminente} fichero(s) guardados se BORRAN en menos de ${DIAS_AVISO_PURGA} días`,
      detalle:
        'Es la última copia que queda: CIMA ya los dio por entregados y no los vuelve a mandar. ' +
        'Reprocesarlos ahora o se pierden.',
    })
  }

  if (s.cajaNegra !== null && s.cajaNegra.cuerpos > 0) {
    out.push({
      clave: 'caja_negra', tipo: 'perdida', n: s.cajaNegra.cuerpos,
      titulo: `${s.cajaNegra.cuerpos} envío(s) distintos de Codeoscopic rechazados y guardados`,
      detalle:
        `${s.cajaNegra.posts} envíos en total. Ya se puede mirar su forma para arreglar el validador` +
        (s.cajaNegra.sinCuerpo > 0
          ? `; ${s.cajaNegra.sinCuerpo} de ellos SIN cuerpo guardado, y esos no se pueden reprocesar.`
          : '.'),
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
  if (s.parciales === null) {
    out.push({
      clave: 'parciales', tipo: 'hueco', n: null,
      titulo: 'Sin comprobar si algún fichero confirmado se dejó objetos sin guardar',
      detalle:
        'Es la pérdida que no se puede volver a pedir, así que no saberlo es lo más caro de esta lista.',
    })
  }
  if (s.huerfanas !== null && s.huerfanas > 0 && s.huerfanasReparto === null) {
    out.push({
      clave: 'huerfanas', tipo: 'hueco', n: null,
      titulo: 'Sin la lista de pólizas huérfanas',
      detalle: 'Se sabe cuántas son, no cuáles: no se le puede pedir a la compañía una lista que no se tiene.',
    })
  }

  // Huecos de las señales nuevas. `null` aquí no es «no hay»: es que la
  // consulta no pudo mirarlo, y son dos trabajos distintos.
  if (s.ultimoPull === null) {
    out.push({
      clave: 'cron', tipo: 'hueco', n: null,
      titulo: 'No consta ninguna corrida del cron de CIMA',
      detalle: 'Puede que nunca haya corrido o que no se haya podido leer. No significa que vaya bien.',
    })
  }
  if (s.crudo === null) {
    out.push({
      clave: 'crudo', tipo: 'hueco', n: null,
      titulo: 'Sin comprobar la cuarentena de ficheros guardados',
      detalle: 'No se ha podido mirar si hay crudo esperando reproceso ni si algo está a punto de caducar.',
    })
  }
  if (s.cajaNegra === null) {
    out.push({
      clave: 'caja_negra', tipo: 'hueco', n: null,
      titulo: 'Sin comprobar la caja negra del webhook',
      detalle: 'No se sabe si Codeoscopic ha mandado algo que hayamos rechazado.',
    })
  } else if (!s.cajaNegra.capturaActiva) {
    // Tercer estado explícito: la captura existe y todavía no ha entrado nada.
    // Sin decirlo, un cero recién estrenado se leería como «no llega nada».
    out.push({
      clave: 'caja_negra', tipo: 'hueco', n: 0,
      titulo: 'La captura de envíos rechazados aún no ha recogido ninguno',
      detalle: 'Está puesta y esperando. Que esté a cero no quiere decir que no llegue nada: quiere decir que todavía no ha pasado ninguno.',
    })
  }

  // Cobertura: se informa SIEMPRE como hueco, nunca como pérdida. El EIAC trae
  // cientos de campos y siempre habrá alguno sin leer; si esto fuera una
  // alarma, estaría encendida para siempre y se dejaría de mirar.
  if (s.cobertura === null) {
    out.push({
      clave: 'cobertura', tipo: 'hueco', n: null,
      titulo: 'Todavía no se ha medido qué campos manda CIMA y no leemos',
      detalle: 'Hace falta que pase un pull con ficheros. Sin medir NO equivale a «los leemos todos».',
    })
  } else if (s.cobertura.rutasNuncaLeidas > 0) {
    const peor = [...s.cobertura.porTipo].sort((a, b) => b.nuncaLeidas - a.nuncaLeidas)[0]
    // El rótulo dice QUÉ se cuenta (rutas distintas) y de cuántas compañías
    // sale: sin eso, la cifra se lee como el catálogo EIAC entero cuando solo
    // describe lo que han mandado las tres observadas.
    const alcance = s.cobertura.entidadesObservadas === null
      ? 'No consta de cuántas compañías sale esta cuenta. '
      : `Vistos en ${s.cobertura.entidadesObservadas} compañía(s). `
    out.push({
      clave: 'cobertura', tipo: 'hueco', n: s.cobertura.rutasNuncaLeidas,
      titulo: `${s.cobertura.rutasNuncaLeidas} de ${s.cobertura.rutas} campos distintos que manda CIMA no se leen nunca`,
      detalle:
        (peor ? `Sobre todo en ${peor.tipoObjeto} (${peor.nuncaLeidas}). ` : '') + alcance +
        'No es una avería: es lo que se está dejando sin aprovechar.',
    })
  }

  if (s.crudo !== null && s.crudo.pendientes > 0 && s.crudo.purgaInminente === 0) {
    out.push({
      clave: 'crudo', tipo: 'hueco', n: s.crudo.pendientes,
      titulo: `${s.crudo.pendientes} fichero(s) guardados esperando reproceso`,
      detalle:
        (s.crudo.masAntiguaHoras !== null
          ? `El más viejo lleva ${Math.floor(s.crudo.masAntiguaHoras / 24)} días. `
          : '') + 'Sin prisa: ninguno caduca dentro de la ventana de aviso.',
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

/**
 * ¿Hay algo que no se ha podido comprobar dentro de una lectura que sí llegó?
 *
 * 🚨 Hasta el 20/09/2026 esto miraba SOLO tres señales, así que una lectura sin
 * cron, sin crudo, sin caja negra y sin cobertura daba `false` → veredicto `ok`
 * → **la tarjeta no se pintaba** aunque `senalesIngesta` sí estuviera generando
 * sus cuatro huecos. Es el mismo fallo que el módulo puro tenía un piso más
 * abajo: la señal se componía y nadie la leía. Ahora la lista la compone el
 * módulo (`s.huecos`) y aquí solo se pregunta si está vacía — no hay enumeración
 * que se quede corta cuando aparezca la séptima señal.
 */
export function hayHuecos(s: SaludIngesta): boolean {
  return (s.huecos ?? []).length > 0
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
