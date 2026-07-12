// Clasificación PURA del "destino"/negocio de un movimiento bancario (a quién pertenece):
// pisos turísticos, Dúplex, seguros/correduría, traspaso entre cuentas propias o personal.
// Sin red ni BD → testeable con `node --test`. La persistencia y la IA viven en categorizar.ts.
//
// Clave del diseño: en las transferencias RECIBIDAS, el banco rotula el ABONO con el nombre del
// TITULAR como contraparte (es la primera línea del concepto en Norma 43). Por eso NO se puede
// inferir "traspaso interno" por el nombre en los abonos — hacerlo escondía las comisiones de la
// correduría del P&L. Los ingresos entrantes se clasifican por el CONCEPTO; el nombre del titular
// solo marca traspaso interno en los CARGOS (salidas), donde la contraparte sí es el receptor real.

export type Destino = 'turistico_pisos' | 'turistico_duplex' | 'seguros' | 'traspaso_interno' | 'personal' | 'actividad_pilar'

export const DESTINO_LABEL: Record<Destino, string> = {
  turistico_pisos: '🏖️ Pisos turísticos',
  turistico_duplex: '🏠 Dúplex Center',
  seguros: '🛡️ Seguros (correduría)',
  traspaso_interno: '🔁 Traspaso interno',
  personal: '👨‍👩‍👧 Personal',
  actividad_pilar: '🟣 Actividad Pilar',
}

const RE_TITULAR = /SUAREZ.*GUTIERREZ|GUTIERREZ.*SUAREZ|ALBERTO SUAREZ/i
// Exportadas para que lib/correduria.ts pueda explicar POR QUÉ un movimiento es de seguros
// (casó por nombre de aseguradora vs. cayó por descarte en BBVA). No duplicar estas regex.
export const RE_SEGUROS = /\b(GENERALI|ALLIANZ|MAPFRE|CASER|AXA|ZURICH|REALE|MUTUA|LINEA DIRECTA|SANITAS|ADESLAS|SEGURCAIXA|DKV|ASISA|CATALANA OCCIDENTE|OCCIDENT|LIBERTY|HELVETIA|PLUS ULTRA|SANTALUCIA|OCASO|PELAYO|VERTI|GENESIS|FENIX|DIVINA PASTORA|FIATC|SEGUROS BILBAO|NATIONALE|VIDACAIXA|ANTARES|ARAG|ASEFA|PREVENTIVA|SURNE|QUALITAS|SEGURO|SEGUROS)\b/i
const RE_PISOS = /\b(BOOKING|EXPEDIA|TRAVELSCAPE|AGODA|AIRBNB|STRIPE|HOTELBEDS|HOMETOGO|RENTALIA|VRBO|HOLIDU|SMOOBU|PRICELABS|DYNAPRICE|HOMEEXCHANG|IONOS|IKEA|LEROY|BRICO|FERRETER|D CULTO|DCULTO|SIQUE|EMASESA|ENDESA|DIGI|DIMITRI)\b/i
// Gastos propios del Dúplex (en la cuenta BBVA): comunidad, luz, internet, agua, IBI/ayto + reservas + mobiliario.
// El "Dúplex" (= Duplex Center) es el MISMO piso que Alberto llama "Villasís": Pasaje Villasís 1 /
// Pasaje Francisco Molina 4 (dos accesos). Tributa en el IRPF personal de Alberto. Ver skill `perfil-fiscal`.
const RE_DUPLEX = /\b(COMUNIDAD|PASAJE FRANCISCO|FRANCISCO MOLINA|VILLASIS|VILLAS[IÍ]S|ENDESA|FINETWORK|EMASESA|IBERDROLA|NATURGY|MOVISTAR|VODAFONE|ORANGE|DIGI|AYUNTAMIENTO|AYTO|IKEA|LEROY|BRICO|FERRETER|SMOOBU|PRICELABS|BOOKING|EXPEDIA|TRAVELSCAPE|AGODA|AIRBNB|STRIPE)\b/i
// Liquidaciones de comisiones de la correduría (lo que cobra Alberto de las compañías/plataforma
// de seguros): "LIQ.COMISIONES 2026MM", "LIQUIDACION DE COMISIONES", "COMISIONES MAYO", el código
// de agente "G.65792 LIQ ... GENERALI", "-FRA-COMIS-AAAAMMDD" y "LIQ. OP. Nº ...".
export const RE_COMISIONES = /LIQ\.?\s*COMIS|LIQUIDACI[OÓ]N\s+(DE\s+)?COMIS|COMISION|FRA-?\s*COMIS|G\.\d{3,}\s*LIQ|LIQ\.?\s*OP\.?\s*N/i
// Ingreso PERSONAL recibido aunque caiga en la cuenta de negocio (pensión/nómina). "RECIBIDO:" es
// como BBVA rotula los Bizum/transferencias de un particular con concepto ("Recibido: cerveza
// palacios"); son personales (≠ "Transferencia recibida" a secas, que es Booking). El Bizum se trata
// aparte (regla propia más abajo: SIEMPRE personal, entre o salga).
const RE_PERSONAL_IN = /\bPENSI[OÓ]N\b|INGRESO POR N[OÓ]MINA|\bRECIBIDO:/i
// Abonos de la correduría que NO traen la palabra "comisión" ni el nombre de la aseguradora, sino el
// código de liquidación del agente: "PD005 SALDO AGENTE" (Caser), "...REMSALDO..." (Aegon),
// "LIQ. SALDO CUENTA" (AXA), "PAGO SALDO CTA" (Generali), y los códigos de agente que identifican a la
// compañía pagadora: "SALDO. M00171" / bare "M00171" (Occident), "M1454" (Asisa), "SALDO. 8/92361"
// (Occident). Sin esto caerían a personal+revisar por descarte y desaparecían de la correduría.
// (Mantener sincronizado con lib/correduria.ts::detectarCompania, que reconoce estos mismos códigos.)
const RE_LIQUID_SEGUROS = /SALDO AGENTE|REMSALDO|SALDO CUENTA|PAGO SALDO CTA|\bPD005\b|SALDO\.\s*[A-Z0-9]|\bM\d{4,}\b|\b\d\/\d{4,}\b/i

const RE_TGSS = /TGSS|TESORERÍA\s+GENERAL|TESORERIA\s+GENERAL|SEGURIDAD\s+SOCIAL|T\.?G\.?S\.?S/i

// Resultado detallado: el negocio + si el movimiento es AMBIGUO y conviene que el dueño lo
// confirme (`revisar`). `confirmado` marca una clasificación TAN determinista que no necesita
// revisión del dueño (p. ej. Bizum siempre personal) → se da por confirmada al ingestar y NO
// aparece en la bandeja «Por revisar». Para actividad_pilar también incluye la subcategoría.
export type DestinoDetalle = { destino: Destino; revisar: boolean; subcategoria?: string; confirmado?: boolean }

export function clasificarDestinoDetalle(
  banco: string | null,
  concepto: string | null,
  contraparte: string | null,
  importe: number,
  titular: 'titular' | 'conyuge' = 'titular',
): DestinoDetalle {
  // Cuentas de Pilar: todos sus movimientos son actividad_pilar, subcategoría por tipo.
  if (titular === 'conyuge') {
    const txt = `${concepto ?? ''} ${contraparte ?? ''}`
    if (RE_TGSS.test(txt)) return { destino: 'actividad_pilar', revisar: false, subcategoria: 'cuota_autonomos' }
    if (importe > 0) return { destino: 'actividad_pilar', revisar: false, subcategoria: 'cobro_cliente' }
    return { destino: 'actividad_pilar', revisar: false, subcategoria: 'gasto_profesional' }
  }
  const txt = `${concepto ?? ''} ${contraparte ?? ''}`
  const esBBVA = (banco ?? '').toUpperCase().includes('BBVA')
  const esAbono = importe >= 0
  // Liquidación/pago de tarjeta (agregado de Kutxa "TARJ.CRDTO" o "PAGO RECIBO 4662…" en la
  // propia tarjeta): es un movimiento entre cuenta y tarjeta, NO un gasto real → no duplicar,
  // porque el gasto real ya está en el detalle de la tarjeta.
  if (/TARJ\.?\s*CR[EÉ]?DTO|PAGO RECIBO 466|466203201|PAGO DE TARJETA|LIQUIDACION? (DE )?TARJETA/i.test(txt)) return { destino: 'traspaso_interno', revisar: false }

  // Bizum (de Alberto) = SIEMPRE personal, entre o salga y sea cual sea el banco. Sin esto, un Bizum
  // ENVIADO desde BBVA caía a 'seguros' por descarte (los cargos de BBVA que no son del Dúplex). Va
  // tras el bloque de cónyuge (a Pilar un Bizum sí puede ser cobro de cliente → actividad_pilar).
  if (/\bBIZUM\b/i.test(txt)) return { destino: 'personal', revisar: false, confirmado: true }

  // Energía XXI (comercializadora regulada de Endesa) = luz de la VIVIENDA HABITUAL Monte Carmelo 68
  // → SIEMPRE personal, NO deducible (confirmado por Alberto, 02/07/2026). No confundir con la luz de
  // los pisos: esa llega como "ENDESA ENERGIA" (Kutxa → pisos) o "TE ELECTR/ENDESA ENE" (BBVA → dúplex)
  // y ninguno de esos conceptos contiene "ENERGIA XXI" (verificado en BD). Determinista → auto-confirmado.
  if (/ENERGIA\s+XXI/i.test(txt)) return { destino: 'personal', revisar: false, confirmado: true }

  // ABONOS (entradas): la contraparte es el TITULAR (no fiable) → clasificar por el concepto.
  if (esAbono) {
    if (RE_PERSONAL_IN.test(txt)) return { destino: 'personal', revisar: false }   // pensión/nómina/Bizum personal
    // "LIQ. OP. Nº XXXXXXX" en BBVA = liquidación de plataforma de reservas (Booking.com/Expedia)
    // para el Dúplex. Es el marcador FIABLE del cobro de Booking (lo trae el feed PSD2). Tiene
    // prioridad sobre RE_COMISIONES (que también captura "LIQ. OP.") para no marcarlo como seguros.
    if (esBBVA && /LIQ\.?\s*OP\./i.test(txt) && !RE_SEGUROS.test(txt)) return { destino: 'turistico_duplex', revisar: false }
    // La correduría (seguros) es SIEMPRE BBVA: las comisiones/liquidaciones de las compañías entran
    // ahí. Un abono con nombre de aseguradora en OTRO banco (p. ej. anulación de un recibo del coche
    // en Kutxa) NO es correduría → cae abajo a personal.
    if (esBBVA && (RE_COMISIONES.test(txt) || RE_SEGUROS.test(txt) || RE_LIQUID_SEGUROS.test(txt))) return { destino: 'seguros', revisar: false }
    if (RE_PISOS.test(txt)) return { destino: 'turistico_pisos', revisar: false }
    // Abono de BBVA sin patrón conocido (p. ej. "Transferencia recibida" a secas). El cobro real de
    // Booking llega por PSD2 con "LIQ. OP. Nº" (cubierto arriba); BBVA NO guarda el ordenante real
    // (devuelve el titular), así que no se puede afirmar que sea Booking. Antes caía a Dúplex por
    // descarte (frágil, metía ingresos personales en el piso). Ahora → 'personal' + REVISAR para que
    // el dueño lo confirme/reclasifique.
    if (esBBVA) return { destino: 'personal', revisar: true }
    return { destino: 'personal', revisar: false }
  }

  // CARGOS (salidas): la contraparte SÍ es el receptor real → el titular indica traspaso interno.
  if (RE_TITULAR.test(contraparte ?? '')) return { destino: 'traspaso_interno', revisar: false }
  // Cuota de autónomos (RETA) en BBVA: actividad de correduría, deducible (Art. 30.2.1ª LIRPF).
  if (esBBVA && RE_TGSS.test(txt)) return { destino: 'seguros', revisar: false, subcategoria: 'cuota_autonomos' }
  // La correduría (seguros) es SIEMPRE BBVA: ahí, lo que casa el Dúplex es del Dúplex (confianza alta);
  // lo demás cae a 'seguros' POR DESCARTE → conjetura que ADEMÁS se contaría como gasto deducible de la
  // correduría, así que se marca `revisar` para que el dueño la confirme (correduría / Dúplex / personal).
  if (esBBVA) return RE_DUPLEX.test(txt) ? { destino: 'turistico_duplex', revisar: false } : { destino: 'seguros', revisar: true }
  // Kutxa/otros (cuenta personal/familiar): si casa un patrón de pisos es de pisos; si no, personal. El
  // personal por descarte es el caso NORMAL del gasto diario → NO se marca `revisar` (no inundar la
  // bandeja). Si un gasto de Kutxa es del negocio (gasolina…), el dueño lo reclasifica y se aprende la
  // regla del comercio (se aplica a los iguales, pasados y futuros).
  if (RE_PISOS.test(txt)) return { destino: 'turistico_pisos', revisar: false }
  // Pólizas colectivas de salud (concepto genérico sin nombre de aseguradora conocida, p. ej. Kutxa).
  // Deducibles per Art. 30.2.5ª LIRPF: primas de seguro de enfermedad del autónomo hasta €500/persona/año.
  if (/ASISTENCIA\s+SANITARIA|P[OÓ]LIZAS?\s+CO[Ll]/i.test(txt)) return { destino: 'seguros', revisar: false, subcategoria: 'seguro_salud' }
  return { destino: 'personal', revisar: false }
}

// Variante simple (solo el negocio), para los call sites que no necesitan el flag de revisión.
export function clasificarDestino(banco: string | null, concepto: string | null, contraparte: string | null, importe: number): Destino {
  return clasificarDestinoDetalle(banco, concepto, contraparte, importe).destino
}
