// Backfill del blind index de CONTACTO (`email_lookup_hash` y
// `telefono_lookup_hash`) en `clientes`, `cliente_emails` y `cliente_telefonos`.
//
// El PORQUÉ y la clasificación están en la pieza pura,
// `packages/module-seguros/src/backfill-contacto.ts`. Aquí sólo se hace lo que
// no se puede hacer sin claves ni BD: DESCIFRAR el valor y, cuando se pide
// expresamente, ESCRIBIR los hashes.
//
// ─── Reglas ──────────────────────────────────────────────────────────────────
// - `correduriaId` SIEMPRE explícito: con BYPASSRLS un id ajeno no falla, escribe
//   en otra correduría.
// - Ni el email ni el teléfono salen de esta app: se devuelven recuentos, ids y
//   grupos de ids. Un hash tampoco.
// - Sin `PII_LOOKUP_KEY` no se calcula NADA: `computeEmailLookupHash` devuelve
//   `null` en desarrollo sin clave, y eso se leería como «no hasheable» en todas
//   las filas. Se comprueba con un valor de prueba antes de clasificar.
// - Sin `PII_ENCRYPTION_KEY`, `decryptField` devuelve el cifrado TAL CUAL (no
//   lanza). Hashear eso escribiría un índice de basura que nunca casaría con
//   nada. Un valor que sigue empezando por `v1:` tras descifrar es `ilegible`.

import {
  decryptField,
  computeEmailLookupHash,
  computeTelefonoLookupHash,
} from '@central/module-seguros-pii'
import {
  planBackfillContacto,
  type CampoContacto,
  type FilaContacto,
  type PlanBackfillContacto,
} from '@central/module-seguros'
import { prismaAsegura } from './asegura-db'

export interface ResultadoBackfillContacto {
  resumen: PlanBackfillContacto['resumen']
  /** Grupos de fichas que comparten email. Candidatos a fusión (o un buzón familiar). */
  choques: PlanBackfillContacto['choques']
  /** Cuántos hashes se han escrito de verdad. `0` en seco. */
  escritos: number
  /** Filas que no se pudieron escribir pese a entrar en el plan (carrera con otra escritura). */
  fallidos: string[]
  /** Cuántas quedan por escribir tras esta pasada. `0` = terminado. */
  restantes: number
  seco: boolean
}

const TANDA = 500

/** `true` si con la configuración actual se puede calcular un hash. */
function hayClaveDeIndice(): boolean {
  try {
    return computeEmailLookupHash('sonda@sonda.test') !== null
  } catch {
    return false
  }
}

function hashDe(campo: CampoContacto, valor: string): string | null {
  return campo === 'email' ? computeEmailLookupHash(valor) : computeTelefonoLookupHash(valor)
}

/** Descifra en memoria. Devuelve `{ valor }` o `{ fallo: true }`; nunca el cifrado tal cual. */
function leer(v: string | null): { valor: string | null; fallo: boolean } {
  if (v === null || v.trim() === '') return { valor: null, fallo: false }
  if (!v.startsWith('v1:')) return { valor: v, fallo: false }
  try {
    const d = decryptField(v)
    if (d.startsWith('v1:')) return { valor: null, fallo: true }
    return { valor: d, fallo: false }
  } catch {
    return { valor: null, fallo: true }
  }
}

function aFila(
  id: string,
  origen: FilaContacto['origen'],
  campo: CampoContacto,
  cifrado: string | null,
  hashActual: string | null,
): FilaContacto {
  const l = leer(cifrado)
  return { id, origen, campo, valor: l.valor, descifradoFallido: l.fallo || undefined, hashActual }
}

export class SinClaveDeIndice extends Error {
  constructor() {
    super('PII_LOOKUP_KEY no está configurada: no se puede calcular ningún índice')
  }
}

/**
 * Lee TODAS las filas de la correduría con contacto, calcula el plan y —sólo si
 * `seco === false`— escribe los hashes que se pueden escribir.
 *
 * El plan se calcula siempre sobre la cartera ENTERA: un choque de email sólo
 * se ve mirando a todas las fichas a la vez.
 */
export async function backfillContactoLookupHash(
  correduriaId: string,
  opciones: { seco: boolean; limite?: number },
): Promise<ResultadoBackfillContacto> {
  if (!hayClaveDeIndice()) throw new SinClaveDeIndice()
  const db = prismaAsegura()

  const [fichas, emailsHijos, telefonosHijos] = await Promise.all([
    db.cliente.findMany({
      where: { correduriaId, mergedIntoClienteId: null },
      select: { id: true, email: true, emailLookupHash: true, telefono: true, telefonoLookupHash: true },
    }),
    db.clienteEmail.findMany({
      where: { correduriaId },
      select: { id: true, email: true, emailLookupHash: true },
    }),
    db.clienteTelefono.findMany({
      where: { correduriaId },
      select: { id: true, telefono: true, telefonoLookupHash: true },
    }),
  ])

  const filas: FilaContacto[] = []
  for (const f of fichas) {
    filas.push(aFila(f.id, 'ficha', 'email', f.email, f.emailLookupHash))
    filas.push(aFila(f.id, 'ficha', 'telefono', f.telefono, f.telefonoLookupHash))
  }
  for (const e of emailsHijos) filas.push(aFila(e.id, 'hija', 'email', e.email, e.emailLookupHash))
  for (const t of telefonosHijos) filas.push(aFila(t.id, 'hija', 'telefono', t.telefono, t.telefonoLookupHash))

  const plan = planBackfillContacto(filas, hashDe)
  const pendientes = plan.filas.filter(
    (f): f is typeof f & { destino: 'rellenable'; hash: string } => f.destino === 'rellenable' && f.hash !== null,
  )

  if (opciones.seco) {
    return { resumen: plan.resumen, choques: plan.choques, escritos: 0, fallidos: [], restantes: pendientes.length, seco: true }
  }

  const tope = opciones.limite !== undefined && opciones.limite > 0 ? opciones.limite : pendientes.length
  const aEscribir = pendientes.slice(0, tope)

  let escritos = 0
  const fallidos: string[] = []
  const destinos: [FilaContacto['origen'], CampoContacto][] = [
    ['ficha', 'email'],
    ['ficha', 'telefono'],
    ['hija', 'email'],
    ['hija', 'telefono'],
  ]
  for (const [origen, campo] of destinos) {
    const lote = aEscribir.filter((f) => f.origen === origen && f.campo === campo)
    for (let i = 0; i < lote.length; i += TANDA) {
      const tanda = lote.slice(i, i + TANDA)
      try {
        escritos += await escribirTanda(db, correduriaId, origen, campo, tanda)
      } catch (e) {
        // Una tanda entera se pierde por UNA fila: se repite de una en una para
        // saber cuál. Sólo debería pasar en una carrera con otra escritura.
        console.warn('[backfill-contacto] tanda rechazada, se reintenta fila a fila', e instanceof Error ? e.message : e)
        for (const fila of tanda) {
          try {
            escritos += await escribirTanda(db, correduriaId, origen, campo, [fila])
          } catch {
            fallidos.push(fila.id)
          }
        }
      }
    }
  }

  return {
    resumen: plan.resumen,
    choques: plan.choques,
    escritos,
    fallidos,
    restantes: pendientes.length - aEscribir.length,
    seco: false,
  }
}

/**
 * Un solo `UPDATE` para toda la tanda, contra la tabla y la columna que tocan.
 *
 * `<hash> is null` en el WHERE no es adorno: hace la escritura idempotente y a
 * prueba de carreras. `correduria_id` tampoco: con BYPASSRLS un id de otra
 * correduría no daría error, escribiría en su cartera. Sin prefijar el schema:
 * la conexión ya trae `?schema=seguros` (lib/asegura-url.ts).
 */
async function escribirTanda(
  db: ReturnType<typeof prismaAsegura>,
  correduriaId: string,
  origen: FilaContacto['origen'],
  campo: CampoContacto,
  tanda: { id: string; hash: string }[],
): Promise<number> {
  const ids = tanda.map((t) => t.id)
  const hashes = tanda.map((t) => t.hash)
  if (origen === 'ficha' && campo === 'email') {
    return db.$executeRaw`
      update clientes c set email_lookup_hash = v.hash
        from (select unnest(${ids}::uuid[]) as id, unnest(${hashes}::text[]) as hash) v
       where c.id = v.id and c.correduria_id = ${correduriaId}::uuid and c.email_lookup_hash is null`
  }
  if (origen === 'ficha') {
    return db.$executeRaw`
      update clientes c set telefono_lookup_hash = v.hash
        from (select unnest(${ids}::uuid[]) as id, unnest(${hashes}::text[]) as hash) v
       where c.id = v.id and c.correduria_id = ${correduriaId}::uuid and c.telefono_lookup_hash is null`
  }
  if (campo === 'email') {
    return db.$executeRaw`
      update cliente_emails e set email_lookup_hash = v.hash
        from (select unnest(${ids}::uuid[]) as id, unnest(${hashes}::text[]) as hash) v
       where e.id = v.id and e.correduria_id = ${correduriaId}::uuid and e.email_lookup_hash is null`
  }
  return db.$executeRaw`
    update cliente_telefonos t set telefono_lookup_hash = v.hash
      from (select unnest(${ids}::uuid[]) as id, unnest(${hashes}::text[]) as hash) v
     where t.id = v.id and t.correduria_id = ${correduriaId}::uuid and t.telefono_lookup_hash is null`
}
