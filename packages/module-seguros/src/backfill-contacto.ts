/**
 * Backfill del blind index de CONTACTO: `email_lookup_hash` y
 * `telefono_lookup_hash`, en la ficha (`clientes`) y en las tablas hijas
 * (`cliente_emails`, `cliente_telefonos`).
 *
 * EL PROBLEMA (medido 08/09/2026, buscando un email en `/correduria`): el
 * buscador encuentra un email o un teléfono SOLO por su hash — el valor va
 * cifrado y no se puede hacer `LIKE` sobre él. Y hay filas con el dato guardado
 * y el hash a NULL: **250 fichas con email y 100 emails secundarios**, **91
 * fichas con teléfono y 1 secundario**. Para esas, teclear el correo correcto
 * devuelve «nadie coincide», que se lee como «no es cliente» cuando lo que pasa
 * es que la ficha es invisible al índice.
 *
 * Es el hermano pequeño de `backfill-dni.ts`, con UNA diferencia que manda el
 * diseño: `uq_clientes_email_lookup_hash` es **UNIQUE sobre `clientes.email_lookup_hash`**
 * (toda la tabla, sin filtro por tipo). Dos fichas con el mismo correo no
 * pueden tener las dos su hash: escribir la segunda revienta, y [Probable] es
 * justo por lo que faltan — el importador se comió el conflicto. Igual que con
 * el DNI, **el choque es un hallazgo**, no un estorbo: dos fichas con el mismo
 * correo son la misma persona dos veces, o una familia compartiendo buzón, y
 * eso lo decide una persona, no un endpoint. Se devuelven como grupos y no se
 * escriben. El teléfono y las tablas hijas no tienen índice único (un móvil
 * identifica un HOGAR, no a una persona: 740 números compartidos por 1.599
 * fichas), así que ahí se escribe todo lo que descifra.
 *
 * TRES ESTADOS, NO DOS: una fila cuyo valor no descifra es `ilegible`, jamás
 * «sin dato». Y una fila cuyo valor descifra pero no produce hash (un teléfono
 * sin un solo dígito, un email en blanco tras el trim) es `no_hasheable`: el
 * dato está, pero no hay cómo indexarlo — y eso también se dice.
 */

export type CampoContacto = 'email' | 'telefono'
export type OrigenContacto = 'ficha' | 'hija'

/** Una fila tal y como llega de la BD, con el valor YA descifrado por el caller. */
export interface FilaContacto {
  /** Id de la ficha (`origen='ficha'`) o de la fila hija (`origen='hija'`). */
  id: string
  origen: OrigenContacto
  campo: CampoContacto
  /** Valor descifrado. `null` si no hay, o si no se pudo descifrar. */
  valor: string | null
  /** `true` si el descifrado FALLÓ (clave mala, campo corrupto). Distinto de «no tiene». */
  descifradoFallido?: boolean
  /** Hash que la fila ya tiene guardado, si lo tiene. */
  hashActual: string | null
  /**
   * Solo email: los hashes de sus MITADES (dominio y usuario) que la fila ya
   * tiene. Sirven a la búsqueda parcial («@gmail.com», «alberto.suarez@») y
   * nacieron el 08/09/2026, así que el corpus entero los tiene a NULL.
   */
  derivadosActuales?: Derivados
}

/** Hashes del dominio y del usuario de un email. `null` en cada uno = no se sabe / no hay. */
export type Derivados = { dominio: string | null; usuario: string | null }

export type DestinoContacto = 'ya_tiene' | 'sin_dato' | 'ilegible' | 'no_hasheable' | 'rellenable' | 'choca'

export interface FilaPlanContacto {
  id: string
  origen: OrigenContacto
  campo: CampoContacto
  destino: DestinoContacto
  /** Hash a escribir. Solo en `rellenable`. */
  hash: string | null
  /**
   * Mitades a escribir (solo email). Se rellenan aunque el hash principal ya
   * exista o choque: no tienen índice único, y sin ellas la búsqueda parcial
   * no ve la ficha. `null` = nada que escribir.
   */
  derivados: Derivados | null
}

export interface GrupoChoqueContacto {
  /** Fichas (`origen='ficha'`, campo email) que comparten el mismo correo. */
  fichas: string[]
  /** Alguna ya tiene el hash escrito: las demás son las que chocaron contra ella. */
  hayPreexistente: boolean
}

export interface CuentaContacto {
  total: number
  yaTiene: number
  sinDato: number
  ilegibles: number
  noHasheables: number
  rellenables: number
  /** Solo puede ser > 0 en `email`: es el único con índice único. */
  enChoque: number
  /** Solo email: filas legibles a las que les falta el hash del dominio o del usuario. */
  derivadosPendientes: number
}

export interface PlanBackfillContacto {
  filas: FilaPlanContacto[]
  resumen: { email: CuentaContacto; telefono: CuentaContacto }
  choques: GrupoChoqueContacto[]
}

function cuentaVacia(): CuentaContacto {
  return { total: 0, yaTiene: 0, sinDato: 0, ilegibles: 0, noHasheables: 0, rellenables: 0, enChoque: 0, derivadosPendientes: 0 }
}

/**
 * Clasifica cada fila y calcula el hash de las que se pueden escribir.
 *
 * `hashDe` es la función de blind index del campo (HMAC con `PII_LOOKUP_KEY`),
 * inyectada para que esto sea puro y testeable. Debe devolver `null` cuando el
 * valor normalizado queda vacío; si devuelve `null` para TODO porque falta la
 * clave, eso lo detecta el caller ANTES de llamar aquí — este plan no puede
 * distinguir «sin clave» de «sin dígitos».
 */
export function planBackfillContacto(
  filas: FilaContacto[],
  hashDe: (campo: CampoContacto, valor: string) => string | null,
  /** Mitades de un email. Si no se pasa, no se planifica ninguna. */
  derivadosDe?: (valor: string) => Derivados | null,
): PlanBackfillContacto {
  const resumen = { email: cuentaVacia(), telefono: cuentaVacia() }
  const plan: FilaPlanContacto[] = []

  // Para el choque del email en ficha: qué hash tiene ya cada ficha, y qué hash
  // querría escribir cada rellenable. Un hash presente en más de una ficha
  // (contando las que ya lo tienen) es un grupo.
  const fichasPorHashEmail = new Map<string, { id: string; preexistente: boolean }[]>()

  for (const f of filas) {
    const c = resumen[f.campo]
    c.total += 1
    if (f.hashActual !== null && f.hashActual !== '') {
      c.yaTiene += 1
      plan.push({ id: f.id, origen: f.origen, campo: f.campo, destino: 'ya_tiene', hash: null, derivados: derivadosPara(f, derivadosDe, resumen) })
      if (f.campo === 'email' && f.origen === 'ficha') apuntar(fichasPorHashEmail, f.hashActual, f.id, true)
      continue
    }
    if (f.descifradoFallido) {
      c.ilegibles += 1
      plan.push({ id: f.id, origen: f.origen, campo: f.campo, destino: 'ilegible', hash: null, derivados: null })
      continue
    }
    if (f.valor === null || f.valor.trim() === '') {
      c.sinDato += 1
      plan.push({ id: f.id, origen: f.origen, campo: f.campo, destino: 'sin_dato', hash: null, derivados: null })
      continue
    }
    const hash = hashDe(f.campo, f.valor)
    if (hash === null) {
      c.noHasheables += 1
      plan.push({ id: f.id, origen: f.origen, campo: f.campo, destino: 'no_hasheable', hash: null, derivados: derivadosPara(f, derivadosDe, resumen) })
      continue
    }
    plan.push({ id: f.id, origen: f.origen, campo: f.campo, destino: 'rellenable', hash, derivados: derivadosPara(f, derivadosDe, resumen) })
    if (f.campo === 'email' && f.origen === 'ficha') apuntar(fichasPorHashEmail, hash, f.id, false)
  }

  // Segunda pasada: los emails de ficha cuyo hash comparte más de una ficha
  // pasan de `rellenable` a `choca`. Los que YA lo tienen se quedan como están:
  // no se les quita nada, solo se cuenta el grupo.
  const choques: GrupoChoqueContacto[] = []
  const chocan = new Set<string>()
  for (const grupo of fichasPorHashEmail.values()) {
    if (grupo.length < 2) continue
    choques.push({ fichas: grupo.map((g) => g.id), hayPreexistente: grupo.some((g) => g.preexistente) })
    for (const g of grupo) if (!g.preexistente) chocan.add(g.id)
  }
  for (const p of plan) {
    if (p.campo === 'email' && p.origen === 'ficha' && p.destino === 'rellenable' && chocan.has(p.id)) {
      p.destino = 'choca'
      p.hash = null
      resumen.email.enChoque += 1
    }
  }
  for (const p of plan) if (p.destino === 'rellenable') resumen[p.campo].rellenables += 1

  return { filas: plan, resumen, choques }
}

/**
 * Qué mitades hay que escribir en esta fila: las que se pueden calcular y aún
 * no están. Solo email; una fila con las dos ya puestas devuelve `null`.
 */
function derivadosPara(
  f: FilaContacto,
  derivadosDe: ((valor: string) => Derivados | null) | undefined,
  resumen: { email: CuentaContacto },
): Derivados | null {
  if (f.campo !== 'email' || derivadosDe === undefined) return null
  if (f.valor === null || f.valor.trim() === '') return null
  const calc = derivadosDe(f.valor)
  if (calc === null) return null
  const actual = f.derivadosActuales ?? { dominio: null, usuario: null }
  const dominio = actual.dominio === null ? calc.dominio : null
  const usuario = actual.usuario === null ? calc.usuario : null
  if (dominio === null && usuario === null) return null
  resumen.email.derivadosPendientes += 1
  return { dominio, usuario }
}

function apuntar(
  mapa: Map<string, { id: string; preexistente: boolean }[]>,
  hash: string,
  id: string,
  preexistente: boolean,
): void {
  const lista = mapa.get(hash)
  if (lista) lista.push({ id, preexistente })
  else mapa.set(hash, [{ id, preexistente }])
}
