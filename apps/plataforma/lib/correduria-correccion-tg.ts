// Corregir la ficha de un cliente desde el asistente de la correduría por Telegram (fase 3b,
// 26/09/2026) — parte PURA (sin `@/` ni prisma → node --test). La parte con BD y red vive en
// `correduria-asistente-telegram.ts`.
//
// Mismo principio que la emisión: la IA solo PROPONE con lo que Alberto dicta; el servidor valida con
// las MISMAS reglas que la ficha (`revisarEdicion` de module-seguros), enseña el cambio y Alberto lo
// aplica con un botón de un solo uso. La escritura va por el puerto `auditado()` de asegura
// (`PATCH /api/operador/cliente`), que vuelve a validar y deja rastro en el historial.
//
// Qué se puede corregir y qué NO:
//   · dirección, código postal, ciudad y provincia — libres, como en la ficha;
//   · nombre y apellidos — identidad: solo con un DNI ARCHIVADO en la ficha que lo acredite (regla
//     de Alberto: «tendrá que solicitarlo documentado»). Asegura lo vuelve a comprobar al escribir;
//   · NADA se borra por chat: un campo vacío no es una corrección, es perder el dato;
//   · DNI, fecha de nacimiento y notas, no: eso se hace en la ficha, con el documento delante.
import { createHash } from 'node:crypto'
import {
  documentoAcredita, revisarEdicion, type CampoIdentidad, type CampoLibre, type DocumentoResumen, type EdicionCliente,
} from '@central/module-seguros'
import type { ResultadoEscritura } from './cliente-edicion-asegura.ts'
import { URL_PLATAFORMA_POR_DEFECTO } from './correduria-emision-tg.ts'

export type CampoCorreccion = Extract<CampoLibre, 'direccion' | 'codigoPostal' | 'ciudad' | 'provincia'> | Extract<CampoIdentidad, 'nombre' | 'apellidos'>

export const CAMPOS_CORRECCION: readonly CampoCorreccion[] = ['direccion', 'codigoPostal', 'ciudad', 'provincia', 'nombre', 'apellidos']
const IDENTIDAD = new Set<CampoCorreccion>(['nombre', 'apellidos'])

const ETIQUETA: Record<CampoCorreccion, string> = {
  direccion: 'Dirección', codigoPostal: 'Código postal', ciudad: 'Ciudad', provincia: 'Provincia', nombre: 'Nombre', apellidos: 'Apellidos',
}

export type Cambio = { campo: CampoCorreccion; valor: string }

export type Correccion =
  | { ok: true; cambios: Cambio[]; tocaIdentidad: boolean }
  | { ok: false; motivo: string }

/** Lo que llega de la IA → los cambios ya normalizados por las reglas de la ficha. Campos ajenos se ignoran. */
export function prepararCorreccion(args: Record<string, unknown>): Correccion {
  const edicion: EdicionCliente = {}
  for (const c of CAMPOS_CORRECCION) {
    const bruto = args[c]
    if (bruto === undefined || bruto === null) continue
    // Los modelos mandan a menudo el código postal como número: se acepta, no es un campo vacío.
    const v = typeof bruto === 'number' && Number.isFinite(bruto) ? String(bruto) : bruto
    if (typeof v !== 'string') return { ok: false, motivo: `${ETIQUETA[c]}: formato no válido` }
    if (v.trim() === '') return { ok: false, motivo: `${ETIQUETA[c]}: vacío. Por chat no se borra ningún dato; eso se hace en la ficha` }
    if (IDENTIDAD.has(c)) (edicion.identidad ??= {})[c as 'nombre' | 'apellidos'] = v
    else (edicion.libre ??= {})[c as Exclude<CampoCorreccion, 'nombre' | 'apellidos'>] = v
  }
  // Solo para validar: el documento de verdad lo elige el servidor después, y asegura lo comprueba.
  const r = revisarEdicion({ ...edicion, documentoId: edicion.identidad ? 'validando' : null })
  if (!r.ok) return { ok: false, motivo: r.motivo }
  const cambios: Cambio[] = []
  for (const c of CAMPOS_CORRECCION) {
    const v = IDENTIDAD.has(c)
      ? r.identidad[c as 'nombre' | 'apellidos']
      : r.libre[c as Exclude<CampoCorreccion, 'nombre' | 'apellidos'>]
    if (typeof v === 'string' && v !== '') cambios.push({ campo: c, valor: v })
  }
  if (cambios.length === 0) return { ok: false, motivo: 'No hay nada que cambiar' }
  return { ok: true, cambios, tocaIdentidad: cambios.some((x) => IDENTIDAD.has(x.campo)) }
}

/** El cuerpo del `PATCH /api/operador/cliente`: los mismos cambios que se enseñaron, ni uno más. */
export function edicionDeCambios(cambios: readonly Cambio[], documentoId: string | null): EdicionCliente {
  const e: EdicionCliente = {}
  for (const { campo, valor } of cambios) {
    if (IDENTIDAD.has(campo)) (e.identidad ??= {})[campo as 'nombre' | 'apellidos'] = valor
    else (e.libre ??= {})[campo as Exclude<CampoCorreccion, 'nombre' | 'apellidos'>] = valor
  }
  if (e.identidad) e.documentoId = documentoId
  return e
}

/** El DNI archivado más reciente que acredita un cambio de identidad, o `null` si no hay ninguno. */
export function documentoQueAcredita(docs: readonly DocumentoResumen[]): DocumentoResumen | null {
  return [...docs].filter(documentoAcredita).sort((a, b) => b.creado.localeCompare(a.creado))[0] ?? null
}

/**
 * Lo que la ficha tiene HOY en los campos que se pueden corregir, más con qué reconocerla. Sale de
 * `fichaAsegura` (identidad `null` = asegura no la manda → no se puede enseñar el nombre de antes).
 */
export type FichaActual = {
  nombre: string
  dniEnmascarado: string | null
  identidad: { nombre: string; apellidos: string } | null
  contacto: {
    direccion: string | null
    direccionIlegible: boolean
    codigoPostal: string | null
    ciudad: string | null
    provincia: string | null
  }
}

/** El valor de antes de un campo: `null` = no consta; `'ilegible'` = está pero cifrado sin clave. */
export function valorActual(f: FichaActual, campo: CampoCorreccion): string | null | 'ilegible' {
  if (campo === 'nombre' || campo === 'apellidos') {
    const v = f.identidad?.[campo] ?? null
    return v && v.trim() !== '' ? v : null
  }
  if (campo === 'direccion') return f.contacto.direccionIlegible ? 'ilegible' : f.contacto.direccion
  return f.contacto[campo]
}

/** ¿Se puede enseñar el «antes» de todos los campos? Sin identidad no se enseña un nombre de antes. */
export function faltaValorActual(f: FichaActual, cambios: readonly Cambio[]): string | null {
  if (cambios.some((c) => IDENTIDAD.has(c.campo)) && f.identidad === null) return 'no puedo leer el nombre actual de la ficha'
  return null
}

/**
 * Huella de lo que había ANTES en los campos que se tocan. Al pulsar se relee la ficha: si alguien la
 * cambió en esos 15 minutos (la intranet, CIMA), no se pisa lo nuevo.
 */
export function huellaAntes(f: FichaActual, cambios: readonly Cambio[]): string {
  const antes = cambios.map((c) => [c.campo, valorActual(f, c.campo), c.valor])
  return createHash('sha256').update(JSON.stringify(antes)).digest('hex')
}

function escapar(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function fecha(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

/** El mensaje con el botón. Lo escribe el servidor, no la IA. */
export function textoCorreccion(f: FichaActual, cambios: readonly Cambio[], documento: DocumentoResumen | null): string {
  // Con qué reconocer la ficha: dos homónimos (padre e hijo) darían el mismo nombre.
  const quien = [f.dniEnmascarado ? `DNI ${f.dniEnmascarado}` : 'sin DNI en la ficha', f.contacto.ciudad ?? 'ciudad no consta']
  const l = [`✏️ <b>Corregir la ficha de ${escapar(f.nombre)}</b>`, `<i>${escapar(quien.join(' · '))}</i>`, '']
  for (const c of cambios) {
    const antes = valorActual(f, c.campo)
    const txt = antes === 'ilegible' ? 'cifrada, no se puede leer' : antes === null ? 'no consta' : antes
    l.push(`• ${ETIQUETA[c.campo]}: ${escapar(txt)} → <b>${escapar(c.valor)}</b>`)
  }
  if (documento) l.push('', `🪪 Acreditado con el DNI archivado el ${fecha(documento.creado)}.`)
  l.push('', 'Se escribe en la ficha y queda en su historial. Revisa cada letra antes de pulsar.')
  return l.join('\n')
}

export type FinCorreccion = { estado: 'aplicada' | 'rechazada' | 'error'; texto: string }

/** Respuesta del puerto → estado de la fila y mensaje a Alberto. Solo `ok` es «aplicada». */
export function resultadoCorreccion(r: ResultadoEscritura, urlFicha: string): FinCorreccion {
  switch (r.estado) {
    case 'ok':
      return { estado: 'aplicada', texto: `✅ Ficha corregida. Si tenías un resumen de emisión de este cliente, pídemelo otra vez. ${urlFicha}` }
    case 'invalido':
      return {
        estado: 'rechazada',
        texto: r.motivo === 'documento_no_acredita'
          ? `✖️ No se ha cambiado nada: asegura no acepta ese DNI como acreditación. Revísalo en la ficha: ${urlFicha}`
          : `✖️ No se ha cambiado nada: ${escapar(r.motivo)}.`,
      }
    case 'no_encontrado':
      return { estado: 'rechazada', texto: '✖️ No se ha cambiado nada: esa ficha ya no existe.' }
    case 'conflicto':
      return { estado: 'rechazada', texto: `✖️ No se ha cambiado nada: choca con otra ficha. Míralo en la intranet: ${urlFicha}` }
    case 'sin_configurar':
      return { estado: 'error', texto: '✖️ No se ha cambiado nada: la conexión con la cartera no está configurada.' }
    case 'error':
      if (r.motivo === 'secreto_rechazado') {
        return { estado: 'rechazada', texto: '✖️ No se ha cambiado nada: asegura ha rechazado el secreto del puerto (ASEGURA_OPERADOR_SECRET).' }
      }
      // Un fallo de red en un PATCH idempotente puede haber escrito o no: se dice, no se supone.
      return { estado: 'error', texto: `⚠️ No sé si se ha guardado (${escapar(r.motivo)}). Míralo en la ficha antes de repetir: ${urlFicha}` }
  }
}

export function urlCliente(clienteId: string, base: string = process.env.NEXT_PUBLIC_APP_URL || URL_PLATAFORMA_POR_DEFECTO): string {
  return `${base.replace(/\/$/, '')}/correduria/cliente/${encodeURIComponent(clienteId)}`
}
