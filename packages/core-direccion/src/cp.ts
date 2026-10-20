// Código postal español: validación y provincia. PURO (sin red, sin BD, apto navegador).
// La tabla es la de `module-seguros/src/cliente-edicion.ts` (nombres co-oficiales: «Illes Balears», «La Rioja»).
// DIFERENCIAS con `module-concursos` `provinciaDeCP` (catálogo PLACSP, que casa por substring): allí 07 = «Balears» y
// 26 = «Rioja»; las otras 50 coinciden. Además aquel acepta CP de 4 dígitos (rellena con 0) y este NO.

export type ResultadoCp = { ok: true; valor: string } | { ok: false; motivo: string }

/** CP de 5 dígitos con provincia 01-52. Recorta espacios. */
export function validarCp(cp: string | null | undefined): ResultadoCp {
  const s = (cp ?? '').trim()
  if (!/^\d{5}$/.test(s)) return { ok: false, motivo: 'El código postal son 5 dígitos.' }
  const p = Number(s.slice(0, 2))
  if (p < 1 || p > 52) return { ok: false, motivo: 'Código postal fuera de España.' }
  return { ok: true, valor: s }
}

/** Provincia por los dos primeros dígitos del CP. */
export const PROVINCIA_POR_CP: Readonly<Record<string, string>> = {
  '01': 'Álava', '02': 'Albacete', '03': 'Alicante', '04': 'Almería', '05': 'Ávila', '06': 'Badajoz',
  '07': 'Illes Balears', '08': 'Barcelona', '09': 'Burgos', '10': 'Cáceres', '11': 'Cádiz', '12': 'Castellón',
  '13': 'Ciudad Real', '14': 'Córdoba', '15': 'A Coruña', '16': 'Cuenca', '17': 'Girona', '18': 'Granada',
  '19': 'Guadalajara', '20': 'Gipuzkoa', '21': 'Huelva', '22': 'Huesca', '23': 'Jaén', '24': 'León',
  '25': 'Lleida', '26': 'La Rioja', '27': 'Lugo', '28': 'Madrid', '29': 'Málaga', '30': 'Murcia',
  '31': 'Navarra', '32': 'Ourense', '33': 'Asturias', '34': 'Palencia', '35': 'Las Palmas', '36': 'Pontevedra',
  '37': 'Salamanca', '38': 'Santa Cruz de Tenerife', '39': 'Cantabria', '40': 'Segovia', '41': 'Sevilla',
  '42': 'Soria', '43': 'Tarragona', '44': 'Teruel', '45': 'Toledo', '46': 'Valencia', '47': 'Valladolid',
  '48': 'Bizkaia', '49': 'Zamora', '50': 'Zaragoza', '51': 'Ceuta', '52': 'Melilla',
}

/** Provincia del CP, o `null` si no se sabe (comportamiento idéntico al de module-seguros: solo mira los 2 primeros dígitos). */
export function provinciaPorCp(cp: string | null | undefined): string | null {
  if (!cp) return null
  return PROVINCIA_POR_CP[cp.trim().slice(0, 2)] ?? null
}
