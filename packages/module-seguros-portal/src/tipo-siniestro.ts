// Qué tipo de siniestro es, en un desplegable, según el RAMO de la póliza elegida.
//
// El cliente lo cuenta con sus palabras en «Qué ha pasado»; esto no lo sustituye.
// Sirve para que el corredor reciba el parte ya clasificado (agua, lunas, robo…)
// y para dar la indicación que toca a cada caso (una avería con grúa es de la
// ASISTENCIA, no de un parte).
//
// 🚨 Es OPCIONAL y `null` = no lo ha contestado, que NO es «otro». Un parte sin
// tipo se tramita igual; uno con el tipo inventado por obligar a elegir, peor.
//
// Desde el 03/10/2026 hay lista para TODOS los ramos, agrupando la tipología
// oficial EIAC (`EIAC_TIPOLOGIA_SINIESTRO`, `@central/module-seguros`). El
// estándar NO ata tipología a ramo (ver la cabecera de `eiac-siniestros.ts`):
// la agrupación por ramo es NUESTRA. Cada tipo lleva el/los código(s) EIAC
// SUGERIDOS (el primero, el principal) para clasificar el parte en el CRM y
// cruzarlo luego con el siniestro que llegue de CIMA. 🚨 Los códigos son mapeo
// interno: el cliente NUNCA los ve (la pantalla solo pinta la etiqueta).
// El mismo tipo puede llevar códigos distintos según el ramo (un robo en auto
// es 1314; en una vivienda, 2003/2010).
//
// La lista cerrada es la MISMA que el CHECK de la BD
// (`2026-10-03_portal_parte_datos_ramo.sql`); la vigila su test. Las claves
// antiguas (colision, lunas, robo, averia, agua, incendio, cristales, electrico,
// danos_terceros, otro) se conservan: hay filas guardadas con ellas.

import { EIAC_TIPOLOGIA_SINIESTRO, type RamoSiniestro } from '@central/module-seguros'

export const TIPOS_SINIESTRO = [
  // ── las diez del 26/09/2026 (NO renombrar: hay filas con ellas) ──
  'colision',
  'lunas',
  'robo',
  'averia',
  'agua',
  'incendio',
  'cristales',
  'electrico',
  'danos_terceros',
  'otro',
  // ── vehículos ──
  'atropello',
  'animal',
  'choque_objeto',
  'danos_aparcado',
  // ── hogar, comunidades, comercio ──
  'atasco',
  'filtraciones',
  'explosion',
  'vandalismo',
  'atmosferico',
  'asistencia',
  'averia_equipos',
  'mercancias',
  // ── responsabilidad civil ──
  'reclamacion',
  'defensa_juridica',
  // ── personas ──
  'reembolso_salud',
  'asistencia_sanitaria',
  'subsidio',
  'fallecimiento',
  'invalidez',
  'rescate',
  'accidente_deportivo',
  'accidente_domestico',
  'accidente_laboral',
  'caida',
  'accidente_otro',
  // ── genérico ──
  'danos_materiales',
] as const
export type TipoSiniestro = (typeof TIPOS_SINIESTRO)[number]

export const ETIQUETA_TIPO_SINIESTRO: Record<TipoSiniestro, string> = {
  colision: 'Choque con otro vehículo',
  lunas: 'Lunas o cristales del vehículo',
  robo: 'Robo',
  averia: 'Avería o grúa',
  agua: 'Agua o fuga',
  incendio: 'Incendio o humo',
  cristales: 'Rotura de cristales, espejos, mármol o vitrocerámica',
  electrico: 'Daños eléctricos (subida de tensión, cortocircuito)',
  danos_terceros: 'Daños a un vecino u otra persona',
  otro: 'Otra cosa',
  atropello: 'Atropello a un peatón o ciclista',
  animal: 'Choque con un animal',
  choque_objeto: 'Choque con un objeto, bache o muro',
  danos_aparcado: 'Daños con el vehículo aparcado o vandalismo',
  atasco: 'Atasco de desagüe',
  filtraciones: 'Filtraciones (techo, fachada, humedad)',
  explosion: 'Explosión',
  vandalismo: 'Vandalismo',
  atmosferico: 'Lluvia, viento, granizo, nieve o inundación',
  asistencia: 'Asistencia urgente (cerrajería, manitas, urgencia)',
  averia_equipos: 'Avería de maquinaria o equipos',
  mercancias: 'Daños o pérdida de mercancía',
  reclamacion: 'Me reclaman por un daño',
  defensa_juridica: 'Necesito defensa jurídica',
  reembolso_salud: 'Reembolso de gastos médicos',
  asistencia_sanitaria: 'Asistencia sanitaria por un accidente',
  subsidio: 'Baja o subsidio por incapacidad',
  fallecimiento: 'Fallecimiento',
  invalidez: 'Invalidez',
  rescate: 'Rescate o cobro del ahorro',
  accidente_deportivo: 'Accidente haciendo deporte',
  accidente_domestico: 'Accidente en casa',
  accidente_laboral: 'Accidente en el trabajo',
  caida: 'Caída',
  accidente_otro: 'Otro accidente',
  danos_materiales: 'Daños materiales',
}

/** Un tipo dentro de un ramo, con su(s) código(s) EIAC sugerido(s). El primero es el principal. */
export type TipoDeRamo = { readonly tipo: TipoSiniestro; readonly codigosEiac: readonly string[] }

const t = (tipo: TipoSiniestro, ...codigosEiac: string[]): TipoDeRamo => ({ tipo, codigosEiac })

const VEHICULO: readonly TipoDeRamo[] = [
  t('colision', '1308', '1309', '1310'),
  t('atropello', '1305'),
  t('animal', '1303', '1304'),
  t('choque_objeto', '1306', '1307'),
  t('danos_aparcado', '1315', '1316'),
  t('lunas', '1313'),
  t('robo', '1314', '2003'),
  t('incendio', '1312'),
  t('averia', '1319', '1102', '1107'),
  t('otro', '1320', '1321'),
]

const HOGAR: readonly TipoDeRamo[] = [
  t('agua', '10', '1004', '1019', '1020', '1022', '1023'),
  t('atasco', '1001', '1002'),
  t('filtraciones', '1015', '1016', '1017', '1018'),
  t('incendio', '1607', '1608', '1605'),
  t('explosion', '1602', '1604', '1603'),
  t('robo', '2010', '2003', '2008', '2006'),
  t('vandalismo', '2002', '2001'),
  t('cristales', '2102', '2104', '2105', '2103'),
  t('electrico', '1409', '1410', '1411'),
  t('atmosferico', '12', '1203', '1205', '1208', '1209', '1206'),
  t('danos_terceros', '1905', '1907'),
  t('asistencia', '1106', '1101', '1104'),
  t('otro', '17', '1713'),
]

const COMERCIO: readonly TipoDeRamo[] = [
  t('agua', '10', '1004', '1020'),
  t('incendio', '16', '1607', '1608'),
  t('robo', '2010', '2003', '2008'),
  t('vandalismo', '2002', '2001'),
  t('cristales', '2102', '2106'),
  t('electrico', '1409', '1410', '1411'),
  t('averia_equipos', '1404', '1403', '1412', '1413'),
  t('atmosferico', '12'),
  t('mercancias', '1318', '1322'),
  t('danos_terceros', '1906', '1912', '1908', '1902'),
  t('reclamacion', '18', '1808', '1815', '1816'),
  t('defensa_juridica', '1805', '1801', '1802', '1803', '1806'),
  t('otro', '17', '1713'),
]

const RC: readonly TipoDeRamo[] = [
  t('danos_terceros', '19', '1906', '1907', '1902', '1908', '1912'),
  t('reclamacion', '18', '1808', '1815'),
  t('defensa_juridica', '1805', '1806'),
  t('otro', '1915'),
]

const SALUD: readonly TipoDeRamo[] = [
  t('reembolso_salud', '1511'),
  t('asistencia_sanitaria', '1501'),
  t('subsidio', '1514'),
  t('otro', '1516'),
]

const VIDA: readonly TipoDeRamo[] = [
  t('fallecimiento', '1509'),
  t('invalidez', '1510'),
  t('rescate', '1512'),
  t('otro', '1517', '1714'),
]

const DECESOS: readonly TipoDeRamo[] = [t('fallecimiento', '1509'), t('asistencia', '1107'), t('otro', '1714')]

const ACCIDENTES: readonly TipoDeRamo[] = [
  t('accidente_domestico', '1504'),
  t('accidente_laboral', '1506'),
  t('accidente_deportivo', '1503'),
  t('caida', '1502'),
  t('accidente_otro', '1507', '1515'),
  t('asistencia_sanitaria', '1501'),
  t('subsidio', '1513'),
  t('invalidez', '1510'),
  t('fallecimiento', '1509'),
  t('otro', '1515'),
]

const OTROS: readonly TipoDeRamo[] = [
  t('danos_materiales', '2101', '1321'),
  t('robo', '20', '2003'),
  t('danos_terceros', '19'),
  t('asistencia', '11', '1107'),
  t('otro', '17', '1713'),
]

/**
 * El catálogo por ramo de PÓLIZA (`TIPOS_SEGURO` de `@central/module-seguros`).
 * Exhaustivo por tipo: un ramo nuevo del enum sin entrada aquí no compila.
 */
export const TIPOS_POR_RAMO: Readonly<Record<RamoSiniestro, readonly TipoDeRamo[]>> = {
  auto: VEHICULO,
  moto: VEHICULO,
  hogar: HOGAR,
  comunidades: HOGAR,
  comercio: COMERCIO,
  responsabilidad_civil: RC,
  salud: SALUD,
  vida: VIDA,
  decesos: DECESOS,
  accidentes: ACCIDENTES,
  otros: OTROS,
}

/**
 * `'auto'`, `'HOGAR '`, `'comunidad'`… → la clave de `TIPOS_POR_RAMO`, o `null`
 * si no es un ramo conocido. Las dos formas de comunidad: la cartera y las
 * aportadas no siempre lo escribieron igual.
 */
export function ramoDelParte(ramo: string | null | undefined): RamoSiniestro | null {
  if (typeof ramo !== 'string') return null
  let r = ramo.trim().toLowerCase()
  if (r === 'comunidad') r = 'comunidades'
  return Object.hasOwn(TIPOS_POR_RAMO, r) ? (r as RamoSiniestro) : null
}

/**
 * Las opciones para ESE ramo. `[]` = no se sabe el ramo (sin póliza, o un ramo
 * que no conocemos): la pantalla no pinta el bloque y el parte viaja sin tipo.
 */
export function opcionesTipoSiniestro(ramo: string | null | undefined): readonly TipoSiniestro[] {
  const r = ramoDelParte(ramo)
  return r === null ? [] : TIPOS_POR_RAMO[r].map((x) => x.tipo)
}

/** Códigos EIAC sugeridos de un tipo EN un ramo. `[]` si el tipo no es de ese ramo. Interno: no se enseña al cliente. */
export function codigosEiacSugeridos(ramo: string | null | undefined, tipo: string | null | undefined): readonly string[] {
  const r = ramoDelParte(ramo)
  if (r === null || typeof tipo !== 'string') return []
  return TIPOS_POR_RAMO[r].find((x) => x.tipo === tipo)?.codigosEiac ?? []
}

export function esTipoSiniestro(v: unknown): v is TipoSiniestro {
  return typeof v === 'string' && (TIPOS_SINIESTRO as readonly string[]).includes(v)
}

/** Para el test: todo código sugerido existe en la tabla oficial. */
export function codigosEiacDesconocidos(): string[] {
  const fuera: string[] = []
  for (const lista of Object.values(TIPOS_POR_RAMO)) {
    for (const x of lista) for (const c of x.codigosEiac) if (!Object.hasOwn(EIAC_TIPOLOGIA_SINIESTRO, c)) fuera.push(c)
  }
  return fuera
}
