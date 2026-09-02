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
  /** Quién es, cuando no es el tomador — para decir «📞 (Juan Manuel, conductor habitual)». */
  quien: { nombre: string | null; rol: string; fichaId: string | null } | null
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
      base.quien = { nombre: t.nombre, rol: t.rol, fichaId: t.fichaId }
    }
  }
  if (!base.email) {
    const e = otros.find((i) => i.email)
    if (e) {
      base.email = e.email
      base.viaEmail = 'interviniente'
      base.quien ??= { nombre: e.nombre, rol: e.rol, fichaId: e.fichaId }
    }
  }
  return base
}

function prioridad(rol: string): number {
  const i = PRIORIDAD_CONTACTO.indexOf(rol)
  return i === -1 ? PRIORIDAD_CONTACTO.length : i
}
