// Copia LITERAL de `src/lib/geo/provincia-por-cp.ts` del CRM (repo `asegura`).
// NO se sustituye por `provinciaPorCp` de `@central/module-seguros` / `core-direccion`
// a propósito: esas devuelven «Illes Balears» para 07 y el CRM «Islas Baleares»;
// cambiarlo alteraría la provincia que la ingesta persiste. Unificar = paso aparte.
/**
 * LOO-855 — Helper PURO para derivar la PROVINCIA española a partir de un código
 * postal. Los 2 primeros dígitos del CP identifican la provincia (01–52 según la
 * codificación oficial de Correos/INE). Fidelidad a Avant2: la ficha muestra la
 * provincia como campo READ-ONLY autorrellenado desde CP/localidad.
 *
 * Reutilizable (hogar/comunidades en olas posteriores lo consumirán). Sin `db`,
 * sin estado → testeable en aislamiento con `tsx --test`.
 */

/** Mapa 01–52 → nombre de provincia (codificación postal oficial ES). */
const PROVINCIAS_POR_CODIGO: Readonly<Record<string, string>> = {
  "01": "Álava",
  "02": "Albacete",
  "03": "Alicante",
  "04": "Almería",
  "05": "Ávila",
  "06": "Badajoz",
  "07": "Islas Baleares",
  "08": "Barcelona",
  "09": "Burgos",
  "10": "Cáceres",
  "11": "Cádiz",
  "12": "Castellón",
  "13": "Ciudad Real",
  "14": "Córdoba",
  "15": "A Coruña",
  "16": "Cuenca",
  "17": "Girona",
  "18": "Granada",
  "19": "Guadalajara",
  "20": "Gipuzkoa",
  "21": "Huelva",
  "22": "Huesca",
  "23": "Jaén",
  "24": "León",
  "25": "Lleida",
  "26": "La Rioja",
  "27": "Lugo",
  "28": "Madrid",
  "29": "Málaga",
  "30": "Murcia",
  "31": "Navarra",
  "32": "Ourense",
  "33": "Asturias",
  "34": "Palencia",
  "35": "Las Palmas",
  "36": "Pontevedra",
  "37": "Salamanca",
  "38": "Santa Cruz de Tenerife",
  "39": "Cantabria",
  "40": "Segovia",
  "41": "Sevilla",
  "42": "Soria",
  "43": "Tarragona",
  "44": "Teruel",
  "45": "Toledo",
  "46": "Valencia",
  "47": "Valladolid",
  "48": "Bizkaia",
  "49": "Zamora",
  "50": "Zaragoza",
  "51": "Ceuta",
  "52": "Melilla",
};

/**
 * Devuelve el nombre de la provincia para un CP español, o `null` si el CP no es
 * válido (no numérico, longitud incorrecta, o prefijo fuera de 01–52).
 * Tolerante a espacios alrededor; NO exige los 5 dígitos completos (con los 2
 * primeros basta), pero descarta prefijos imposibles.
 */
export function provinciaPorCp(cp: string | null | undefined): string | null {
  if (!cp) return null;
  const trimmed = cp.trim();
  // Al menos 2 dígitos; hasta 5. Solo dígitos.
  if (!/^\d{2,5}$/.test(trimmed)) return null;
  const prefijo = trimmed.slice(0, 2);
  return PROVINCIAS_POR_CODIGO[prefijo] ?? null;
}
