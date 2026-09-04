// Tipología de siniestro EIAC — TABLA OFICIAL DE TIREA, transcrita, no inferida.
//
// FUENTE (contrastar aquí dentro de un año, no de memoria):
//   · `209_IAC_ESP_DOC` «Documentos Estándar V07.1», versión 05, 03/06/2026,
//     punto 10.2 «Claves» → clave `13.3.86 claves_tipologiasiniestro`
//     (páginas 77-82 de 93). De ahí sale el TEXTO de cada descripción.
//   · Esquema `TiposEIAC-V07-1_V05.xsd` del paquete `XML-V07-1_V05.zip` de la
//     misma versión: `<xs:simpleType name="claves_tipologiasiniestro">`. De ahí
//     sale la CONFIRMACIÓN de los códigos: 182 enumeraciones, exactamente las
//     mismas y en el mismo orden que el PDF.
//
// ⚠️ Las dos fuentes NO coinciden letra a letra: en 22 de las 182 la
// `xs:documentation` del XSD lleva erratas o tildes comidas que el PDF sí pone
// («Humo - Daños Priopios» / «Humo - Daños propios», «Averia» / «Avería»,
// «Perdida - Extravio» / «Pérdida - Extravío»…). Aquí se guarda el texto del
// PDF, que es el documento publicado y el legible. Los CÓDIGOS son idénticos en
// ambas, que es lo que decide si un código existe o no.
//
// Cómo está construida la lista (tal cual la publica TIREA):
//   · Los códigos de DOS dígitos (10..21) son la cabecera del grupo —«11
//     Asistencia», «17 Otras Causas»— y el XSD los admite como valor válido,
//     así que una compañía puede mandar el grupo sin bajar al detalle. Por eso
//     están aquí y no se filtran.
//   · Los de CUATRO dígitos son el detalle dentro de su grupo.
//   · Hay HUECOS en la numeración oficial —no existen 1711, 2005 ni 1814 en su
//     sitio (1814 «Otras - Reclamación» va listado tras 1821)— y se respetan:
//     un código que no está en la tabla no se completa por parecido.
//
// 🚨 La lista es ÚNICA para todos los ramos. El estándar tipa
// `TipologiaSiniestro` como `claves_tipologiasiniestro` sin más («Tipología de
// siniestro. En caso de concurrir varias, señalar la principal.»), y ni
// `TiposEIAC` ni `ProcesosEIAC` traen un solo `xs:assert`/`xs:alternative` que
// ate la tipología al ramo. La tabla de RAMO (punto 10.3.1) es otra clave
// distinta (`claves_ramo`: 111, 121, 211, 241, 2151…) y no se cruza con esta.
// O sea: NO hay «opciones por ramo» publicadas; que el grupo 13 hable de
// vehículos es semántica del nombre, no una restricción del esquema.

/** Código EIAC de tipología de siniestro → descripción oficial (209_IAC_ESP_DOC V07.1 §10.2, clave 13.3.86). */
export const EIAC_TIPOLOGIA_SINIESTRO: Readonly<Record<string, string>> = Object.freeze({

  // ── Grupo 10 ──
  '10': 'Agua y conducciones',
  '1001': 'Atasco - Con Daños por Agua',
  '1002': 'Atasco - Sin Daños por Agua - Desatasco',
  '1003': 'Condensación',
  '1004': 'Escape - Accidental Agua - Omisión Cierre de Grifos',
  '1005': 'Escape - de conducción subterránea',
  '1006': 'Escape - de grifos comunitarios',
  '1007': 'Escape - de instalaciones contra incendios',
  '1008': 'Escape - de piscinas - Aljibes - Estanques',
  '1009': 'Escape - desde bajante general',
  '1010': 'Escape - desde montantes/acometidas',
  '1011': 'Escape - en desagües privados',
  '1012': 'Escape - sistema calefacción',
  '1013': 'Escape - tubería vista - Radiadores - Sin daños',
  '1014': 'Consumo - de Agua - Exceso',
  '1015': 'Filtraciones - internas',
  '1016': 'Filtraciones - por capilaridad',
  '1017': 'Filtraciones - por cubiertas',
  '1018': 'Filtraciones - por fachadas',
  '1019': 'Rotura de conducción - de saneamiento',
  '1020': 'Rotura de conducción - de suministro',
  '1021': 'Rotura de conducción - subterránea',
  '1022': 'Otras - Escape Agua y conducciones',
  '1023': 'Otras - Rotura de conducción',

  // ── Grupo 11 ──
  '11': 'Asistencia',
  '1101': 'Asistencia - Cerrajería',
  '1102': 'Asistencia - En Viaje',
  '1103': 'Asistencia - Jurídica',
  '1104': 'Asistencia - Manitas - Bricolaje',
  '1105': 'Asistencia - Reparación Electrodomésticos',
  '1106': 'Asistencia - Urgencia doméstica',
  '1107': 'Otras Asistencias',

  // ── Grupo 12 ──
  '12': 'Atmosféricos',
  '1201': 'Heladas',
  '1202': 'Inundación no consorciable',
  '1203': 'Lluvia',
  '1204': 'Nieve - Sobrecarga por nieve',
  '1205': 'Pedrisco - Granizo',
  '1206': 'Riesgos Extraordinarios - Inundación',
  '1207': 'Riesgos Extraordinarios - Viento',
  '1208': 'Viento - Edificación',
  '1209': 'Viento - Toldos - Antenas',
  '1210': 'Otras Riesgos Extraordinarios',
  '1211': 'Otras Atmosféricos',

  // ── Grupo 13 ──
  '13': 'Colisiones - Vehículos',
  '1301': 'Cascos - Colisión',
  '1302': 'Cascos - Daños Propios',
  '1303': 'Colisión - Animales - Cinegéticos',
  '1304': 'Colisión - Animales - Domésticos',
  '1305': 'Colisión - Atropello - Peatón - Ciclista',
  '1306': 'Colisión - Con objeto - Socavón en la vía',
  '1307': 'Colisión - Daños por colisión vehículo con continente',
  '1308': 'Colisión - Vehículos - Dos',
  '1309': 'Colisión - Vehículos - Tres o mas',
  '1310': 'Daños propios - Con colisión con tercero',
  '1311': 'Daños propios - Externos Maquinaria',
  '1312': 'Daños Propios - Incendio',
  '1313': 'Daños propios - Lunas',
  '1314': 'Daños Propios - Robo',
  '1315': 'Daños propios - Solo daños propios - Aparcamiento',
  '1316': 'Daños propios - Vandalismo',
  '1317': 'Inexistencia de Siniestro',
  '1318': 'Mercancías - Daños',
  '1319': 'Vehículo Sustitución - Accidente - Avería',
  '1320': 'Otras - Colisiones',
  '1321': 'Otras - Daños Propios',
  '1322': 'Otras - Mercancías',

  // ── Grupo 14 ──
  '14': 'Daños eléctricos y averías',
  '1401': 'Alteración del suministro eléctrico',
  '1402': 'Arco Eléctrico',
  '1403': 'Avería equipos electrónicos',
  '1404': 'Avería maquinaria - Avería del propio aparato',
  '1405': 'Defecto propio - Vicio instalación - Uso defectuoso',
  '1406': 'Errores de diseño y/o fabricación',
  '1407': 'Falta de mantenimiento',
  '1408': 'Interrupción suministro',
  '1409': 'Sobretensión Externa - Tormenta eléctrica - Corriente anormal.',
  '1410': 'Sobretensión Interna - cortocircuito',
  '1411': 'Otras - Daños Eléctricos',
  '1412': 'Otras - Averías',
  '1413': 'Otras - Equipos Electrónicos',

  // ── Grupo 15 ──
  '15': 'Daños Personales - Vida',
  '1501': 'Accidente - Asistencia Sanitaria',
  '1502': 'Accidente - Caída accidental',
  '1503': 'Accidente - Deportivo',
  '1504': 'Accidente - Domestico',
  '1505': 'Accidente - En riesgo asegurado',
  '1506': 'Accidente - Laboral',
  '1507': 'Accidente - Otros',
  '1508': 'Accidente - Personales',
  '1509': 'Fallecimiento - Deceso',
  '1510': 'Invalidez',
  '1511': 'Reembolso - Salud',
  '1512': 'Rescate - Reembolso - Seguro Ahorro-Pensiones-Fondos',
  '1513': 'Subsidio - Accidente',
  '1514': 'Subsidio - Enfermedad',
  '1515': 'Otros Accidentes - Daños Personales',
  '1516': 'Otros Salud',
  '1517': 'Otras Vida',

  // ── Grupo 16 ──
  '16': 'Incendio y explosion',
  '1601': 'Daños por salvamento',
  '1602': 'Explosión - Autoimplosión',
  '1603': 'Explosión - Daños por Explosión Causas Externas',
  '1604': 'Explosión - Red de gas',
  '1605': 'Humo - Daños propios',
  '1606': 'Humo - Emisión',
  '1607': 'Incendio',
  '1608': 'Incendio - Desde el exterior',
  '1609': 'Otras - Incendio Explosión',

  // ── Grupo 17 ──
  '17': 'Otras Causas',
  '1701': 'Caída de astronaves o aeronaves',
  '1702': 'Caución - Incumplimiento Contractual',
  '1703': 'Contingencias',
  '1704': 'Cyber - Daños',
  '1705': 'Garantía Decenal',
  '1706': 'Ingeniería - Construcción - Daños',
  '1707': 'Insolvencia - Crédito',
  '1708': 'Mascotas - Daños - Asistencia Veterinaria',
  '1709': 'Onda sónica',
  '1710': 'Pérdida de puntos carné',
  '1712': 'Otras - Ingeniería',
  '1713': 'Otras - Otras Causas',
  '1714': 'Otras - Ramo Vida',

  // ── Grupo 18 ──
  '18': 'Reclamaciones y Defensa',
  '1801': 'Defensa - Administrativa',
  '1802': 'Defensa - Contractual',
  '1803': 'Defensa - Laboral - Fiscal',
  '1804': 'Defensa - Privada',
  '1805': 'Defensa - Responsabilidad Civil',
  '1806': 'Defensa - Responsabilidad Penal',
  '1807': 'Reclamación - Clientes',
  '1808': 'Reclamación - Daños Materiales',
  '1809': 'Reclamación - Daños Por Daños causados por Animales',
  '1810': 'Reclamación - Errores de diseño/fabricación',
  '1811': 'Reclamación - Impagos',
  '1812': 'Reclamación - Incumplimiento Contractual',
  '1813': 'Reclamación - Por caída de carga',
  '1815': 'Reclamación - Por Daños Personales',
  '1816': 'Reclamación - Por Daños por Obras',
  '1817': 'Reclamación - Por Dolo',
  '1818': 'Reclamación - Por Impago Alquiler',
  '1819': 'Reclamación - Por Impericia - Negligencia de Usuario',
  '1820': 'Reclamación - A Compañía del asegurado',
  '1821': 'Otras - Defensa',
  '1814': 'Otras - Reclamación',

  // ── Grupo 19 ──
  '19': 'Responsabilidad',
  '1901': 'Responsablidad: Errores Diseño Fabricación',
  '1902': 'Responsabilidad Profesional',
  '1903': 'RC Animales',
  '1904': 'RC Carga',
  '1905': 'RC Colindantes - Conducciones y similares',
  '1906': 'RC Explotación',
  '1907': 'RC Familiar - Privada',
  '1908': 'RC Patronal',
  '1909': 'RC Intoxicación Alimentaria',
  '1910': 'RC Perros',
  '1911': 'RC Post Trabajos',
  '1912': 'RC Productos',
  '1913': 'RC Subsidiaria',
  '1914': 'RC Unión y Mezcla',
  '1915': 'Otras - Responsabilidades',

  // ── Grupo 20 ──
  '20': 'Robo y Vandalismo',
  '2001': 'Actos vandálicos - Acciones tumultuarias',
  '2002': 'Actos vandálicos - Malintencionados',
  '2003': 'Daños por robo',
  '2004': 'Daños por Robo - Anexos',
  '2006': 'Expoliación',
  '2007': 'Expoliación - Fuera de domicilios y empresas',
  '2008': 'Hurto',
  '2009': 'Pérdida - Extravío',
  '2010': 'Robo - Con fuerza',
  '2011': 'Robo - En Anexos',
  '2012': 'Uso fraudulento - Tarjeta bancaria',
  '2013': 'Otras - Robo y Vandalismo',

  // ── Grupo 21 ──
  '21': 'Roturas',
  '2101': 'Rotura - Accidental',
  '2102': 'Rotura - Cristales, espejos y similares',
  '2103': 'Rotura - Loza sanitaria',
  '2104': 'Rotura - Mármol y similares',
  '2105': 'Rotura - Placa Vitrocerámica',
  '2106': 'Rotura - Rotulos  comercios',
  '2107': 'Otras - Roturas',
})

/**
 * Descripción oficial de un código EIAC de tipología de siniestro.
 *
 * `null` significa **ese código NO está en la tabla oficial** — que no es lo
 * mismo que «no tiene significado»: puede ser un valor propio de la compañía,
 * una versión distinta del estándar, o basura. Quien llame decide qué pinta
 * entonces; aquí no se adivina.
 */
export function descripcionEiacSiniestro(codigo: string | null | undefined): string | null {
  if (typeof codigo !== 'string') return null
  const c = codigo.trim()
  if (c === '') return null
  // `hasOwn` y no el acceso a secas: si no, «constructor» o «toString» saldrían
  // del prototipo y devolverían una función disfrazada de descripción.
  return Object.hasOwn(EIAC_TIPOLOGIA_SINIESTRO, c) ? EIAC_TIPOLOGIA_SINIESTRO[c] : null
}
