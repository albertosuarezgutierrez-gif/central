// Quién más hay en una póliza, y a quién se llama cuando el tomador no tiene
// teléfono.
//
// 🚨 Caso fundacional (02/09/2026): la ficha de **Esquiansa** (una empresa)
// decía «sin teléfono · sin email». Y era verdad… de la ficha del tomador. La
// póliza lleva un `conductor_habitual` (Juan Manuel, dueño y conductor del
// BMW) enlazado a SU PROPIA ficha, que sí tiene teléfono y email. La pantalla
// mandaba a Alberto a no poder llamar a un cliente al que sí se puede llamar.
//
// Medido sobre las 109 pólizas vivas: 81 traen intervinientes por CIMA (95 en
// total: 67 propietario, 21 conductor habitual, 5 asegurado, 1 contacto), 14 de
// ellos enlazados a OTRA ficha distinta del tomador, y de los 25 tomadores
// vivos «sin teléfono», 6 lo tienen en un interviniente. Nombre, teléfono y
// email de los intervinientes van CIFRADOS (95 de 95): descifra quien lee la
// BD, aquí solo se decide a quién se llama.

export type IntervinienteFicha = {
  polizaId: string
  /** `propietario` · `conductor_habitual` · `conductor_ocasional` · `contacto` ·
   *  `beneficiario` · `asegurado` (enum del CRM; se conserva tal cual). */
  rol: string
  /** Descifrado. `null` con `nombreIlegible: true` = está pero no se pudo leer. */
  nombre: string | null
  nombreIlegible: boolean
  telefono: string | null
  email: string | null
  telefonoIlegible: boolean
  emailIlegible: boolean
  /** Su propia ficha en la cartera, si CIMA la enlazó. Es un enlace, no un dato. */
  fichaId: string | null
  /** La misma persona que el tomador: no aporta un contacto nuevo. */
  esTomador: boolean
  /** `cima` o `manual`. */
  origen: string
}

const ROLES: Record<string, string> = {
  // `tomador` no viene del enum del CRM: lo sintetiza `filasIntervinientes` a
  // partir del titular de la póliza (ver abajo).
  tomador: 'tomador',
  propietario: 'propietario',
  conductor_habitual: 'conductor habitual',
  conductor_ocasional: 'conductor ocasional',
  contacto: 'persona de contacto',
  beneficiario: 'beneficiario',
  asegurado: 'asegurado',
}

export function etiquetaRol(rol: string): string {
  return ROLES[rol] ?? rol.replace(/_/g, ' ')
}

/** Por quién se pregunta primero cuando hay varios: el de contacto, luego quien conduce. */
const PRIORIDAD_CONTACTO = ['contacto', 'conductor_habitual', 'propietario', 'asegurado', 'conductor_ocasional', 'beneficiario']

export type ContactoEfectivo = {
  telefono: string | null
  email: string | null
  /** De dónde sale el teléfono: del tomador o de un interviniente. */
  viaTelefono: 'tomador' | 'interviniente' | null
  viaEmail: 'tomador' | 'interviniente' | null
  /** Quién es, cuando no es el tomador — para decir «📞 (Juan Manuel, conductor habitual)».
   *  `polizaId` es DE QUÉ póliza sale: una empresa con tres furgonetas tiene tres
   *  conductores habituales distintos, y el número es el de UNO de ellos, no el
   *  «teléfono de la empresa» (GLOBAL 2, 02/09/2026). */
  quien: { nombre: string | null; rol: string; fichaId: string | null; polizaId: string } | null
  /** `true` cuando asegura NO informa intervinientes: entonces «sin teléfono»
   *  solo significa «el tomador no lo tiene», no «nadie lo tiene». */
  intervinientesSinMirar: boolean
}

/**
 * A quién se llama. El tomador manda; si no tiene, el primer interviniente
 * (por prioridad de rol) que sí tenga. `intervinientes === null` = no se ha
 * podido mirar, y se dice — nunca se colapsa con «no hay nadie más».
 */
export function contactoEfectivo(
  tomador: { telefono: string | null; email: string | null },
  intervinientes: IntervinienteFicha[] | null,
): ContactoEfectivo {
  const base: ContactoEfectivo = {
    telefono: tomador.telefono,
    email: tomador.email,
    viaTelefono: tomador.telefono ? 'tomador' : null,
    viaEmail: tomador.email ? 'tomador' : null,
    quien: null,
    intervinientesSinMirar: intervinientes === null,
  }
  if (intervinientes === null || (base.telefono && base.email)) return base

  const otros = intervinientes
    .filter((i) => !i.esTomador)
    .sort((a, b) => prioridad(a.rol) - prioridad(b.rol))

  if (!base.telefono) {
    const t = otros.find((i) => i.telefono)
    if (t) {
      base.telefono = t.telefono
      base.viaTelefono = 'interviniente'
      base.quien = { nombre: t.nombre, rol: t.rol, fichaId: t.fichaId, polizaId: t.polizaId }
    }
  }
  if (!base.email) {
    const e = otros.find((i) => i.email)
    if (e) {
      base.email = e.email
      base.viaEmail = 'interviniente'
      base.quien ??= { nombre: e.nombre, rol: e.rol, fichaId: e.fichaId, polizaId: e.polizaId }
    }
  }
  return base
}

function prioridad(rol: string): number {
  const i = PRIORIDAD_CONTACTO.indexOf(rol)
  return i === -1 ? PRIORIDAD_CONTACTO.length : i
}

/**
 * Las filas que se pintan en la tarjeta «Intervinientes», con el TOMADOR
 * delante.
 *
 * 🚨 El tomador NO es un interviniente: es el `cliente_id` de la propia póliza,
 * y por eso no está en `poliza_intervinientes`. La tarjeta solo pintaba esa
 * tabla, así que en una póliza cuyo único interviniente es el conductor la
 * empresa titular no salía por ningún lado — Alberto lo vio el 02/09/2026 en la
 * 6930FBP (Allianz 056309613), donde CIMA manda un `conductor_habitual` y nada
 * más: la tarjeta listaba a una persona y del titular, ni rastro. El titular
 * está en la BD y se sabe SIEMPRE; lo que faltaba era pintarlo.
 *
 * Si la compañía ya mandó una fila que ES el tomador (un `propietario` que
 * coincide con la ficha del titular, que es el caso más común), no se duplica:
 * esa fila ya se rotula «(el tomador)».
 */
export type FilasIntervinientes = {
  filas: IntervinienteFicha[]
  /** `sin_mirar` = no se pudo leer la tabla (≠ «no hay nadie más»).
   *  `solo_tomador` = se miró y la compañía no mandó a nadie más. */
  aviso: 'sin_mirar' | 'solo_tomador' | null
}

export function filasIntervinientes(
  tomador: { polizaId: string; fichaId: string | null; nombre: string | null },
  lista: IntervinienteFicha[] | null,
): FilasIntervinientes {
  const yaEsta = (lista ?? []).some((i) => i.esTomador)
  const fila: IntervinienteFicha = {
    polizaId: tomador.polizaId,
    rol: 'tomador',
    nombre: tomador.nombre,
    nombreIlegible: false,
    telefono: null,
    email: null,
    telefonoIlegible: false,
    emailIlegible: false,
    fichaId: tomador.fichaId,
    esTomador: true,
    // Ni `cima` ni `manual`: sale de la póliza misma.
    origen: 'poliza',
  }
  const filas = yaEsta ? [...(lista ?? [])] : [fila, ...(lista ?? [])]
  return {
    filas,
    aviso: lista === null ? 'sin_mirar' : lista.length === 0 ? 'solo_tomador' : null,
  }
}

/**
 * Las PERSONAS que aparecen en las pólizas de una ficha, agrupadas por persona
 * en vez de por póliza.
 *
 * 🚨 Alberto, 02/09/2026: «en empresas y particulares se puede poner arriba las
 * personas de contacto o relaciones — en el caso de GLOBAL las personas de las
 * que tenemos datos e intervienen en alguna póliza». La tarjeta «Relaciones y
 * autorizaciones» solo enseña lo DECLARADO a mano (`cliente_relaciones`), y en
 * la cartera casi nadie lo tiene; mientras tanto, CIMA ya nos dice quién
 * conduce cada coche y con qué teléfono. Esa gente existe, se puede llamar, y
 * estaba enterrada póliza por póliza.
 *
 * Se agrupa por persona porque la misma conduce varias: GLOBAL 2 tiene tres
 * furgonetas con TRES conductores distintos, y otra ficha puede tener el mismo
 * conductor en dos coches. Clave de agrupación: su ficha si CIMA la enlazó y,
 * si no, el nombre — es lo único que hay, así que dos homónimos se funden; por
 * eso se muestra de qué póliza sale cada papel y no se afirma nunca que sean
 * «la misma persona» más allá de eso.
 *
 * El TOMADOR se excluye: es la ficha que se está mirando.
 * `null` (no se pudo leer la tabla) se propaga: no es «no hay nadie».
 */
export type PersonaDePolizas = {
  clave: string
  nombre: string | null
  /** Está pero cifrado y no se pudo descifrar (≠ no tiene nombre). */
  nombreIlegible: boolean
  fichaId: string | null
  telefono: string | null
  email: string | null
  /** Qué es en cada póliza: `conductor habitual del 2922BNJ`. */
  papeles: { rol: string; polizas: string[] }[]
  /** Su vínculo declarado en «Relaciones», si lo tiene. `null` = no hay ninguno
   *  anotado, que es el caso normal: CIMA no declara parentescos. */
  relacionDeclarada: string | null
}

export function personasDePolizas(
  intervinientes: IntervinienteFicha[] | null,
  polizas: readonly { id: string; etiqueta: string }[],
  relaciones: readonly { relacionadoId: string; tipo: string }[] | null,
): PersonaDePolizas[] | null {
  if (intervinientes === null) return null
  const etiqueta = new Map(polizas.map((p) => [p.id, p.etiqueta]))
  const rel = new Map((relaciones ?? []).map((r) => [r.relacionadoId, r.tipo]))
  const por = new Map<string, PersonaDePolizas>()

  for (const i of intervinientes) {
    if (i.esTomador) continue
    const nombreClave = i.nombre?.trim().toLowerCase()
    const clave = i.fichaId ?? (nombreClave ? `n:${nombreClave}` : `x:${i.polizaId}:${i.rol}`)
    let p = por.get(clave)
    if (!p) {
      p = {
        clave,
        nombre: i.nombre,
        nombreIlegible: i.nombreIlegible,
        fichaId: i.fichaId,
        telefono: null,
        email: null,
        papeles: [],
        relacionDeclarada: i.fichaId ? rel.get(i.fichaId) ?? null : null,
      }
      por.set(clave, p)
    }
    // El primer dato que aparezca manda; los siguientes no lo pisan.
    p.nombre ??= i.nombre
    p.fichaId ??= i.fichaId
    p.telefono ??= i.telefono
    p.email ??= i.email
    p.relacionDeclarada ??= p.fichaId ? rel.get(p.fichaId) ?? null : null
    if (p.nombre !== null) p.nombreIlegible = false

    const et = etiqueta.get(i.polizaId) ?? null
    let papel = p.papeles.find((x) => x.rol === i.rol)
    if (!papel) {
      papel = { rol: i.rol, polizas: [] }
      p.papeles.push(papel)
    }
    if (et !== null && !papel.polizas.includes(et)) papel.polizas.push(et)
  }

  const lista = [...por.values()]
  for (const p of lista) p.papeles.sort((a, b) => prioridad(a.rol) - prioridad(b.rol))
  return lista.sort((a, b) => {
    const d = prioridad(a.papeles[0]?.rol ?? '') - prioridad(b.papeles[0]?.rol ?? '')
    return d !== 0 ? d : (a.nombre ?? '').localeCompare(b.nombre ?? '', 'es')
  })
}
