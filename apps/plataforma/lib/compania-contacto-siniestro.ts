// A qué compañía y a quién llamar cuando se abre un siniestro (20/09/2026).
//
// El siniestro trae `aseguradora` como TEXTO LIBRE (lo que diga CIMA o lo que
// Alberto teclee al abrirlo a mano) — no hay un código de compañía en la
// ficha del siniestro. Emparejarlo contra el directorio (`companias_dgs`) es
// necesariamente una comparación de texto, así que aquí se aplica la regla de
// la casa al revés de lo habitual: en vez de exigir IDENTIFICADOR exacto (no
// hay ninguno que comparar), se exige que la comparación de nombre sea
// INEQUÍVOCA — un único candidato — y si hay ambigüedad NO se elige ninguno.
// Mostrar el contacto de otra compañía en un siniestro real es peor que no
// mostrar nada.
import { contactoDestacado, ordenarContactos, type ContactoCompania } from '@central/module-seguros'
import type { Compania } from './companias-asegura'

function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * La compañía del directorio que casa con el texto libre del siniestro, o
 * `null` si no hay ninguna o hay más de una. Match por igualdad o por
 * contención (en cualquier dirección) contra `nombreComun` Y `nombreCima`:
 * CIMA a veces manda «MAPFRE ESPAÑA» donde el directorio tiene «Mapfre».
 */
export function companiaDeSiniestro(aseguradora: string, companias: readonly Compania[]): Compania | null {
  const a = normalizar(aseguradora)
  if (a === '') return null
  const candidatas = companias.filter((c) => {
    const nombres = [c.nombreComun, c.nombreCima].filter((n): n is string => n !== null).map(normalizar)
    return nombres.some((n) => n !== '' && (n === a || a.includes(n) || n.includes(a)))
  })
  return candidatas.length === 1 ? candidatas[0] : null
}

export type ContactoSiniestro = {
  /** El nombre de la persona destacada de área `siniestros`, o `null` si no hay ninguna clasificada así. */
  nombre: string | null
  telefono: string | null
  whatsapp: string | null
  horario: string | null
}

/**
 * El contacto a enseñar en la ficha del siniestro: la PERSONA de área
 * `siniestros` si el directorio la tiene, y si no, el canal genérico de la
 * compañía (`telefono_siniestros`/`whatsapp_siniestros`/`horario_siniestros`
 * de `companias_dgs`). Las dos fuentes pueden convivir (persona Y canal
 * genérico) — no se descarta el canal por tener ya un nombre.
 *
 * `{ nombre: null, telefono: null, whatsapp: null, horario: null }` = no hay
 * NADA que enseñar (no confundir con la compañía sin resolver, que no llama
 * a esta función).
 */
export function contactoSiniestroDe(compania: Compania): ContactoSiniestro {
  const destacado = contactoDestacado(compania.contactos as ContactoCompania[], 'siniestros')
  return {
    nombre: destacado?.nombre ?? null,
    telefono: destacado?.telefono ?? compania.telefonoSiniestros,
    whatsapp: compania.whatsappSiniestros,
    horario: compania.horarioSiniestros,
  }
}

export function tieneAlgoQueEnsenar(c: ContactoSiniestro): boolean {
  return c.nombre !== null || c.telefono !== null || c.whatsapp !== null || c.horario !== null
}

// Reexport para quien solo quiera ordenar contactos con el mismo criterio que Companias.tsx.
export { ordenarContactos }
