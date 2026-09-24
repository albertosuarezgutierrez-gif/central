// Por qué un dato cifrado NO se abre. Hasta el 02/09/2026 los tres `descifrar()`
// de la cartera se tragaban el error y la ficha pintaba «cifrado» sin más: con
// la clave sin poner, mal pegada o distinta de la del CRM se veía exactamente lo
// mismo, y Alberto copió variables en Vercel a ciegas tres veces seguidas.
//
// Cuatro causas, cuatro arreglos distintos — por eso no se colapsan:
//   sin_clave    → falta PII_ENCRYPTION_KEY en el Vercel de central-asegura (o no se redesplegó)
//   mal_formada  → está puesta pero no son 64 caracteres hex (se pegó con comillas, espacios, a medias)
//   no_abre      → es una clave válida pero NO la que cifró el dato (no es la de `asegura`)
//   sin_muestra  → no había ningún dato cifrado con el que probar: no se sabe
//
// Nunca devuelve ni registra el valor de la clave.

import { decryptField } from '@central/module-seguros-pii'

export type EstadoClavePii = 'ok' | 'sin_clave' | 'mal_formada' | 'no_abre' | 'sin_muestra'

export function estadoClavePii(muestra: string | null | undefined, clave: string | undefined = process.env.PII_ENCRYPTION_KEY): EstadoClavePii {
  const hex = clave?.trim()
  if (!hex) return 'sin_clave'
  if (!/^[0-9a-f]{64}$/i.test(hex)) return 'mal_formada'
  if (typeof muestra !== 'string' || !muestra.startsWith('v1:')) return 'sin_muestra'
  try {
    decryptField(muestra)
    return 'ok'
  } catch {
    return 'no_abre'
  }
}

/** La frase que va en la pantalla al lado de «cifrado». Dice DÓNDE tocar. */
export function explicarClavePii(estado: EstadoClavePii): string {
  switch (estado) {
    case 'ok': return 'la clave abre los datos'
    case 'sin_clave': return 'central-asegura no tiene PII_ENCRYPTION_KEY (o no se ha redesplegado tras añadirla)'
    case 'mal_formada': return 'PII_ENCRYPTION_KEY en central-asegura no son 64 caracteres hexadecimales: se pegó mal'
    case 'no_abre': return 'PII_ENCRYPTION_KEY en central-asegura es válida pero NO es la misma que la del proyecto asegura'
    case 'sin_muestra': return 'no hay ningún dato cifrado con el que probar la clave'
  }
}
