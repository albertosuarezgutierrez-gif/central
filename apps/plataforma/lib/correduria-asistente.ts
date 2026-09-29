// Asistente de la CORREDURÍA por Telegram (fase 1, 26/09/2026) — parte PURA (sin `@/` ni prisma →
// node --test). Alberto le pregunta por clientes, pólizas, vencimientos o impagados y el asistente
// contesta leyendo la cartera por el puerto de asegura. Solo habla con Alberto. Lo que escribe en la
// cartera (emitir, corregir la ficha, abrir una oportunidad) lo PROPONE y lo aplica Alberto con un botón.
//
// Tres reglas de la casa que viven aquí y no en el prompt, porque un prompt se puede saltar:
// - Lo que NO trae una herramienta es «no consta», nunca «no tiene» (dato no mirado ≠ dato que no hay).
// - DNI/NIE, IBAN y tarjetas salen ENMASCARADOS hacia Telegram y hacia la IA.
// - Lo que aprende son PREFERENCIAS de trabajo; los datos de un cliente van a la cartera, no a su memoria.

// ── ¿Es un mensaje para la correduría? ───────────────────────────────────────────────────────────

/** Atajo explícito: `seguro: …`, `seguros …`, `/seguros …`, `correduría: …`. Siempre gana. */
const PREFIJO = /^\s*(?:\/seguros?\b|seguros?\s*[:,]|correduri[aá]\s*[:,])/i

/** Palabras que solo tienen sentido en la correduría (el contable no las maneja). */
const PROPIAS = /\b(p[oó]lizas?|siniestros?|renovaci(?:[oó]n|ones)|tomador(?:es)?|asegurad[oa]s?|retarific\w*|codeoscopic|avant2|cima|eiac|tirea|coberturas?|franquicia|carta verde|anulaci[oó]n(?:es)? de p[oó]liza|oportunidad(?:es)?|leads?)\b/i

/** Palabras de la correduría que TAMBIÉN usa el contable (un recibo de Mapfre puede ser un gasto propio):
 *  solo deciden si no hay ninguna palabra contable. */
const PROPIAS_SUAVES = /\b(impagad\w*|recibos? devuelt\w*|vencimientos?|le he llamado|he llamado a|no (?:me )?(?:lo )?coge|no contesta|no le interesa|que le llame|vuelva a llamar|volver a llamar|quiere precio|mapfre|allianz|occident|reale|generali|axa|l[ií]nea directa|mutua madrile\w+|pelayo|liberty|zurich|santa ?luc[ií]a|helvetia|fiatc|asisa|sanitas|adeslas|dkv|fidelidade)\b/i

/** Matrícula española moderna (1234ABC / 1234 ABC). Un gasto no se pregunta por matrícula. */
const MATRICULA = /\b\d{4}\s?[B-DF-HJ-NP-TV-Z]{3}\b/i

/** Pedir precio de un seguro (28/09/2026): «presupuesto», «precio» o «cotiza» junto a moto/coche/seguro. Sin
 *  esto, «presupuesto» (palabra contable) mandaba «presupuesto de la moto de Pablo» al contable. */
const PIDE_PRECIO = /\b(presupuest\w*|precios?|cotiz\w*|tarific\w*)\b/i
const GASTO_PROPIO = /\b(factura\w*|pagad\w*|pagu[eé]|cargo\w*|recibo\w*)\b/i
const OBJETO_SEGURO = /\b(motos?|coches?|seguros?|veh[ií]culos?|furgonetas?|turismos?|scooter)\b/i
/** «Presupuesto de la moto / del coche / del seguro…»: de la correduría aunque «presupuesto» sea contable. */
const PRESUPUESTO_SEGURO = /\bpresupuestos?\s+(?:de[l]?\s+|para\s+)?(?:la\s+|el\s+|su\s+)?(?:moto|coche|auto|veh[ií]culo|hogar|casa|seguro|p[oó]liza)\b/i

/** Palabras del mundo contable: si aparecen y ninguna propia, el mensaje es del contable. */
const CONTABLES = /\b(gast[oéa]\w*|factura\w*|ingres\w*|movimient\w*|cargo\w*|banco|kutxa|bbva|irpf|hacienda|iva|modelo \d{3}|tarjeta|n[oó]mina|luz|agua|internet|netflix|pisos?|reservas?|booking|airbnb|hu[eé]sped\w*|amortiz\w*|deducci\w*|presupuesto|saldo)\b/i

export type Destino = 'correduria' | 'contable' | 'dudoso'

/**
 * Reparto del texto libre entre el asistente de la correduría y el contable. Determinista y
 * testeado; solo lo `dudoso` (p. ej. «¿qué tiene Pablo Guzmán?») pasa por la IA clasificadora.
 */
export function clasificarDestino(texto: string): Destino {
  const t = texto.trim()
  if (!t) return 'contable'
  if (PREFIJO.test(t)) return 'correduria'
  if (PROPIAS.test(t)) return 'correduria'
  // Un gasto propio («factura del seguro del coche, precio 320€») sigue siendo del contable.
  if (PIDE_PRECIO.test(t) && OBJETO_SEGURO.test(t) && !GASTO_PROPIO.test(t)) return 'correduria'
  // «Presupuesto» es también del contable; con matrícula o un ramo de seguro al lado es de la correduría.
  if (PRESUPUESTO_SEGURO.test(t) || (/\bpresupuestos?\b/i.test(t) && MATRICULA.test(t) && !/\bkwh\b/i.test(t))) return 'correduria'
  // Lo contable ANTES que la matrícula: «1500 kWh» o «2000 BTC» parecen una matrícula y no lo son.
  if (CONTABLES.test(t)) return 'contable'
  if (PROPIAS_SUAVES.test(t)) return 'correduria'
  if (MATRICULA.test(t)) return 'correduria'
  return 'dudoso'
}

/** ¿Lleva el atajo explícito? Con el asistente apagado, así se sabe a quién decirle que lo está. */
export function tienePrefijo(texto: string): boolean {
  return PREFIJO.test(texto)
}

/** La pregunta sin el atajo delante. */
export function sinPrefijo(texto: string): string {
  return texto.trim().replace(PREFIJO, '').trim()
}

/** Prompt de la IA clasificadora: una palabra. Ante cualquier otra cosa, el contable (lo de siempre). */
export const SYSTEM_CLASIFICADOR = [
  'Clasifica el mensaje de Alberto en UNA palabra:',
  '- correduria: pregunta por un cliente, una persona, una póliza, un seguro, un vehículo o algo de su correduría de seguros.',
  '- contable: dinero propio, gastos, ingresos, bancos, impuestos, facturas o sus pisos turísticos.',
  'Responde solo «correduria» o «contable».',
].join('\n')

export function leerClasificacion(respuesta: string | null | undefined): 'correduria' | 'contable' {
  return /corredur[ií]/i.test(respuesta ?? '') ? 'correduria' : 'contable'
}

// ── Enmascarado ──────────────────────────────────────────────────────────────────────────────────

/**
 * DNI/NIE → `…769Q`, IBAN → `ES…1234`, tarjeta → `…1234`. Se aplica a TODO lo que sale de una
 * herramienta antes de que lo vea la IA, y otra vez a la respuesta antes de Telegram (por si la
 * IA reconstruyera algo). El CIF de una empresa se deja: no es dato personal y sirve para buscar.
 */
export function enmascarar(texto: string): string {
  return texto
    .replace(/\b[A-Z]{2}\d{2}(?:[ -]?[A-Z0-9]{4}){4,7}(?:[ -]?[A-Z0-9]{1,3})?\b/g, (m) => {
      const limpio = m.replace(/[ -]/g, '')
      return `${limpio.slice(0, 2)}…${limpio.slice(-4)}`
    })
    // Solo si pasa el dígito de control (Luhn): un nº de póliza de 16 cifras no es una tarjeta.
    .replace(/\b(?:\d{4}[ -]?){3}\d{4}\b/g, (m) => {
      const d = m.replace(/[ -]/g, '')
      return luhn(d) ? `…${d.slice(-4)}` : m
    })
    .replace(/\b[XYZ]\d{7}[A-Z]\b/gi, (m) => `…${m.slice(-4)}`)
    .replace(/\b\d{8}[A-Z]\b/gi, (m) => `…${m.slice(-4)}`)
}

function luhn(digitos: string): boolean {
  let suma = 0
  for (let i = 0; i < digitos.length; i++) {
    let n = Number(digitos[digitos.length - 1 - i])
    if (i % 2 === 1) { n *= 2; if (n > 9) n -= 9 }
    suma += n
  }
  return suma % 10 === 0
}

/**
 * JSON compacto, enmascarado y recortado para la IA. Los `null` SE QUEDAN: son «no consta», y
 * quitarlos haría que un campo desconocido desapareciera. El corte se DICE.
 */
export function paraIA(valor: unknown, max = 7000): string {
  let s: string
  try { s = JSON.stringify(valor) ?? 'null' } catch { s = String(valor) }
  s = enmascarar(s)
  return s.length > max ? `${s.slice(0, max)}… [RECORTADO: hay más datos que no caben; dilo si importa]` : s
}

// ── Herramientas ─────────────────────────────────────────────────────────────────────────────────

export type NombreHerramienta =
  | 'buscar' | 'ficha_cliente' | 'ficha_poliza' | 'vencimientos' | 'impagados'
  | 'anulaciones_pendientes' | 'proponer_regla' | 'listar_reglas' | 'olvidar_regla' | 'preparar_emision'
  | 'proponer_correccion' | 'proponer_oportunidad' | 'mi_dia' | 'oportunidades_cliente'
  | 'proponer_tarea' | 'registrar_llamada' | 'anotar_nota' | 'abrir_siniestro' | 'invitar_portal' | 'enviar_presupuesto'
  | 'vehiculo_catalogo' | 'proponer_tarificacion'

const fn = (name: NombreHerramienta, description: string, properties: Record<string, unknown> = {}, required: string[] = []) => ({
  type: 'function',
  function: { name, description, parameters: { type: 'object', properties, required } },
})

export const HERRAMIENTAS = [
  fn('buscar', 'Busca en la cartera por nombre, DNI, teléfono, email, matrícula, número de póliza o dirección. Devuelve clientes con su clienteId. Úsala SIEMPRE antes de ficha_cliente si no tienes el id.',
    { q: { type: 'string', description: 'Término a buscar' } }, ['q']),
  fn('ficha_cliente', 'Ficha completa de un cliente: datos, pólizas (con su polizaId interno), siniestros, contactos y relaciones. Sus oportunidades y tareas NO vienen aquí: usa oportunidades_cliente.',
    { clienteId: { type: 'string' } }, ['clienteId']),
  fn('ficha_poliza', 'Ficha de una póliza: coberturas, recibos, siniestros e historial.',
    { polizaId: { type: 'string' } }, ['polizaId']),
  fn('vencimientos', 'Pólizas que vencen en los próximos N días (máx. 120).',
    { dias: { type: 'integer', description: 'Días hacia delante (1-120)' } }, ['dias']),
  fn('mi_dia', 'Lo que Alberto tiene que hacer HOY en la correduría: tareas de sus oportunidades (vencidas y de hoy), llamadas de renovación que tocan y siniestros abiertos. Úsala para «¿qué tengo hoy?», «¿a quién llamo?», «¿qué hay pendiente?».'),
  fn('oportunidades_cliente', 'Oportunidades de venta (leads) de un cliente: ramo, estado, compañía y prima actuales, vencimiento y su próximo paso.',
    { clienteId: { type: 'string' } }, ['clienteId']),
  fn('impagados', 'Recibos sin cobrar y pólizas en riesgo (cola de retención), con resumen.'),
  fn('anulaciones_pendientes', 'Pólizas sustituidas por otra de otra compañía cuya anulación sigue pendiente.'),
  fn('proponer_regla', 'Propón guardar una PREFERENCIA de trabajo de Alberto (cómo quiere las respuestas o un criterio del negocio). NUNCA datos de un cliente concreto. Alberto la confirma con un botón.',
    { regla: { type: 'string', description: 'La regla, en una frase' } }, ['regla']),
  fn('listar_reglas', 'Lista las reglas que ya has aprendido, con su número.'),
  fn('olvidar_regla', 'Olvida una regla aprendida por su número.',
    { numero: { type: 'integer' } }, ['numero']),
  fn('preparar_emision', 'Prepara la EMISIÓN de un precio que Alberto ya confirmó en la web de Avant2 para una póliza de la cartera. NO emite: el sistema le manda a Alberto un resumen con un botón y es él quien pulsa. Si el proyecto tiene varios precios emitibles te devuelve la lista para que le preguntes cuál (y vuelves a llamar con quoteId).',
    {
      polizaId: { type: 'string', description: 'El polizaId INTERNO (uuid) de la póliza que se sustituye, sacado de ficha_cliente. NO el número de póliza de la compañía.' },
      projectId: { type: 'string', description: 'Número del proyecto de Avant2 (solo cifras)' },
      quoteId: { type: 'string', description: 'Opcional: el precio elegido (Q…) cuando hay varios' },
    }, ['polizaId', 'projectId']),
  fn('proponer_correccion', 'Propón CORREGIR la ficha de un cliente con los valores que Alberto te ha DICTADO en esta conversación (dirección, código postal, ciudad, provincia, nombre o apellidos). NO escribe: el sistema le manda el cambio con un botón y es él quien lo aplica. Pasa solo los campos que cambian, tal cual los dijo; nunca inventes ni completes un valor.',
    {
      clienteId: { type: 'string', description: 'La ficha a corregir (sácala de buscar o ficha_cliente)' },
      direccion: { type: 'string', description: 'Calle, número, piso y puerta' },
      codigoPostal: { type: 'string' },
      ciudad: { type: 'string' },
      provincia: { type: 'string' },
      nombre: { type: 'string', description: 'Solo si Alberto corrige el nombre (exige DNI archivado en la ficha)' },
      apellidos: { type: 'string', description: 'Solo si Alberto corrige los apellidos (exige DNI archivado en la ficha)' },
    }, ['clienteId']),
  fn('proponer_oportunidad', 'Propón ABRIR una oportunidad de venta (lead) para un cliente o lead de la cartera: p. ej. Alberto sube la póliza que tiene con otra compañía y dice «añádelo a oportunidades». NO escribe: el sistema le manda el resumen con un botón y es él quien la abre. Con usarDocumentos=true lee los documentos que Alberto ha subido al chat en la última hora (ramo, compañía, vencimiento, prima, nº de póliza). Lo que Alberto dicte manda sobre lo leído; nunca inventes un valor.',
    {
      clienteId: { type: 'string', description: 'La ficha (sácala de buscar). NO lo pases si Alberto ha subido el documento y no dice de quién es: con usarDocumentos=true lo busco por el tomador.' },
      usarDocumentos: { type: 'boolean', description: 'true si Alberto se refiere a lo que acaba de subir' },
      ramo: { type: 'string', enum: ['auto', 'moto', 'hogar', 'vida', 'salud', 'decesos', 'responsabilidad_civil', 'comercio', 'comunidades', 'accidentes', 'otros'] },
      compania: { type: 'string', description: 'Compañía con la que está ahora' },
      prima: { type: 'number', description: 'Prima anual actual en euros' },
      vence: { type: 'string', description: 'Vencimiento de su póliza actual (aaaa-mm-dd)' },
      numeroPoliza: { type: 'string' },
      fechaPrimerPaso: { type: 'string', description: 'Solo si Alberto dice cuándo llamarle (aaaa-mm-dd)' },
      leadNuevo: { type: 'boolean', description: 'SOLO si el sistema te enseñó fichas con ese nombre y Alberto ha dicho que no es ninguna de ellas' },
    }, []),
  fn('proponer_tarea', 'Propón una TAREA de seguimiento en una oportunidad («llama a Juan el jueves», «mándale la comparativa el lunes»). Las tareas cuelgan de una oportunidad: sácala de oportunidades_cliente; si no tiene ninguna, propón primero abrir una. Alberto la crea con un botón.',
    {
      oportunidadId: { type: 'string', description: 'uuid de la oportunidad (de oportunidades_cliente)' },
      tipo: { type: 'string', enum: ['llamada', 'tarea', 'email', 'whatsapp'] },
      fecha: { type: 'string', description: 'aaaa-mm-dd; calcula la fecha real a partir de «el jueves», «mañana»… con la fecha de hoy' },
      observaciones: { type: 'string', description: 'Qué hay que hacer, en una frase' },
    }, ['oportunidadId', 'fecha', 'observaciones']),
  fn('registrar_llamada', 'Registra el RESULTADO de una llamada a un lead/cliente sobre una oportunidad. El sistema pone solo el siguiente paso (quiere_precio → tarea de preparar precio; otro_dia → nueva llamada; no_contesta → reintento; no_interesa → se aparca). Alberto lo confirma con un botón.',
    {
      oportunidadId: { type: 'string' },
      resultado: { type: 'string', enum: ['quiere_precio', 'otro_dia', 'no_contesta', 'no_interesa'] },
      volverEl: { type: 'string', description: 'Solo con otro_dia: aaaa-mm-dd' },
      motivo: { type: 'string', enum: ['precio', 'competidor', 'coberturas', 'cliente_desiste', 'sin_respuesta', 'no_contactable', 'ya_asegurado', 'otro'], description: 'Solo con no_interesa' },
      nota: { type: 'string' },
    }, ['oportunidadId', 'resultado']),
  fn('anotar_nota', 'Anota una NOTA en el historial de la ficha de un cliente (lo que Alberto te dicte: «me ha dicho que se casa en junio», «prefiere que le escriban por la tarde»). Alberto la confirma con un botón.',
    {
      clienteId: { type: 'string' },
      texto: { type: 'string' },
      tipoNota: { type: 'string', enum: ['nota', 'contacto', 'gestion'], description: 'contacto = habló con el cliente; gestion = hizo algo por él; nota = lo demás' },
    }, ['clienteId', 'texto']),
  fn('abrir_siniestro', 'Propón ABRIR un siniestro (parte) en una póliza viva del cliente. Necesitas: póliza (polizaId de ficha_cliente), tipo, cuándo pasó y qué pasó; si falta algo, pregúntalo. Alberto lo abre con un botón. Abrirlo aquí NO lo comunica a la compañía.',
    {
      polizaId: { type: 'string' },
      tipo: { type: 'string', enum: ['colision', 'lunas', 'robo_vehiculo', 'danos_propios', 'asistencia_viaje', 'danos_agua', 'incendio', 'robo_hogar', 'rotura_cristales', 'electrico', 'fenomenos', 'rc', 'defensa_juridica', 'salud', 'fallecimiento', 'otro'] },
      fechaHora: { type: 'string', description: 'aaaa-mm-dd o aaaa-mm-dd hh:mm' },
      descripcion: { type: 'string' },
      lugarCiudad: { type: 'string' },
      seConsideraCulpable: { type: 'boolean' },
    }, ['polizaId', 'tipo', 'fechaHora', 'descripcion']),
  fn('invitar_portal', 'Propón mandar al cliente el correo con el enlace a su portal (ve sus seguros, recibos y partes). Primero se comprueba si puede entrar (correo en la ficha, que no sea ambiguo). Alberto lo manda con un botón: ES UN CORREO AL CLIENTE, no lo propongas sin que Alberto lo pida.',
    { clienteId: { type: 'string' } }, ['clienteId']),
  fn('vehiculo_catalogo', 'Catálogo de vehículos de Codeoscopic (GRATIS). Úsalo para encontrar marca, modelo, combustible y versión antes de proponer_tarificacion. Coche: marcas → modelos(marcaId) → motores → versiones(marcaId, modeloId, motor). Moto: los mismos con -moto (motores-moto es fijo: Gasolina, Diésel, Otros). Con filtro devuelve solo lo que casa con lo que dijo Alberto.',
    {
      tipo: { type: 'string', enum: ['marcas', 'modelos', 'motores', 'versiones', 'marcas-moto', 'modelos-moto', 'motores-moto', 'versiones-moto'] },
      marcaId: { type: 'string' }, modeloId: { type: 'string' }, motor: { type: 'string', description: 'id del combustible (de motores)' },
      filtro: { type: 'string', description: 'Lo que dijo Alberto («ibiza», «1.5 tsi»), para acotar' },
    }, ['tipo']),
  fn('proponer_tarificacion', 'Propón PEDIR PRECIO de COCHE (ramo auto) o MOTO para un cliente o lead de la cartera, con lo que Alberto te ha DICTADO. NO pide nada: el servidor resuelve cada dato contra los catálogos, y si falta algo te devuelve «FALTAN DATOS» con la lista (pregúntaselo a Alberto y vuelve a llamar con TODO lo anterior más lo nuevo). Cuando esté completo, Alberto recibe el resumen con el botón «Pedir precio (0,50€)». Pasa marca/modelo/versión/combustible como ids de vehiculo_catalogo o tal cual los dijo. Si YA se pidió precio antes para ese cliente y ramo (p. ej. para corregir un dato), NO preguntes el vehículo: llámala sin marca/modelo/versión y se reutiliza el de la última petición (misma matrícula). Nunca inventes un dato personal ni el historial.',
    {
      ramo: { type: 'string', enum: ['auto', 'moto'] },
      clienteId: { type: 'string', description: 'La ficha (de buscar). Si es un lead nuevo, primero hay que abrirle ficha en la intranet.' },
      marca: { type: 'string' }, modelo: { type: 'string' }, motor: { type: 'string', description: 'Combustible' }, version: { type: 'string' },
      matricula: { type: 'string' },
      kmAnuales: { type: 'integer', description: 'Km al año, solo si Alberto los dice (si no, se supone la media)' },
      fechaMatriculacion: { type: 'string', description: 'Solo si Alberto la dice; si no, se saca de la matrícula' },
      garaje: { type: 'string', description: 'Solo si Alberto lo dice (si no, se supone vía pública)' },
      estadoCivil: { type: 'string', description: 'Solo si la ficha no lo trae o Alberto lo dice' },
      municipio: { type: 'string', description: 'Municipio donde circula, si el sistema pregunta cuál' },
      dni: { type: 'string' }, nombre: { type: 'string' }, apellido1: { type: 'string' }, apellido2: { type: 'string' },
      sexo: { type: 'string', enum: ['hombre', 'mujer'] },
      fechaNacimiento: { type: 'string', description: 'dd/mm/aaaa' }, fechaCarnet: { type: 'string', description: 'dd/mm/aaaa' },
      telefono: { type: 'string', description: 'Móvil' },
      companiaAnterior: { type: 'string', description: 'Seguro ACTUAL: compañía. Con él van TODOS: polizaAnterior, aniosAsegurado, aniosEnCompania, aniosSinSiniestros' },
      polizaAnterior: { type: 'string' },
      aniosAsegurado: { type: 'integer' }, aniosEnCompania: { type: 'integer' }, aniosSinSiniestros: { type: 'integer' },
      siniestrosUltimos5: { type: 'integer', description: 'Solo si Alberto lo dice' },
      primaActual: { type: 'number', description: 'Lo que paga hoy al año, si lo dice (para comparar)' },
    }, ['ramo', 'clienteId']),
  fn('enviar_presupuesto', 'Rescata la ÚLTIMA tarificación ya pagada de un cliente SIN póliza (oportunidad nueva) para ese ramo, prepara el presupuesto y le manda el correo para que elija la opción en su portal. Necesitas sus exigencias y necesidades (qué quiere asegurar y qué le importa): si Alberto no las ha dicho, PREGÚNTASELAS, nunca las inventes. Alberto lo manda con un botón: ES UN CORREO AL CLIENTE. Si el cliente avisó desde el portal de que un dato está mal (garaje, km, conductor…), NO la uses para reenviar: esos precios no valen; pide precio otra vez con proponer_tarificacion y el dato corregido, y solo después enviar_presupuesto.',
    {
      clienteId: { type: 'string', description: 'La ficha (sácala de buscar; la matrícula también sirve para buscar)' },
      ramo: { type: 'string', enum: ['auto', 'moto', 'hogar', 'decesos', 'salud', 'vida'] },
      necesidades: { type: 'string', description: 'Exigencias y necesidades del cliente, tal como las dijo Alberto' },
    }, ['clienteId', 'ramo', 'necesidades']),
] as const

/** Argumentos de una llamada, parseados sin lanzar. `null` = la IA mandó basura. */
export function leerArgumentos(raw: string | undefined): Record<string, unknown> | null {
  if (!raw) return {}
  try {
    const v = JSON.parse(raw)
    return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null
  } catch { return null }
}

export function diasValidos(v: unknown): number {
  const n = Math.round(Number(v))
  return Number.isFinite(n) ? Math.min(120, Math.max(1, n)) : 30
}

/** Id de cliente/póliza: uuid. Evita que la IA meta una ruta o un nombre en la URL del puerto. */
export const ERROR_NO_UUID = 'ERROR: eso no es un id interno. Parece un número de póliza o un nombre: usa buscar/ficha_cliente y pasa el polizaId/clienteId (uuid) que devuelven.'

export function idValido(v: unknown): string | null {
  const s = typeof v === 'string' ? v.trim() : ''
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s) ? s.toLowerCase() : null
}

/** Una regla que es en realidad un dato de cliente (DNI, teléfono, IBAN, email, matrícula) no se guarda. */
export function reglaConDatoPersonal(regla: string): boolean {
  return /\b\d{8}[A-Z]\b|\b[XYZ]\d{7}[A-Z]\b|\b[A-Z]{2}\d{2}\s?\d{4}|[\w.+-]+@[\w-]+\.[\w.]+|\b[6-9]\d{2}\s?\d{3}\s?\d{3}\b/i.test(regla)
    || MATRICULA.test(regla)
}

// ── Prompt ───────────────────────────────────────────────────────────────────────────────────────

export function systemAsistente(reglas: readonly string[], hoyIso: string): string {
  const l = [
    'Eres el asistente de la correduría de seguros de Alberto (Grupo ASegura). Hablas SOLO con Alberto, por Telegram.',
    `Hoy es ${hoyIso}.`,
    'Reglas ESTRICTAS:',
    '- Responde SOLO con lo que devuelvan las herramientas. Si un dato no aparece, di «no consta» o «no lo tengo»; NUNCA digas que no existe, NUNCA lo inventes ni lo estimes.',
    '- Si una herramienta falla o devuelve error, dilo: «no he podido leer X ahora mismo». Un fallo NO es «no hay nada».',
    '- Un campo a null significa «no consta / no se sabe», nunca 0 ni «no tiene». Si una lista trae `total` mayor que las filas que ves, di que hay más.',
    '- Si una búsqueda da varios clientes posibles, enuméralos y pregunta cuál; no elijas tú.',
    '- Para «¿qué tengo hoy?», «¿a quién llamo?» o «¿qué hay pendiente?» usa mi_dia. Las oportunidades de un cliente, con oportunidades_cliente.',
    '- La búsqueda por DNI, teléfono o email solo alcanza a una parte de las fichas (lo dice cada bloque): si no aparece, di que no lo encuentras por ese dato y prueba por nombre o matrícula; NUNCA digas que no es cliente.',
    '- Tú no mandas mensajes a clientes ni anulas pólizas: eso se hace en la intranet (/correduria). Lo único que puedes tocar de la cartera es PROPONER una corrección de la ficha con proponer_correccion (dirección, CP, ciudad, provincia, nombre o apellidos), solo con valores que Alberto te haya dicho, o abrir una oportunidad (abajo); él lo aplica con el botón. NUNCA digas que la ficha está corregida antes de que lo confirme el sistema. DNI, fecha de nacimiento, teléfonos, emails e IBAN se cambian en la ficha.',
    '- Oportunidades: puedes PROPONER abrir una con proponer_oportunidad (lead o cliente que tiene un seguro con otra compañía). Si Alberto habla de un documento que acaba de subir, pasa usarDocumentos=true. Si ha subido el documento y NO dice de quién es, NO le preguntes el nombre: llama SIN clienteId y con usarDocumentos=true; el sistema lee el tomador, lo busca por su DNI y, si no está en la cartera, le propone crear el lead y abrir la oportunidad con un solo botón. Pregúntale solo si el sistema te lo pide (varias fichas, documento sin DNI o sin tomador). Tú sabes más que él de ese documento: si hay uno reciente y pide una oportunidad —también «otra», «la segunda», «del mismo cliente», «abre oportunidad» a secas— pasa usarDocumentos=true y NO le preguntes ramo, compañía, prima, vencimiento ni si es otro seguro: lo lee el sistema del documento y decide solo si es el mismo seguro que una que ya tenga (por nº de póliza, matrícula y compañía). Si el sistema contesta YA ES NUESTRA, díselo con el enlace: esa póliza ya la llevamos y no se abre nada. NUNCA digas que está abierta ni que el lead está creado: eso solo lo confirma el sistema tras el botón.',
    '- Acciones del día a día (todas con botón que pulsa Alberto): proponer_tarea, registrar_llamada, anotar_nota, abrir_siniestro, invitar_portal, enviar_presupuesto («rescata/mándale el presupuesto de la moto»). Úsalas cuando Alberto te lo pida («apunta que…», «llámale el jueves», «ha tenido un golpe con el coche…»). Las fechas relativas («el jueves», «mañana») conviértelas tú a aaaa-mm-dd con la fecha de hoy. NUNCA digas que está hecho: eso lo confirma el sistema tras el botón.',
    '- Pedir precio de COCHE o MOTO: busca al cliente PRIMERO. Si buscar no lo encuentra (lead nuevo, sin ficha), NO consultes el catálogo ni nada más: dile a Alberto que no tiene ficha y que sin ficha no se puede pedir precio desde aquí; que la cree en /correduria/cliente/nuevo (o te mande un documento suyo con el DNI) y te vuelva a escribir; y dile ya qué datos le faltan de los que dictó (nombre y apellidos, sexo, teléfono…). Con ficha: usa vehiculo_catalogo para el vehículo (con filtro; nunca repitas una consulta con los mismos datos; si la versión exacta no sale, pásala tal cual la dijo) y llama a proponer_tarificacion con lo que Alberto dijo. Si contesta FALTAN DATOS, pregúntale a Alberto exactamente eso y vuelve a llamar con todo. El botón cuesta 0,50€ y lo pulsa él; el precio le llega solo a él (nada sale al cliente). NUNCA digas que ya has pedido el precio.',
    '- Emitir: solo puedes PREPARAR una emisión con preparar_emision (necesitas la póliza y el número del proyecto de Avant2; pídeselos si faltan). El sistema le manda a Alberto el resumen con el botón y es él quien emite. NUNCA digas que una póliza está emitida: eso solo lo confirma el sistema tras el botón.',
    '- Los DNI, IBAN y tarjetas llegan enmascarados; no intentes reconstruirlos.',
    '- Aprende PREFERENCIAS: cuando Alberto te corrija o te diga cómo quiere algo «siempre», usa proponer_regla. Los datos de un cliente (teléfono, email, dirección…) NO son reglas: dile que los cambie en la ficha.',
    '- Estilo: español, breve (es un chat de móvil), sin markdown ni tablas. Importes en formato español (2.162,49€). Fechas dd/mm/aaaa.',
  ]
  if (reglas.length) {
    l.push('', 'Preferencias que Alberto te ha enseñado (cúmplelas):')
    reglas.forEach((r, i) => l.push(`${i + 1}. ${r}`))
  }
  return l.join('\n')
}

// ── Límites ──────────────────────────────────────────────────────────────────────────────────────

/** Vueltas máximas del bucle herramienta→IA por pregunta. Una pregunta normal usa 2-3. */
export const MAX_VUELTAS = 7
/** Preguntas máximas al día: tope duro contra un bucle o un reenvío masivo, aparte del tope en €. */
export const MAX_TURNOS_DIA = 150
/** Días que se guarda el TEXTO de preguntas y respuestas; después queda solo el rastro de acceso. */
export const DIAS_RETENCION_TEXTO = 90

/** ¿El interruptor de apagado está echado? Cualquier valor «sí» en `CORREDURIA_ASISTENTE_APAGADO`. */
export function apagado(valor: string | undefined): boolean {
  return /^(1|true|s[ií]|on|apagado)$/i.test((valor ?? '').trim())
}

/** Texto del botón de feedback y del force_reply que liga la nota con su turno. */
export function preguntaNota(turnoId: number): string {
  return `👎 ¿Qué ha fallado? Respóndeme a este mensaje y lo apunto — asistente seguros · turno ${turnoId}`
}

export function turnoDeNota(textoCitado: string): number | null {
  const m = textoCitado.match(/asistente seguros · turno (\d+)/)
  return m ? Number(m[1]) : null
}

/**
 * Lo que queda en el rastro de acceso de cada consulta. Los ids y los días se guardan; el TEXTO
 * libre (lo que se buscó, la regla propuesta) no, porque sobreviviría a la purga de 90 días con el
 * mismo dato personal que la pregunta borrada.
 */
export function rastroArgs(nombre: string, args: Record<string, unknown> | null): Record<string, unknown> {
  if (!args) return {}
  if (nombre === 'buscar') return { q: '[búsqueda]' }
  if (nombre === 'proponer_regla') return { regla: '[texto]' }
  if (nombre === 'proponer_correccion') {
    // Qué campos se tocaron, nunca sus valores: una dirección o un apellido son datos personales.
    return { clienteId: args.clienteId, campos: Object.keys(args).filter((k) => k !== 'clienteId') }
  }
  // Texto de una nota o de un parte: dato personal del cliente, no va al rastro que sobrevive a la purga.
  if (nombre === 'anotar_nota') return { clienteId: args.clienteId, tipoNota: args.tipoNota ?? 'nota', texto: '[texto]' }
  if (nombre === 'abrir_siniestro') return { polizaId: args.polizaId, tipo: args.tipo, descripcion: '[texto]' }
  if (nombre === 'proponer_tarea' || nombre === 'registrar_llamada') {
    return { oportunidadId: args.oportunidadId, tipo: args.tipo, resultado: args.resultado, fecha: args.fecha ?? args.volverEl }
  }
  if (nombre === 'proponer_tarificacion') {
    // DNI, teléfono, fechas y matrícula son datos personales: al rastro solo van el cliente, el ramo y QUÉ se dijo.
    return { clienteId: args.clienteId, ramo: args.ramo, campos: Object.keys(args).filter((k) => k !== 'clienteId' && k !== 'ramo') }
  }
  if (nombre === 'vehiculo_catalogo') return { tipo: args.tipo, marcaId: args.marcaId, modeloId: args.modeloId, motor: args.motor }
  if (nombre === 'proponer_oportunidad') {
    // El ramo y si usó documentos, sí; compañía, prima o nº de póliza, no (son del contrato de un tercero).
    return { clienteId: args.clienteId, ramo: args.ramo, usarDocumentos: args.usarDocumentos === true, campos: Object.keys(args).filter((k) => k !== 'clienteId') }
  }
  const fuera: Record<string, unknown> = {}
  for (const k of ['clienteId', 'polizaId', 'dias', 'numero', 'projectId', 'quoteId']) if (k in args) fuera[k] = args[k]
  return fuera
}

/** Precio por 1.000 tokens cuando el catálogo no conoce el modelo: alto a propósito, para que el tope salte antes. */
export const PRECIO_CONSERVADOR_1K = 0.001

export function costeConservador(tokens: number): number {
  return +((Math.max(0, tokens) * PRECIO_CONSERVADOR_1K) / 1000).toFixed(6)
}

// ── Conversación ─────────────────────────────────────────────────────────────────────────────────

/**
 * ¿Es la RESPUESTA (reply) de Alberto a un mensaje de la correduría? Deslizar sobre una respuesta 🛡️
 * o sobre un aviso de seguros y escribir («¿y su mujer?») se perdía: el webhook descartaba todo reply
 * que no fuera de un flujo conocido. Solo cuenta lo que el propio bot dijo de la correduría.
 */
export function esRespuestaACorreduria(citado: string): boolean {
  const t = citado.trim()
  if (!t) return false
  // ✏️ NO: el aviso de retoque del agente de huéspedes también empieza así.
  if (/^(?:🛡️|🛡|🎯|🧾|🚀)/u.test(t)) return true
  return clasificarDestino(t) === 'correduria'
}

/** La pregunta con el mensaje al que responde, para que la IA sepa de qué se habla. */
export function conCita(texto: string, citado: string): string {
  const c = citado.trim().replace(/\s+/g, ' ').slice(0, 600)
  return c ? `${texto.trim()}\n\n(Responde a este mensaje tuyo: «${c}»)` : texto.trim()
}

type RastroGuardado = { nombre?: unknown; args?: unknown; ok?: unknown }

/**
 * Los ids que ya salieron en las consultas recientes (cliente, póliza, proyecto, precio). Sin esto,
 * cada mensaje («la Mapfre», «anual», «1») obligaba a la IA a buscar al cliente otra vez desde cero:
 * el historial guardaba el texto, no los ids. Solo los de llamadas que funcionaron, y validados.
 */
export function memoriaIds(rastros: readonly unknown[]): string | null {
  const vistos = new Map<string, Set<string>>()
  const poner = (k: string, v: unknown) => {
    const s = typeof v === 'string' ? v.trim() : ''
    const valido = k === 'projectId' ? /^\d{4,12}$/.test(s) : k === 'quoteId' ? /^Q\d{4,15}$/.test(s) : idValido(s) !== null
    if (!valido) return
    if (!vistos.has(k)) vistos.set(k, new Set())
    vistos.get(k)!.add(s)
  }
  for (const r of rastros) {
    if (!Array.isArray(r)) continue
    for (const x of r as RastroGuardado[]) {
      if (!x || x.ok !== true || typeof x.args !== 'object' || x.args === null) continue
      const a = x.args as Record<string, unknown>
      for (const k of ['clienteId', 'polizaId', 'oportunidadId', 'projectId', 'quoteId']) poner(k, a[k])
    }
  }
  if (vistos.size === 0) return null
  const partes = [...vistos].map(([k, v]) => `${k}: ${[...v].slice(-3).join(', ')}`)
  return `Ids ya consultados en esta conversación (reutilízalos en vez de volver a buscar si hablamos de lo mismo): ${partes.join(' · ')}`
}

/** La fecha de hoy en Madrid (aaaa-mm-dd). `toISOString()` da el día anterior entre las 00:00 y las 02:00. */
export function hoyMadrid(ahora: Date = new Date()): string {
  return ahora.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
}

/** Aseguradoras: si el emisor de un documento es una, puede ser un seguro de Alberto (gasto) o de un cliente. */
const ASEGURADORAS = /\b(mapfre|allianz|occident|catalana occidente|reale|generali|axa|l[ií]nea directa|mutua madrile\w+|pelayo|liberty|zurich|santa ?luc[ií]a|helvetia|fiatc|asisa|sanitas|adeslas|dkv|fidelidade|verti|qualitas|mgs|caser|segurcaixa|vidacaixa|ocaso|plus ultra|seguros bilbao|nationale nederlanden|metlife|aegon|asefa|arag|das|hiscox|chubb|aig|markel|direct seguros|genesis|regal|mutua general|lagun aro|seguros? )/i
export function esAseguradora(nombre: string | null | undefined): boolean {
  return ASEGURADORAS.test(nombre ?? '')
}

/**
 * ¿El PIE de un documento lo manda a la correduría sin pasar por el contable? Solo si lo dice sin
 * ambigüedad: el atajo («seguro: …») o que hable de un lead, cliente u oportunidad. Un pie como «recibo
 * Mapfre hogar» NO: puede ser un seguro de Alberto, y para eso el contable ya pregunta con botones.
 * Tampoco cuenta el «acabo de hablar con el asistente» ni la IA: un gasto desviado aquí no se archiva nunca.
 */
export function pieDeCorreduria(pie: string): boolean {
  const t = pie.trim()
  if (!t) return false
  return PREFIJO.test(t) || /\b(leads?|leds|oportunidad(?:es)?|cliente|clientes|p[oó]liza de (?:un|una|mi) cliente)\b/i.test(t)
}
