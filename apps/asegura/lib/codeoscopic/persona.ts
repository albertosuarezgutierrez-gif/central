// La PERSONA tal como viaja a Codeoscopic (`holder`, y en auto también
// `owner` y `primaryDriver`). PURO. Compartida por auto y hogar para que la
// proyección sea UNA: el vendor cruza por DNI y rechaza dos personas con el
// mismo documento y distinto dato, así que el mismo tomador tiene que salir
// idéntico salga por el ramo que salga.

export type DatosPersona = {
  dni: string
  nombre: string
  apellido1: string
  apellido2?: string | null
  fechaNacimiento: string // aaaa-mm-dd
  sexo: 'hombre' | 'mujer'
  estadoCivil: string // id del catálogo del vendor
  telefono: string
  cpResidencia?: string | null
  municipioResidenciaId?: number | null
  /**
   * Nombre de la calle de residencia. Optativo AQUÍ (hogar no lo necesita para
   * su tomador; la dirección que hogar tarifica es la del RIESGO, no la de la
   * persona) — quien lo exige de verdad es `revisarDatosAuto` (11º 400 real,
   * 12/09/2026, ReRate del proyecto 40684860): «The road name of the address
   * of the holder/primary driver/owner is mandatory». La ficha NO lo trae para
   * auto, así que lo teclea el corredor — nunca se supone un dato personal.
   */
  nombreVia?: string | null
  /**
   * Optativo AQUÍ por la misma razón que `nombreVia`: no lo pide la cotización
   * inicial (`construirPersona` lo deja fuera a propósito), pero el SUBMIT de
   * auto sí (13º 400 real, 12/09/2026, `POST …/policy-applications` del
   * proyecto 40684860): «The e-mail of the holder/owner/primaryDriver is
   * mandatory». Se repara desde la ficha del cliente cuando el vendor lo pide
   * (`valoresPersonaDesdeFicha`), nunca inventado.
   */
  email?: string | null
  /**
   * Número de la calle de residencia. 14º 400 real (12/09/2026, mismo
   * proyecto): el Submit, además de `nombreVia` y `email`, pide TAMBIÉN «road
   * number» — el vendor trocea la dirección en tres campos, no dos. Texto
   * libre, igual que `nombreVia`.
   */
  numeroVia?: string | null
  /**
   * `roadType.id` del catálogo `/road-types` — mismo 14º 400 real: «road
   * type» de la dirección también es obligatorio. 🚨 A diferencia de
   * `nombreVia`/`numeroVia`/`email`, esto es una referencia de CATÁLOGO, no
   * texto libre: nunca se manda un id que no haya salido de `GET
   * /road-types` (misma regla que el resto de catálogos de hogar,
   * `docs/CODEOSCOPIC-API-PORTAL.md`). Lo resuelve `valoresPersonaDesdeFicha`
   * emparejando el tipo de vía de la ficha (`partirDireccion`) contra el
   * catálogo vivo — si no hay match, no se manda nada inventado.
   */
  tipoVia?: string | null
}

export const RE_TELEFONO = /^[67][0-9]{8}$/
export const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/
/** Forma mínima de un correo: algo@algo.algo. El vendor valida el suyo; esto solo evita pagar por una errata. */
export const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * 🚨 La CLAVE con la que viaja el correo en la persona del vendor. UNA constante
 * para el `POST /insurances` (`construirPersona`), el PATCH de reparación
 * (`aplicarCampoPersona`) y la relectura (`leerCampoPersona`), porque hoy es
 * una SUPOSICIÓN: el portal solo confirma que `email` es un campo de persona
 * (`docs/CODEOSCOPIC-API-PORTAL.md`, roles de hogar), no su forma exacta — y
 * el 12/09/2026 un PATCH con `email` devolvió 200 y al releer el proyecto
 * (40685666) el correo no estaba, mientras que `roadName` por el mismo PATCH
 * SÍ se aplicó. Eso apunta a que la clave (o la forma: ¿`emails[]`?) no es la
 * que el vendor espera. La precalificación registra la estructura de la
 * persona que devuelve el vendor (`estructuraPersonaVendor`) para fijarla con
 * un dato y no con otro 0,50€. Si cambia, cambia AQUÍ y en ningún otro sitio.
 */
export const CLAVE_EMAIL_VENDOR = 'email'

export function texto(v: unknown): boolean {
  return typeof v === 'string' && v.trim() !== ''
}
export function numero(v: unknown): boolean {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0
}

/** Reparo genérico sobre un campo de la persona. */
export type ReparoPersona = { campo: keyof DatosPersona; motivo: string }

/** Las reglas del tomador que valen para cualquier ramo. */
export function revisarPersona(d: Partial<DatosPersona>): ReparoPersona[] {
  const r: ReparoPersona[] = []
  const falta = (c: keyof DatosPersona, m = 'hace falta para poder cotizar') => r.push({ campo: c, motivo: m })
  for (const c of ['dni', 'nombre', 'apellido1', 'estadoCivil'] as const) if (!texto(d[c])) falta(c)
  if (!texto(d.fechaNacimiento)) falta('fechaNacimiento')
  else if (!RE_FECHA.test(String(d.fechaNacimiento)))
    r.push({ campo: 'fechaNacimiento', motivo: 'la fecha tiene que ser aaaa-mm-dd' })
  if (d.sexo !== 'hombre' && d.sexo !== 'mujer') falta('sexo')
  // El vendor valida el móvil: mejor rechazarlo aquí que pagar por un 400.
  if (!texto(d.telefono)) falta('telefono')
  else if (!RE_TELEFONO.test(String(d.telefono).replace(/\s/g, '')))
    r.push({ campo: 'telefono', motivo: 'tiene que ser un móvil español: 9 dígitos empezando por 6 o 7' })
  // Residencia: si va uno, va el otro (lo exige el vendor).
  if (numero(d.municipioResidenciaId) && !texto(d.cpResidencia))
    r.push({ campo: 'cpResidencia', motivo: 'si mandas el municipio de residencia, el código postal es obligatorio' })
  return r
}

/**
 * Construye la persona. `fechaCarnet` solo la lleva auto: es el carnet B del
 * conductor. Hogar no lo manda — no hace falta para el precio.
 */
export function construirPersona(d: DatosPersona, extra: { fechaCarnet?: string | null } = {}): Record<string, unknown> {
  const persona: Record<string, unknown> = {
    identificationDocument: { type: { id: 'Dni' }, id: d.dni.trim().toUpperCase() },
    name: d.nombre.trim(),
    surname: d.apellido1.trim(),
    birthDate: d.fechaNacimiento,
    gender: { id: d.sexo === 'hombre' ? 'Male' : 'Female' },
    maritalStatus: { id: d.estadoCivil },
    phones: [{ number: d.telefono.replace(/\s/g, ''), primary: true }],
  }
  if (texto(extra.fechaCarnet)) {
    persona.drivingLicenses = [{ type: { id: 'B' }, date: extra.fechaCarnet, issuingZone: { id: 'Spain' } }]
  }
  if (texto(d.apellido2)) persona.surname2 = d.apellido2!.trim()
  // El correo, si la ficha lo tiene. Ver `CLAVE_EMAIL_VENDOR` para la clave.
  if (texto(d.email)) persona[CLAVE_EMAIL_VENDOR] = d.email!.trim()

  // La dirección solo viaja si están las DOS mitades: el vendor rechaza el
  // municipio sin código postal. Cuatro productos del grupo de salida la exigen.
  if (texto(d.cpResidencia) && numero(d.municipioResidenciaId)) {
    const direccion: Record<string, unknown> = {
      postalCode: d.cpResidencia,
      town: { id: d.municipioResidenciaId },
      primary: true,
    }
    // `roadName`/`roadNumber`/`roadType`: el ReRate/Submit de auto los exige (ver
    // el comentario de cada campo en el tipo). Se mandan si los hay, nunca
    // inventados — `roadType` es además una referencia de catálogo, nunca texto.
    if (texto(d.nombreVia)) direccion.roadName = d.nombreVia!.trim()
    if (texto(d.numeroVia)) direccion.roadNumber = d.numeroVia!.trim()
    if (texto(d.tipoVia)) direccion.roadType = { id: d.tipoVia!.trim() }
    persona.addresses = [direccion]
  }

  // 🔒 Lo que NO se manda, y es deliberado: ocupación, situación laboral y país
  // de nacimiento. No hacen falta ni para el precio ni para emitir.
  //
  // ⚠️ Hasta el 12/09/2026 tampoco salían de aquí el email ni la calle completa
  // («no hacen falta para el precio, menos datos fuera»). Era cierto para el
  // precio y falso para EMITIR: el Submit los exige y el vendor NO aplica el
  // correo por PATCH, así que cada cotización nacida sin ellos era inemitible
  // por construcción — 7 cargos de 0,50€ (11-12/09/2026, póliza de Pilar Franco
  // Ruz) sobre la misma persona incompleta, descubriendo un campo por cargo.
  // Ahora viaja lo que la FICHA ya tiene; lo que no tiene lo pide la pantalla
  // ANTES de pagar (`revisarDatosAuto(..., { paraEmitir: true })`). Nada se
  // inventa.
  return persona
}
