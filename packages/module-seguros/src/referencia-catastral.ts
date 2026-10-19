// Referencia catastral: forma y dígitos de control (19/10/2026). PURO.
//
// Para qué: un lead de hogar escribe a hola@ con la referencia catastral de su vivienda. Antes de gastar una consulta al
// Catastro (y sobre todo antes de dar por buena una dirección, unos m² o un año que no son suyos) se comprueban los dos
// caracteres de control de la referencia de 20. Una errata de una cifra no consulta nada: el correo sigue igual y la
// petición de datos pregunta lo que no se sabe.
//
// Algoritmo (el del Catastro): la referencia es parcela (7 + 7) + cargo (4) + 2 letras de control. Cada letra sale de
// sumar, con los pesos 13,15,12,5,4,17,9,21,3,7,1, los 11 caracteres de «mitad de parcela + cargo» (cifra = su valor;
// letra = su posición en el alfabeto CON la Ñ, A=1), módulo 23, sobre «MQWERTYUIOPASDFGHJKLBZX». Comprobado con 10
// referencias reales de los fixtures del repo (subastas y Catastro), ver `referencia-catastral.test.ts`.

const PESOS = [13, 15, 12, 5, 4, 17, 9, 21, 3, 7, 1] as const
const LETRAS_CONTROL = 'MQWERTYUIOPASDFGHJKLBZX'
const ALFABETO = 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ'
const RE_FORMA = /^[0-9A-Z]{14}[0-9]{4}[A-Z]{2}$/

/** Sin espacios, guiones ni puntos, en mayúsculas. */
export function normalizarReferenciaCatastral(rc: string | null | undefined): string {
  return String(rc ?? '').toUpperCase().replace(/[\s.\-]/g, '')
}

function valor(c: string): number {
  return /\d/.test(c) ? Number(c) : ALFABETO.indexOf(c) + 1
}

function letra(mitad: string, cargo: string): string {
  const s = mitad + cargo
  let suma = 0
  for (let i = 0; i < 11; i++) suma += valor(s[i]) * PESOS[i]
  return LETRAS_CONTROL[suma % 23]
}

/** ¿Es una referencia catastral COMPLETA (20) con sus dos letras de control correctas? */
export function referenciaCatastralValida(rc: string | null | undefined): boolean {
  const r = normalizarReferenciaCatastral(rc)
  if (!RE_FORMA.test(r)) return false
  const cargo = r.slice(14, 18)
  return letra(r.slice(0, 7), cargo) === r[18] && letra(r.slice(7, 14), cargo) === r[19]
}

/**
 * Las referencias catastrales VÁLIDAS (20 caracteres, control correcto) escritas en un texto, sin repetir y en orden.
 * Admite espacios o guiones entre bloques («4632121 TG3443B 0015 JW»). Lo que tiene forma pero no cuadra se descarta.
 */
export function referenciasCatastralesEn(texto: string | null | undefined): string[] {
  const t = String(texto ?? '').toUpperCase()
  const out: string[] = []
  for (const m of t.matchAll(/(?<![0-9A-Z])[0-9A-Z]{7}[\s-]?[0-9A-Z]{7}[\s-]?[0-9]{4}[\s-]?[A-Z]{2}(?![0-9A-Z])/g)) {
    const r = normalizarReferenciaCatastral(m[0])
    if (referenciaCatastralValida(r) && !out.includes(r)) out.push(r)
  }
  return out
}
