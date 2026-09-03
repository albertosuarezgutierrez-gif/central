// Quitar una persona de una póliza (`poliza_intervinientes`), desde plataforma.
//
// EL PORQUÉ (03/09/2026): Alberto, desde la ficha de Pilar Piña Franco, dijo
// «Matito no se puede borrar, es un error». Las dos mitades eran ciertas: la
// fila era basura del volcado, y borrarla era literalmente imposible — el
// puerto de operador tenía GET, POST y PATCH de cliente y **ningún DELETE** de
// intervinientes. Los 77 comodines se quitaron por un lote SQL
// (`prisma/sql/2026-09-03_purga_intervinientes_comodin_lote6.sql`); esto es
// para que el siguiente no necesite uno.
//
// ─── Reglas ──────────────────────────────────────────────────────────────────
// - `correduriaId` SIEMPRE explícito y comprobado ANTES de borrar: con BYPASSRLS
//   un id ajeno no falla, borra en otra correduría.
// - 🚨 **Una fila de CIMA no se borra: 409 `origen_cima`.** La ingesta la
//   volvería a crear en el siguiente pull, así que el botón prometería algo que
//   no puede cumplir — y por el camino se habría tirado dato bueno y vivo. Es la
//   misma guarda que salvó la fila buena de Matito en el lote 6.
// - REVERSIBLE: la fila entera va a `interviniente_purga_log` (`snapshot_before`,
//   append-only por trigger) ANTES de borrarla. Restaurar es un INSERT desde ese
//   jsonb. Si el snapshot falla, NO se borra: sin registro no hay vuelta atrás,
//   y eso no lo decide un botón. `cliente_id` del log admite NULL a propósito —
//   un interviniente puede no estar enlazado a ninguna ficha, y meter ahí el
//   `poliza_id` para rellenar sería un dato que miente.
// - Deja fila en `historial_interno` de la ficha afectada, sin datos de identidad.

import { prismaAsegura } from './asegura-db'

export interface ResultadoQuitar {
  ok: boolean
  estado: 'ok' | 'no_encontrado' | 'invalido' | 'error'
  motivo?: string
  status: number
}

const LOTE_MANUAL = 'quitado-desde-plataforma'

/**
 * Quita a una persona de UNA póliza. `intervinienteId` es la fila, no el cliente:
 * la misma persona puede intervenir en varias pólizas y solo se quita en la que
 * se está mirando.
 */
export async function quitarInterviniente(
  correduriaId: string,
  intervinienteId: string,
  entrada: { actor: string; motivo?: string },
): Promise<ResultadoQuitar> {
  if (intervinienteId.trim() === '') {
    return { ok: false, estado: 'invalido', motivo: 'falta intervinienteId', status: 422 }
  }
  try {
    const db = prismaAsegura()
    const fila = await db.polizaInterviniente.findFirst({
      where: { id: intervinienteId, correduriaId },
    })
    if (!fila) {
      return {
        ok: false,
        estado: 'no_encontrado',
        motivo: 'Esa persona no está en ninguna póliza de esta correduría.',
        status: 404,
      }
    }
    if (String(fila.origen) === 'cima') {
      return {
        ok: false,
        estado: 'invalido',
        motivo:
          'Esta línea la manda CIMA: si se borra, el siguiente pull la vuelve a crear. ' +
          'Para quitarla hay que corregirlo en la compañía.',
        status: 409,
      }
    }

    // Snapshot ANTES de borrar. Si esto falla, no se borra nada.
    try {
      // Sin prefijar el schema: la conexión de la cartera ya trae
      // `?schema=seguros` (lib/asegura-url.ts) y así lo escribe el resto de
      // libs. Además, un `seguros.x` en SQL crudo dispara el guardián de
      // aislamiento, que exige importar `lib/tenant` — y aquí el ámbito ya
      // viene comprobado por el `correduriaId` del WHERE.
      await db.$executeRaw`
        insert into interviniente_purga_log
          (correduria_id, tabla, fila_id, cliente_id, motivo, lote, actor, snapshot_before)
        select pi.correduria_id, 'poliza_intervinientes', pi.id, pi.cliente_id,
               ${entrada.motivo ?? 'quitado a mano desde la ficha de la póliza'},
               ${LOTE_MANUAL}, ${entrada.actor}, to_jsonb(pi)
        from poliza_intervinientes pi
        where pi.id = ${intervinienteId}::uuid and pi.correduria_id = ${correduriaId}::uuid`
    } catch (e) {
      return {
        ok: false,
        estado: 'error',
        motivo:
          'No se ha podido registrar la copia de seguridad de la línea, así que no se ha borrado: ' +
          (e instanceof Error ? e.message : String(e)),
        status: 500,
      }
    }

    const borradas = await db.polizaInterviniente.deleteMany({ where: { id: intervinienteId, correduriaId } })
    if (borradas.count === 0) {
      // Otra escritura se adelantó entre el snapshot y el borrado.
      return { ok: false, estado: 'no_encontrado', motivo: 'La línea ya no estaba.', status: 404 }
    }

    await anotar(
      correduriaId,
      fila.clienteId,
      `Persona quitada de la póliza ${fila.polizaId} (rol ${String(fila.rol)}) desde plataforma por ${entrada.actor}`,
    )
    return { ok: true, estado: 'ok', status: 200 }
  } catch (e) {
    return { ok: false, estado: 'error', motivo: e instanceof Error ? e.message : String(e), status: 500 }
  }
}

/** Best-effort: que el historial falle no deshace el borrado, pero se grita. */
async function anotar(correduriaId: string, clienteId: string | null, texto: string): Promise<void> {
  if (clienteId === null) return
  try {
    await prismaAsegura().$executeRaw`
      insert into historial_interno (correduria_id, cliente_id, tipo, texto)
      values (${correduriaId}::uuid, ${clienteId}::uuid, cast('gestion' as tipo_historial_interno), ${texto})`
  } catch (e) {
    console.error('[cartera-intervinientes] historial_interno no se pudo anotar:', e instanceof Error ? e.message : e)
  }
}
