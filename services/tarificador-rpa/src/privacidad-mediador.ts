// PRIVACIDAD del mediador en TODO texto que sale del worker (0.3.40, 04/11/2026). Hecho real (pilotaje Pelayo 0a3ffed6): el volcado del modal salió con
// «Identidad actual NOMBRE APELLIDOS» (el nombre completo del mediador; el redactor general solo conoce formas de NIF/teléfono/correo, no nombres propios).
//
// Fuente canónica: `MEDIADOR` de module-seguros (nombre, NIF, móvil). Import por RUTA RELATIVA al fichero puro (sin dependencias): el Dockerfile copia
// ese único fichero a `/app/packages/module-seguros/src/` (el worker no instala module-seguros entero). Además:
//   · `registrarNombresProtegidos([...])` añade nombres en ejecución;
//   · «Identidad actual <X>» se tapa SIEMPRE (X = hasta 4 palabras con mayúscula inicial), sea quien sea el mediador del portal.
// Puro y tolerante: nunca lanza. El texto sustituido es ASCII fijo (no rompe JSON ni el formato de las líneas de log).

import { MEDIADOR } from '../../../packages/module-seguros/src/mediador.ts'

export const MARCA_MEDIADOR = '[mediador]'
const MARCA_NIF = '[nif]'
const MARCA_TLF = '[telefono]'

const normal = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const escapar = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const SEP = /^[\s,]+$/

/** Palabras sueltas de los nombres protegidos (minúsculas, sin tildes) y nombres completos normalizados. */
const palabras = new Set<string>()
const nombres = new Set<string>()

function anadirNombre(n: string): void {
  const plano = n.replace(/\s+/g, ' ').trim()
  if (plano.length < 4) return
  nombres.add(normal(plano))
  for (const p of normal(plano).split(/[\s,]+/)) if (p.length >= 3 && !['del', 'las', 'los', 'van', 'von'].includes(p)) palabras.add(p)
}

/** Registra nombres propios a tapar (idempotente). */
export function registrarNombresProtegidos(lista: Iterable<unknown>): void {
  for (const n of lista) if (typeof n === 'string') anadirNombre(n)
}

anadirNombre(MEDIADOR.identidad.nombre)

const NIF = MEDIADOR.identidad.nif
const DIGITOS_TLF = MEDIADOR.identidad.telefono.replace(/\D/g, '').replace(/^34/, '')
const RE_NIF = new RegExp(NIF.slice(0, -1).split('').map(escapar).join('[\\s.-]?') + '[\\s.-]?' + escapar(NIF.slice(-1)), 'gi')
const RE_TLF = new RegExp('(?:\\+?34[\\s.-]?)?' + DIGITOS_TLF.split('').join('[\\s.-]?'), 'g')
const RE_IDENTIDAD = /(identidad\s+actual\s*:?\s*)([^\n·|"]{0,120})/gi
const PARADA = new Set(['datos', 'del', 'de', 'nueva', 'nuevo', 'tomador', 'seleccionar', 'tipo', 'documento', 'contratacion', 'cerrar', 'close', 'siguiente', 'nif', 'cif'])
const RE_PALABRA_NOMBRE = /^[A-ZÁÉÍÓÚÜÑ][\p{L}'’.-]*$/u

/** «Identidad actual» + hasta 4 palabras con mayúscula inicial (sin pasar de un rótulo conocido): se sustituyen por la marca. */
function tapaIdentidad(_m: string, pre: string, resto: string): string {
  const toks = resto.split(/(\s+)/)
  let i = 0
  let n = 0
  while (i < toks.length && n < 4) {
    const t = toks[i] ?? ''
    if (/^\s*$/.test(t)) { i++; continue }
    if (!RE_PALABRA_NOMBRE.test(t) || PARADA.has(normal(t).replace(/[^a-z]/g, ''))) break
    n++
    i++
  }
  if (n === 0) return pre + resto
  return pre + MARCA_MEDIADOR + ' ' + toks.slice(i).join('').trimStart()
}

/** Tapa el nombre del mediador (entero o en rachas de ≥ 2 palabras suyas), su NIF, su móvil y «Identidad actual <X>». */
export function redactarMediador(texto: string): string {
  if (typeof texto !== 'string' || texto === '') return texto
  let out = texto.replace(RE_IDENTIDAD, tapaIdentidad).replace(RE_NIF, MARCA_NIF).replace(RE_TLF, MARCA_TLF)
  if (palabras.size === 0) return out
  out = out.replace(/[\p{L}'’-]+(?:[\s,]+[\p{L}'’-]+)*/gu, (frase) => {
    const partes = frase.split(/([\s,]+)/)
    const res: string[] = []
    let i = 0
    while (i < partes.length) {
      const p = partes[i] ?? ''
      if (SEP.test(p) || !palabras.has(normal(p))) { res.push(p); i++; continue }
      let j = i
      let n = 0
      let ultima = i
      while (j < partes.length) {
        const q = partes[j] ?? ''
        if (SEP.test(q)) { j++; continue }
        if (!palabras.has(normal(q))) break
        n++
        ultima = j
        j++
      }
      const tramo = partes.slice(i, ultima + 1).join('')
      if (n >= 2 || nombres.has(normal(tramo))) { res.push(MARCA_MEDIADOR); i = ultima + 1 } else { res.push(p); i++ }
    }
    return res.join('')
  })
  return out
}

/** Copia profunda de `valor` con `redactarMediador` en cada cadena (los valores; las claves no se tocan). Tope de profundidad 12. */
export function redactarMediadorProfundo<T>(valor: T, prof = 0): T {
  return redactarAny(valor, prof) as T
}
function redactarAny(valor: unknown, prof: number): unknown {
  if (typeof valor === 'string') return redactarMediador(valor)
  if (prof > 12 || valor === null || typeof valor !== 'object') return valor
  if (Array.isArray(valor)) return valor.map((x) => redactarAny(x, prof + 1))
  const o: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(valor)) o[k] = redactarAny(v, prof + 1)
  return o
}

/** Envuelve un redactor (credenciales) para que además tape los datos del mediador. */
export const conRedaccionMediador = (redactor: (t: string) => string): ((t: string) => string) => (t) => redactarMediador(redactor(t))
