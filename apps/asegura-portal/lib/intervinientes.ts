// Pólizas AJENAS donde la identidad FIGURA como interviniente (27/09/2026).
//
// Decisión de Alberto: si una persona figura en `seguros.poliza_intervinientes`
// de una póliza —propietaria del coche, conductor habitual u ocasional,
// asegurada…— tiene derecho a ver ESA póliza con los mismos datos que ve el
// tomador, y a dar un parte de ella. Caso fundacional: Nieves es PROPIETARIA
// del Toyota cuya póliza tiene de tomador a Víctor, y no la veía.
//
// Aquí vive la regla PURA (qué pólizas, con qué nivel, qué papel); la lectura de
// la BD está en `carteraDeIdentidad` (`lib/cartera-lectura.ts`), que parte de
// `portal_vinculo` de la identidad y solo busca intervinientes cuyo `cliente_id`
// es una ficha PROPIA de ella. Las reglas que esto fija, cada una con su test:
//
//   1. Solo la póliza donde figura: jamás «las demás del tomador».
//   2. Si el tomador es propio, no es de aquí (ya está en `propias`).
//   3. Si la póliza ya se sirve por otro camino (autorización, empresa del
//      dueño), no se duplica.
//   4. Nivel = el MÁS ALTO de los vínculos propios que figuran en esa póliza.
//   5. Los campos son los del tomador en ese nivel, MENOS lo que es de la
//      PERSONA del tomador y no del contrato: IBAN, DNI, documentos, y actuar
//      por él (peticiones, autorizar a terceros). Figurar en su póliza no te
//      convierte en él.

import { camposVisibles, type CamposVisibles, type Nivel } from '@central/module-seguros-portal'

// La regla de «qué pólizas ajenas abre figurar en ellas» vive PURA en `@central/module-seguros-portal`
// (`figuras-en-polizas.ts`) desde el 04/10/2026: la usan esta cartera Y el puente de asegura
// (`/api/portal/personas-poliza`), y una copia en cada sitio podría divergir sin que nada avisara.
export { figurasEnPolizas, nivelMasAlto, ordenarRoles } from '@central/module-seguros-portal'
export type { FilaInterviniente, PolizaDeTomador, FiguraEnPoliza } from '@central/module-seguros-portal'
import { ordenarRoles, type FilaInterviniente, type PolizaDeTomador } from '@central/module-seguros-portal'

/**
 * Lo que ve un interviniente: lo del tomador en ese nivel, sin lo que es de la
 * PERSONA del tomador. Hoy ninguna pantalla del portal pinta IBAN ni DNI (el
 * schema del portal ni siquiera declara esas columnas), pero el flag se apaga
 * aquí para que el día que alguien los pinte por `CamposVisibles`, un
 * interviniente no los herede.
 */
export function camposDeInterviniente(nivel: Nivel): CamposVisibles {
  return capaInterviniente(camposVisibles(nivel))
}

/** Lo mismo sobre unos campos ya decididos (una autorización, la empresa del dueño). */
export function capaInterviniente(campos: CamposVisibles): CamposVisibles {
  return {
    ...campos,
    iban: false,
    dniTomador: false,
    documentos: false,
    crearPeticiones: false,
    autorizarTerceros: false,
  }
}

const ROL_LEGIBLE: Record<string, string> = {
  tomador: 'tomador',
  propietario: 'propietario',
  asegurado: 'asegurado',
  conductor_habitual: 'conductor habitual',
  conductor_ocasional: 'conductor ocasional',
  pagador: 'pagador',
  beneficiario: 'beneficiario',
  contacto: 'persona de contacto',
}

/** «propietario y conductor ocasional». Un papel que no se conoce sale tal cual, sin guiones bajos. */
export function rolesLegibles(roles: readonly string[]): string {
  const t = ordenarRoles(roles).map((r) => ROL_LEGIBLE[r] ?? r.replace(/_/g, ' '))
  if (t.length <= 1) return t[0] ?? ''
  return `${t.slice(0, -1).join(', ')} y ${t[t.length - 1]}`
}

/**
 * La FIGURA de la identidad en cada póliza PROPIA (28/09/2026). Alberto: «hay que
 * indicar en la app la figura que tiene en la póliza». En una propia es siempre
 * tomador, más los papeles con que figure además en `poliza_intervinientes`
 * (Víctor: tomador y conductor habitual de su Toyota). Solo cuentan filas cuyo
 * `clienteId` es una ficha propia: el papel de OTRA persona en su póliza no es suyo.
 */
export function figuraEnPropias(args: {
  polizaIds: readonly string[]
  filas: readonly FilaInterviniente[]
  propiosIds: readonly string[]
}): Map<string, string[]> {
  const suyos = rolesPropiosPorPoliza(args.filas, args.propiosIds)
  return new Map(args.polizaIds.map((id) => [id, ordenarRoles(['tomador', ...(suyos.get(id) ?? [])])]))
}

/**
 * Papeles de las fichas PROPIAS en cualquier póliza, sin «tomador». Sirve para las que la
 * identidad ve por otro camino y donde ADEMÁS figura: caso real (28/09/2026): coche
 * de su sociedad con él de conductor habitual según CIMA; la ve como dueño, pero su
 * figura en el contrato es la de conductor, y eso es lo que se le dice.
 */
export function rolesPropiosPorPoliza(
  filas: readonly FilaInterviniente[],
  propiosIds: readonly string[],
): Map<string, string[]> {
  const propios = new Set(propiosIds)
  const out = new Map<string, string[]>()
  for (const f of filas) {
    if (f.clienteId === null || !propios.has(f.clienteId)) continue
    out.set(f.polizaId, [...(out.get(f.polizaId) ?? []), f.rol])
  }
  for (const [id, roles] of out) out.set(id, ordenarRoles(roles))
  return out
}

/** «Tomador y conductor habitual»: para un chip, con mayúscula inicial. `''` si no hay papel. */
export function figuraChip(roles: readonly string[]): string {
  const t = rolesLegibles(roles)
  return t.charAt(0).toUpperCase() + t.slice(1)
}

/**
 * Pólizas de OTRO tomador donde figura una ficha que la identidad ya ve ENTERA
 * (autorizada sin póliza suelta, o empresa de la que es dueño). Alberto,
 * 28/09/2026: «toda persona que entre dentro de la póliza automáticamente le
 * aparece». Caso fundacional: la furgoneta de GLOBAL 2 (tomador, su conductor;
 * GLOBAL 2 propietaria y asegurada) no salía a quien ve GLOBAL 2 por permiso.
 *
 * Reglas, cada una con su test:
 *   1. Solo filas cuyo `clienteId` es una de `fichasVistas`: nunca «las demás del tomador».
 *   2. Si el tomador ya se sirve (propio, autorizado, empresa), no se repite aquí.
 *   3. Una póliza cuelga de UNA sola ficha vista (la primera de `fichasVistas`):
 *      dos fichas vistas en la misma póliza no la pintan dos veces.
 *
 * Devuelve, por ficha vista, `polizaId → papeles` de esa ficha en la póliza.
 */
export function figurasDeFichasVistas(args: {
  filas: readonly FilaInterviniente[]
  polizas: readonly PolizaDeTomador[]
  fichasVistas: readonly string[]
  tomadoresYaServidos: readonly string[]
}): Map<string, Map<string, string[]>> {
  const orden = new Map(args.fichasVistas.map((id, i) => [id, i]))
  const servidos = new Set(args.tomadoresYaServidos)
  const tomadorDe = new Map(args.polizas.map((p) => [p.id, p.clienteId]))
  const duena = new Map<string, string>()
  const roles = new Map<string, Set<string>>()
  for (const f of args.filas) {
    if (f.clienteId === null || !orden.has(f.clienteId)) continue
    const tomadorId = tomadorDe.get(f.polizaId)
    if (tomadorId === undefined || tomadorId === f.clienteId || servidos.has(tomadorId)) continue
    const actual = duena.get(f.polizaId)
    if (actual === undefined || (orden.get(f.clienteId) ?? 0) < (orden.get(actual) ?? 0)) {
      if (actual !== f.clienteId) roles.set(f.polizaId, new Set())
      duena.set(f.polizaId, f.clienteId)
    }
    if (duena.get(f.polizaId) === f.clienteId) roles.get(f.polizaId)?.add(f.rol)
  }
  const out = new Map<string, Map<string, string[]>>()
  for (const [polizaId, fichaId] of duena) {
    const m = out.get(fichaId) ?? new Map<string, string[]>()
    m.set(polizaId, ordenarRoles([...(roles.get(polizaId) ?? [])]))
    out.set(fichaId, m)
  }
  return out
}

/**
 * Pólizas donde una ficha vista ENTERA figura pero que NO se repiten en su bloque
 * porque ya se sirven al usuario como PROPIAS (caso Víctor/Nieves: ella es
 * `propietario` de una póliza cuyo tomador es él). Solo para decir «figura en N
 * póliza(s) que ya está(n) en las tuyas»: ni roles ni nombres ni datos nuevos.
 *
 * 🔒 Solo ids que ya se leyeron y se sirven (`polizasPropiasIds` = las que
 * `propias` ya trae, vivas y sin fusionar). Una póliza no viva, fusionada o sin
 * acceso NO está en esa lista y por tanto NO cuenta: no es un duplicado.
 */
export function figuraYaServidaEnPropias(args: {
  filas: readonly FilaInterviniente[]
  fichasVistas: readonly string[]
  polizasPropiasIds: readonly string[]
}): Map<string, string[]> {
  const vistas = new Set(args.fichasVistas)
  const propias = new Set(args.polizasPropiasIds)
  const out = new Map<string, Set<string>>()
  for (const f of args.filas) {
    if (f.clienteId === null || !vistas.has(f.clienteId) || !propias.has(f.polizaId)) continue
    const s = out.get(f.clienteId) ?? new Set<string>()
    s.add(f.polizaId)
    out.set(f.clienteId, s)
  }
  return new Map([...out].map(([id, s]) => [id, [...s].sort()]))
}

/** «Figura en 1 póliza que ya está en las tuyas». `null` si no hay ninguna (no se pinta). */
export function textoFiguraYaServida(n: number): string | null {
  if (n <= 0) return null
  return n === 1
    ? 'Figura en 1 póliza que ya está en las tuyas'
    : `Figura en ${n} pólizas que ya están en las tuyas`
}
