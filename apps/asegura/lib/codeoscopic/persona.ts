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
 * 🚨 La forma con la que viaja el correo en la persona del vendor. UN sitio para
 * el `POST /insurances` (`construirPersona`), el PATCH de reparación
 * (`aplicarCampoPersona`) y la relectura (`leerCampoPersona`).
 *
 * MEDIDO el 13/09/2026 (04:55 UTC) sobre el proyecto real 40685666, leyendo la
 * persona que devuelve el propio vendor (`registrarEstructuraPersonaVendor`):
 * `holder` trae `emails` como ARRAY (vacío) — no existe ninguna clave `email`.
 * Por eso el 12/09 un PATCH con `email: "…"` devolvió 200 y no aplicó: el
 * vendor descarta la clave que no conoce sin quejarse, mientras que `roadName`
 * (clave correcta) sí se aplicó por el mismo PATCH. Es la misma familia que
 * `phones: [{ number, primary }]`.
 *
 * Lo que sigue SIN fixture es la clave del ELEMENTO (`address`? `email`?
 * `value`?): `CLAVES_ELEMENTO_EMAIL` es el orden en que `completarPersonas`
 * las prueba —PATCH + relectura, gratis— hasta que una cuaja, y lo registra en
 * el log. El POST usa la primera; si el vendor la ignorase, la reparación
 * previa al Submit lo repara igual sin otro cargo.
 */
export const CLAVE_EMAIL_VENDOR = 'emails'
export const CLAVES_ELEMENTO_EMAIL = ['address', 'email', 'value'] as const
export type ClaveElementoEmail = (typeof CLAVES_ELEMENTO_EMAIL)[number]

/** Un elemento de `emails[]` con la clave elegida (por defecto, la más probable). */
export function elementoEmail(
  email: string,
  clave: ClaveElementoEmail = CLAVES_ELEMENTO_EMAIL[0],
): Record<string, unknown> {
  return { [clave]: email.trim(), primary: true }
}

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

/** Lo que vale cuando nadie ha dicho otra cosa. Ver `CarnetExtra`. */
export const TIPO_CARNET_SUPUESTO = 'B'
export const ZONA_CARNET_SUPUESTA = 'Spain'

/**
 * El carnet del conductor. `fechaCarnet` solo la lleva auto.
 *
 * 🚨 `tipo` y `zona` estuvieron CABLEADOS a `B` y `Spain` desde que existe este
 * fichero, y por eso un cliente con carnet extranjero se declaraba como
 * español **sin que nada fallase**: el vendor acepta la combinación, tarifica y
 * devuelve un precio firme. No es un precio malo — es una declaración inexacta
 * del riesgo (art. 10 LCS), y quien la paga es el asegurado el día del
 * siniestro (comparativa con Avant2, 21/09/2026: su formulario SÍ pregunta la
 * zona de expedición, porque el catálogo `/car/driving-license-issuing-zones`
 * existe y tiene más de un valor).
 *
 * Siguen teniendo valor por defecto —son el caso de nueve de cada diez— pero
 * ahora el defecto se DECLARA como supuesto (`suponer('zonaCarnet', …)`) para
 * que la pantalla pueda decir sobre qué se ha tarificado, en vez de afirmarlo
 * en silencio. Los ids salen del catálogo del vendor, nunca de un literal
 * tecleado en la pantalla.
 */
export type CarnetExtra = {
  fechaCarnet?: string | null
  /** `drivingLicenses[].type.id` — del catálogo `/car/driving-licenses`. */
  tipoCarnet?: string | null
  /** `drivingLicenses[].issuingZone.id` — del catálogo `/car/driving-license-issuing-zones`. */
  zonaCarnet?: string | null
  /**
   * Más carnés DETRÁS del principal (misma zona). Moto: el B junto al A, como
   * el ejemplo oficial `motorcycle/quotation-request.json`. El principal va
   * SIEMPRE en `[0]`: `formulario-guardado` e `interprete-400` leen ahí la fecha.
   */
  adicionales?: { tipo: string; fecha: string }[] | null
}

/**
 * Construye la persona. `extra` es el carnet, que solo lleva auto: hogar no lo
 * manda — no hace falta para el precio.
 */
export function construirPersona(d: DatosPersona, extra: CarnetExtra = {}): Record<string, unknown> {
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
    // El defecto se aplica AQUÍ y en un solo sitio; quien lo quiera distinto lo
    // manda, y quien no lo mande queda declarado como supuesto aguas arriba.
    persona.drivingLicenses = [
      {
        type: { id: texto(extra.tipoCarnet) ? extra.tipoCarnet!.trim() : TIPO_CARNET_SUPUESTO },
        date: extra.fechaCarnet,
        issuingZone: { id: texto(extra.zonaCarnet) ? extra.zonaCarnet!.trim() : ZONA_CARNET_SUPUESTA },
      },
    ]
    for (const a of extra.adicionales ?? []) {
      if (!texto(a.tipo) || !texto(a.fecha)) continue
      ;(persona.drivingLicenses as unknown[]).push({
        type: { id: a.tipo.trim() },
        date: a.fecha,
        issuingZone: { id: texto(extra.zonaCarnet) ? extra.zonaCarnet!.trim() : ZONA_CARNET_SUPUESTA },
      })
    }
  }
  if (texto(d.apellido2)) persona.surname2 = d.apellido2!.trim()
  // El correo, si la ficha lo tiene — como `emails[]`, igual que `phones[]`.
  if (texto(d.email)) persona[CLAVE_EMAIL_VENDOR] = [elementoEmail(d.email!)]

  // La dirección solo viaja si están las DOS mitades: el vendor rechaza el
  // municipio sin código postal. Cuatro productos del grupo de salida la exigen.
  const direccion = direccionDe(d)
  if (direccion) persona.addresses = [direccion]

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

type Direccion = Pick<DatosPersona, 'cpResidencia' | 'municipioResidenciaId' | 'nombreVia' | 'numeroVia' | 'tipoVia'>

/** `addresses[0]` de una persona (física o jurídica), o `null` si no están las dos mitades. */
function direccionDe(d: Direccion): Record<string, unknown> | null {
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
    return direccion
  }
  return null
}

// ─── Propietario EMPRESA (persona jurídica, 29/09/2026) ─────────────────────
//
// El vendor admite `Cif` en `holder` y `risk.owner` de coche y moto, NUNCA en
// `primaryDriver`/`secondaryDriver` (docs/CODEOSCOPIC-API-PORTAL.md § Identificación,
// cita literal del esquema). Una empresa no tiene fecha de nacimiento, sexo ni
// estado civil: por eso NO es un `DatosPersona` con huecos, es otro tipo.
//
// 🚧 **Sin verificar contra el vendor** qué campos de `JuridicalPerson_V1` exige
// el rol `owner` (el ejemplo de `person-roles` es de persona física). Se manda
// lo que la ficha tiene —CIF, razón social, teléfono, correo, dirección— y nada
// inventado (ni forma jurídica ni fecha de constitución). El primer intento real
// puede devolver un 400 con el campo que falte: `interprete-400` lo traduce.

export type DatosEmpresa = {
  tipo: 'juridica'
  cif: string
  /** Razón social: va en `name`, la única clave de nombre de una jurídica. */
  razonSocial: string
  telefono?: string | null
  email?: string | null
  cpResidencia?: string | null
  municipioResidenciaId?: number | null
  nombreVia?: string | null
  numeroVia?: string | null
  tipoVia?: string | null
}

/** Quien puede ser propietario del vehículo: una persona o una empresa. */
export type DatosPropietario = DatosPersona | DatosEmpresa

export function esEmpresa(p: unknown): p is DatosEmpresa {
  return typeof p === 'object' && p !== null && (p as { tipo?: unknown }).tipo === 'juridica'
}

/** El documento con el que el vendor cruza identidades: DNI de una persona, CIF de una empresa. */
export function documentoDe(p: Partial<DatosPersona> | Partial<DatosEmpresa> | null | undefined): string {
  if (!p) return ''
  const v = esEmpresa(p) ? p.cif : (p as Partial<DatosPersona>).dni
  return String(v ?? '').trim().toUpperCase().replace(/[\s-]/g, '')
}

const LETRAS_CIF = 'ABCDEFGHJNPQRSUVW'
/** Teléfono de una empresa: el vendor admite fijos (`^[9|8|7|6][0-9]{8}$`), no solo móviles. */
const RE_TELEFONO_EMPRESA = /^[6-9][0-9]{8}$/

/**
 * ¿Es un CIF español bien formado, con su dígito de control? Se comprueba aquí
 * porque una errata en el CIF es un 400 del vendor DESPUÉS de cobrar los 0,50€.
 */
export function cifValido(v: string | null | undefined): boolean {
  const c = String(v ?? '').trim().toUpperCase().replace(/[\s-]/g, '')
  const m = c.match(/^([A-Z])(\d{7})([0-9A-J])$/)
  if (!m || !LETRAS_CIF.includes(m[1])) return false
  const d = m[2].split('').map(Number)
  let suma = 0
  d.forEach((n, i) => {
    if (i % 2 === 1) suma += n
    else {
      const x = n * 2
      suma += Math.floor(x / 10) + (x % 10)
    }
  })
  const control = (10 - (suma % 10)) % 10
  const letra = 'JABCDEFGHI'[control]
  // Letra obligatoria (P, Q, R, S, N, W), dígito obligatorio (A, B, E, H), el resto cualquiera.
  if ('PQRSNW'.includes(m[1])) return m[3] === letra
  if ('ABEH'.includes(m[1])) return m[3] === String(control)
  return m[3] === String(control) || m[3] === letra
}

export type ReparoEmpresa = { campo: keyof DatosEmpresa; motivo: string }

/** Lo mínimo para declarar una empresa propietaria sin pagar por un 400 evitable. */
export function revisarEmpresa(d: Partial<DatosEmpresa>): ReparoEmpresa[] {
  const r: ReparoEmpresa[] = []
  if (!texto(d.cif)) r.push({ campo: 'cif', motivo: 'hace falta el CIF de la empresa' })
  else if (!cifValido(d.cif)) r.push({ campo: 'cif', motivo: 'el CIF no es válido (letra, 7 cifras y control)' })
  if (!texto(d.razonSocial)) r.push({ campo: 'razonSocial', motivo: 'hace falta la razón social' })
  if (texto(d.telefono) && !RE_TELEFONO_EMPRESA.test(String(d.telefono).replace(/\s/g, '')))
    r.push({ campo: 'telefono', motivo: 'tiene que ser un teléfono español de 9 dígitos' })
  if (numero(d.municipioResidenciaId) && !texto(d.cpResidencia))
    r.push({ campo: 'cpResidencia', motivo: 'si mandas el municipio, el código postal es obligatorio' })
  return r
}

/** `JuridicalPerson_V1`: CIF + razón social, y lo que la ficha tenga de contacto. */
export function construirEmpresa(d: DatosEmpresa): Record<string, unknown> {
  const empresa: Record<string, unknown> = {
    identificationDocument: { type: { id: 'Cif' }, id: documentoDe(d) },
    name: d.razonSocial.trim(),
  }
  const tel = texto(d.telefono) ? d.telefono!.replace(/\s/g, '') : null
  if (tel && RE_TELEFONO_EMPRESA.test(tel)) empresa.phones = [{ number: tel, primary: true }]
  if (texto(d.email)) empresa[CLAVE_EMAIL_VENDOR] = [elementoEmail(d.email!)]
  const direccion = direccionDe(d)
  if (direccion) empresa.addresses = [direccion]
  return empresa
}

/** Los campos que le faltan al propietario, sea persona o empresa (vacío = se puede declarar). */
export function revisarPropietario(p: DatosPropietario): string[] {
  return (esEmpresa(p) ? revisarEmpresa(p) : revisarPersona(p)).map((f) => f.campo)
}

/** El `risk.owner` que viaja: persona física o jurídica. */
export function construirPropietario(p: DatosPropietario): Record<string, unknown> {
  return esEmpresa(p) ? construirEmpresa(p) : construirPersona(p)
}
