// Lectura y CLASIFICACIÓN de la respuesta de SES.
//
// 🚨 La razón de ser de este fichero: **SES no tiene código de retorno para «estoy caído»**. La
// tabla del apartado 5 de la guía solo cubre errores de la petición; una caída del Ministerio se
// manifiesta como error de transporte (timeout, 5xx, SOAP Fault), no como `codigoRetorno`. Si el
// conector mete todo en el mismo saco de «falló», acaba reintentando eternamente un parte que SES
// nunca aceptará, o —peor— dándose por vencido con uno que solo necesitaba esperar.
//
// Aplicado a los avisos: «SES no responde» es un ESPERA y «el parte está mal» es un ACTÚA HOY. Un
// vigía que diga lo mismo en los dos casos se deja de leer en dos semanas.

/** Qué clase de fallo es, que es lo que decide si se reintenta y a quién se avisa. */
export type ClaseFallo =
  | 'ok'
  /** El contenido de la petición está mal. NO reintentar sin corregir. */
  | 'datos'
  /** Alta/credenciales/permisos: no existe el arrendador, usuario incorrecto, WS no habilitado.
   *  No se arregla reintentando ni tocando código: lo arregla una persona en el portal. */
  | 'configuracion'
  /** Se ha superado un máximo por petición. Reintentar troceando el lote. */
  | 'limite'
  /** No hemos llegado a hablar con el servicio, o el servicio se rompió. Reintentar con espera. */
  | 'transporte'
  /** Código no catalogado: se trata como transporte (reintentable) pero se marca para revisarlo. */
  | 'desconocido'

export type RespuestaSes = {
  ok: boolean
  clase: ClaseFallo
  /** `codigoRetorno` de SES, si la respuesta llegó a traer uno. */
  codigo: number | null
  descripcion: string | null
  /** Identificadores de lote devueltos (el alta y la anulación son asíncronas). */
  lotes: string[]
  /** Resumen corto y CRUDO para el latido y los avisos: evidencia, no interpretación. */
  detalle: string
}

/**
 * Códigos que son culpa nuestra: el contenido o el formato de la petición está mal.
 * Reintentar tal cual solo repite el error.
 */
const CODIGOS_DATOS = new Set([
  10100, 10101, 10108, 10109, 10110, 10111, 10112, 10116, 10117, 10118,
  10121, 10122, 10128, 10130, 10131, 10140,
  // 10150 = «se ha superado el número máximo de caracteres de la aplicación». Va aquí y no en
  // límites: no es el tamaño del lote, es un campo NUESTRO de la cabecera que hay que acortar.
  // Trocear la petición no lo arreglaría nunca.
  10150,
  10159, 10160, 10180,
])

/** Códigos de alta/permisos: los arregla una persona en el portal SES, no el código. */
const CODIGOS_CONFIGURACION = new Set([
  10103, // el código de arrendador no existe en el sistema
  10107, // usuario incorrecto
  10119, // el arrendador no puede realizar ese tipo de comunicaciones
  10120, // el arrendador no tiene habilitado el servicio web
])

/** Se ha superado un máximo por petición: reintentar troceando. */
const CODIGOS_LIMITE = new Set([
  10136, // número máximo de comunicaciones a consultar
])

/** Único código genuinamente ambiguo: puede ser una avería pasajera del lado de ellos. */
const CODIGOS_REINTENTABLES = new Set([
  10999, // error no controlado
])

export function clasificarCodigo(codigo: number): ClaseFallo {
  if (codigo === 0) return 'ok'
  if (CODIGOS_DATOS.has(codigo)) return 'datos'
  if (CODIGOS_CONFIGURACION.has(codigo)) return 'configuracion'
  if (CODIGOS_LIMITE.has(codigo)) return 'limite'
  if (CODIGOS_REINTENTABLES.has(codigo)) return 'transporte'
  return 'desconocido'
}

function extraer(cuerpo: string, etiqueta: string): string | null {
  // Las respuestas traen el prefijo de namespace de forma inconsistente, así que se acepta
  // cualquiera (`<ns2:codigo>` y `<codigo>` valen igual).
  const m = cuerpo.match(new RegExp(`<(?:\\w+:)?${etiqueta}>\\s*([^<]*?)\\s*</(?:\\w+:)?${etiqueta}>`, 'i'))
  return m ? m[1] : null
}

function extraerTodos(cuerpo: string, etiqueta: string): string[] {
  const re = new RegExp(`<(?:\\w+:)?${etiqueta}>\\s*([^<]*?)\\s*</(?:\\w+:)?${etiqueta}>`, 'gi')
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(cuerpo)) !== null) out.push(m[1])
  return out
}

/**
 * Interpreta una respuesta HTTP de SES.
 *
 * `status` 0 (o cualquier fallo antes de tener respuesta) se pasa como transporte desde
 * `enviar`, que es quien conoce la excepción de red.
 */
export function leerRespuesta(status: number, cuerpo: string): RespuestaSes {
  const corte = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, 300)

  // 401/403 no traen cuerpo SOAP: son la puerta, no el contenido.
  if (status === 401) {
    return {
      ok: false, clase: 'configuracion', codigo: null, descripcion: null, lotes: [],
      detalle: 'HTTP 401: usuario o contraseña del servicio web rechazados',
    }
  }
  if (status === 403) {
    return {
      ok: false, clase: 'configuracion', codigo: null, descripcion: null, lotes: [],
      detalle: 'HTTP 403: el endpoint rechaza la conexión',
    }
  }
  // 🚨 5xx = el Ministerio. Es el caso que NO hay que confundir con un parte mal formado: el
  // entorno de pruebas `pre-ses` llevaba devolviendo 502 a todo el 20/08/2026, con credenciales
  // válidas y sin ellas.
  if (status >= 500) {
    return {
      ok: false, clase: 'transporte', codigo: null, descripcion: null, lotes: [],
      detalle: `HTTP ${status} del servicio de SES: ${corte(cuerpo) || 'sin cuerpo'}`,
    }
  }

  const codigoTxt = extraer(cuerpo, 'codigo') ?? extraer(cuerpo, 'codigoRetorno')
  const descripcion = extraer(cuerpo, 'descripcion')
  const lotes = extraerTodos(cuerpo, 'lote')

  if (codigoTxt === null || !/^\d+$/.test(codigoTxt)) {
    // Un 200 sin código legible no es una pasada buena: es una respuesta que no sabemos leer.
    // Se marca como desconocido con el cuerpo crudo, para no inventarnos un veredicto.
    return {
      ok: false, clase: 'desconocido', codigo: null, descripcion, lotes,
      detalle: `HTTP ${status} sin codigoRetorno legible: ${corte(cuerpo) || 'sin cuerpo'}`,
    }
  }

  const codigo = Number(codigoTxt)
  const clase = clasificarCodigo(codigo)
  return {
    ok: clase === 'ok',
    clase,
    codigo,
    descripcion,
    lotes,
    detalle: `HTTP ${status} · codigo ${codigo}${descripcion ? ` · ${corte(descripcion)}` : ''}`,
  }
}
