/**
 * LOO-753 (épica CIMA LOO-515) — capa IMPURA de persistencia de recibos EIAC REC.
 * Espejo de `persist-siniestro.ts`: TODO lo que toca BD/crypto vive aquí.
 * Implementa la dep `persistRecibo` que el pipeline puro recibe por DI.
 *
 * Patrón atómico (idéntico a persistCimaSiniestro):
 *  - UNA transacción por recibo. Fallo → rollback total (cero estado parcial).
 *  - UPSERT `poliza_recibos` (origen='cima' + trazabilidad EIAC) con
 *    `onConflictDoUpdate` sobre la uq de negocio PARCIAL
 *    (correduria_id, id_recibo, codigo_entidad_dgs WHERE id_recibo IS NOT NULL).
 *    ESTADO VIVO (LOO-755 patrón): un recibo cambia de situación
 *    (pendiente→cobrado→devuelto) entre pulls → el UPDATE refresca los campos
 *    MUTABLES (situación/fechas/importes/iban/comisiones/datos_extra). NO toca la
 *    clave de negocio, origen, eiacXmlHash ni los FK póliza/cliente.
 *  - **IBAN = PII Tier-1** → CIFRADO AES-256-GCM (`encryptFieldNullable`) tanto en
 *    el INSERT como en el SET del UPDATE. NUNCA en claro / logs / op_events.
 *    Primas/comisiones/cargos = dato de NEGOCIO → claro.
 *  - INSERT `operationalEvents` DENTRO de la tx (Art. 30 LOPD-GDD). payload SIN PII
 *    (NUNCA IBAN; ids/hashes/situación/importes-de-negocio). sourceEventId
 *    determinista `${xmlHash}:${idRecibo}` + onConflictDoNothing(eventName,
 *    sourceEventId). Alta → `cima_recibo_persisted`; cambio de estado →
 *    `cima_recibo_actualizado`. INSERT-vs-UPDATE vía `xmax = 0` en el RETURNING.
 *  - Sin match de póliza → NO inserta; outcome 'review' + evento
 *    `cima_recibo_sin_poliza_review` (payload sin PII). Cuarentena (D2).
 *
 * El matching (polizaId/clienteId) lo resuelve el pipeline ANTES vía
 * `matchReciboPoliza`; aquí persist confía en `match` (o null = cuarentena).
 */

import { sql } from "drizzle-orm";
import type { CimaDb } from "./conexion.ts";
import {
  operationalEvents,
  polizaRecibos,
  type NewPolizaRecibo,
} from "./schema.ts";
import { encryptFieldNullable } from "@central/module-seguros-pii";
import { getIngestaCorreduriaId, guardEntidadAutorizada } from "./pull-persist.ts";
import type {
  PersistReciboInput,
  PersistReciboResult,
} from "../ingest-pipeline.ts";

/**
 * Test seam (patrón `dbc` de persist-siniestro.ts): el persist usa SOLO
 * `transaction` + `insert` del cliente Drizzle. En tests inyectamos un fake sin BD
 * (mock.module no funciona en tsx — `feedback_node_test_mock_module_no_tsx`).
 */
export type ReciboDbClient = Pick<CimaDb, "transaction" | "insert">;

/** Payload de evento SIN PII (NUNCA IBAN). Importes = dato de negocio, OK. */
function reciboEventPayload(
  input: PersistReciboInput,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  const { fichero, xmlHash, mapped } = input;
  return {
    nombreFichero: fichero.nombreFicheroComprimido,
    codigoEntidad: mapped.codigoEntidadDgs,
    idRecibo: mapped.idRecibo,
    idPolizaEntidad: mapped.idPolizaEntidad,
    situacion: mapped.situacion,
    claseRecibo: mapped.claseRecibo,
    // Importes = dato de NEGOCIO del recibo (no PII) → trazables en el audit.
    primaTotal: mapped.primaTotal,
    formaPago: mapped.formaPago,
    xmlHash,
    ...extra,
  };
}

/**
 * Persiste UN recibo EIAC REC en una transacción atómica. Implementa
 * `deps.persistRecibo` del pipeline.
 *  - `input.match` null → cuarentena: NO inserta, emite review event, outcome 'review'.
 *  - `input.match` presente → UPSERT recibo (estado vivo, IBAN cifrado) + op_event in-tx.
 */
export async function persistCimaRecibo(
  input: PersistReciboInput,
  dbc: ReciboDbClient,
): Promise<PersistReciboResult> {
  const { xmlHash, mapped, match } = input;
  const correduriaId = getIngestaCorreduriaId();

  // ── Cuarentena (D2): sin póliza en cartera → NO se persiste, solo audit Art.30 ──
  if (!match) {
    await dbc
      .insert(operationalEvents)
      .values({
        eventName: "cima_recibo_sin_poliza_review",
        source: "cima_ingestion",
        sourceEventId: `${xmlHash}:${mapped.idRecibo ?? "0"}`,
        correduriaId,
        payload: reciboEventPayload(input, { reason: input.motivoSinMatch ?? "sin_poliza_en_cartera" }),
      })
      .onConflictDoNothing({
        target: [operationalEvents.eventName, operationalEvents.sourceEventId],
      });
    return { ok: false, outcome: "review", reason: input.motivoSinMatch ?? "sin_poliza_en_cartera" };
  }

  // Invariantes que el pipeline garantiza para outcome 'ok' (defensa en profundidad).
  if (!mapped.idRecibo) {
    return { ok: false, outcome: "review", reason: "falta_id_recibo" };
  }
  // La idempotencia de la `uq` PARCIAL (correduria, idRecibo, codigoEntidadDgs)
  // depende de `codigoEntidadDgs NOT NULL`: Postgres trata NULLs como distintos en
  // índices UNIQUE → un re-pull con DGS null insertaría duplicado en vez de
  // deduplicar. Hoy `matchReciboPoliza` exige DGS non-null (sin DGS → cuarentena,
  // nunca llega aquí), pero blindamos el invariante en el chokepoint de escritura.
  if (!mapped.codigoEntidadDgs) {
    return { ok: false, outcome: "review", reason: "falta_codigo_entidad_dgs" };
  }

  // ── LOO-826 A1 — Tenant guard (fail-closed, hallazgo #18): espejo del guard que
  //    POL ya tenía en persistCimaFichero. Un REC de entidad NO autorizada puede
  //    matchear una póliza LEGACY de cartera y persistir (con IBAN) → cortamos
  //    ANTES de la tx (tras los checks de invariantes, que conservan sus reasons
  //    específicos). Outcome 'review' (cuarentena humana) + op_event Art.30. ──────
  const guard = await guardEntidadAutorizada(input, "recibo", correduriaId, dbc);
  if (guard) return guard;

  const idRecibo = mapped.idRecibo;
  const codigoEntidadDgs = mapped.codigoEntidadDgs;
  const { polizaId, clienteId } = match;

  try {
    const result = await dbc.transaction(async (tx) => {
      // PII Tier-1 (IBAN del recibo, Art.14) cifrada AES-256-GCM. Se cifra UNA vez
      // y se reusa el cipher tanto en el INSERT como en el SET del UPDATE (re-cifrar
      // rompería la simetría, igual que `lugarDireccion` en persist-siniestro).
      const ibanCipher = encryptFieldNullable(mapped.iban) ?? null;

      const reciboValues = {
        correduriaId,
        polizaId,
        idRecibo,
        codigoEntidadDgs,
        situacion: mapped.situacion,
        claseRecibo: mapped.claseRecibo,
        fechaEfectoInicial: mapped.fechaEfectoInicial
          ? new Date(mapped.fechaEfectoInicial)
          : null,
        fechaEfectoActual: mapped.fechaEfectoActual
          ? new Date(mapped.fechaEfectoActual)
          : null,
        fechaVencimiento: mapped.fechaVencimiento
          ? new Date(mapped.fechaVencimiento)
          : null,
        fechaEmision: mapped.fechaEmision ? new Date(mapped.fechaEmision) : null,
        fechaSituacion: mapped.fechaSituacion
          ? new Date(mapped.fechaSituacion)
          : null,
        // Importes/comisiones/forma de pago = dato de negocio → claro.
        primaTotal: mapped.primaTotal,
        primaNeta: mapped.primaNeta,
        formaPago: mapped.formaPago,
        // ⚠️ IBAN CIFRADO (PII Tier-1).
        iban: ibanCipher,
        comisionBruta: mapped.comisionBruta,
        comisionLiquida: mapped.comisionLiquida,
        claseComision: mapped.claseComision ?? null,
        baseComision: mapped.baseComision ?? null,
        retencionIrpf: mapped.retencionIrpf ?? null,
        idRemesa: mapped.idRemesa ?? null,
        gestionCobro: mapped.gestionCobro ?? null,
        datosExtra: mapped.datosExtra,
        eiacXmlHash: xmlHash,
        origen: "cima" as const,
      } satisfies Partial<NewPolizaRecibo>;

      // ESTADO VIVO (patrón LOO-755): un recibo cambia de situación entre pulls →
      // el UPDATE refresca los campos MUTABLES. NO tocamos clave de negocio, origen
      // ni los FK (un recibo no se reasigna a otra póliza).
      const [upserted] = await tx
        .insert(polizaRecibos)
        .values(reciboValues as NewPolizaRecibo)
        .onConflictDoUpdate({
          target: [
            polizaRecibos.correduriaId,
            polizaRecibos.idRecibo,
            polizaRecibos.codigoEntidadDgs,
          ],
          // Predicado del índice ÚNICO PARCIAL (uq solo aplica a filas con id_recibo).
          targetWhere: sql`${polizaRecibos.idRecibo} is not null`,
          set: {
            situacion: reciboValues.situacion,
            claseRecibo: reciboValues.claseRecibo,
            fechaEfectoInicial: reciboValues.fechaEfectoInicial,
            fechaEfectoActual: reciboValues.fechaEfectoActual,
            fechaVencimiento: reciboValues.fechaVencimiento,
            fechaEmision: reciboValues.fechaEmision,
            fechaSituacion: reciboValues.fechaSituacion,
            primaTotal: reciboValues.primaTotal,
            primaNeta: reciboValues.primaNeta,
            formaPago: reciboValues.formaPago,
            // IBAN ya viene CIFRADO en reciboValues (re-cifrar rompería la simetría).
            iban: reciboValues.iban,
            comisionBruta: reciboValues.comisionBruta,
            comisionLiquida: reciboValues.comisionLiquida,
            claseComision: reciboValues.claseComision,
            baseComision: reciboValues.baseComision,
            retencionIrpf: reciboValues.retencionIrpf,
            idRemesa: reciboValues.idRemesa,
            gestionCobro: reciboValues.gestionCobro,
            datosExtra: reciboValues.datosExtra,
            eiacXmlHash: reciboValues.eiacXmlHash,
            updatedAt: new Date(),
          },
        })
        // INSERT vs UPDATE: `xmax = 0` ⇒ fila recién insertada (alta); `xmax ≠ 0` ⇒
        // existía y el conflicto la actualizó (cambio de estado).
        .returning({
          id: polizaRecibos.id,
          wasInserted: sql<boolean>`(xmax = 0)`,
        });

      const reciboId = upserted.id;
      const yaExistia = !upserted.wasInserted;

      // operationalEvents DENTRO de la tx (Art. 30). payload SIN PII (NUNCA IBAN).
      // Alta → `cima_recibo_persisted`; cambio de estado (UPDATE) →
      // `cima_recibo_actualizado`. Cada pull trae xmlHash distinto →
      // `${xmlHash}:${idRecibo}` único por pull; onConflictDoNothing dedup el replay.
      await tx
        .insert(operationalEvents)
        .values({
          eventName: yaExistia
            ? "cima_recibo_actualizado"
            : "cima_recibo_persisted",
          source: "cima_ingestion",
          sourceEventId: `${xmlHash}:${idRecibo}`,
          correduriaId,
          payload: reciboEventPayload(input, {
            reciboId,
            polizaId,
            clienteId,
            yaExistia,
          }),
        })
        .onConflictDoNothing({
          target: [operationalEvents.eventName, operationalEvents.sourceEventId],
        });

      return { reciboId };
    });

    return { ok: true, outcome: "persisted", reciboId: result.reciboId };
  } catch (e) {
    const code = (e as { code?: string } | null)?.code;
    if (code === "23505") {
      // Violación de unicidad bajo carrera (la tx hizo rollback). Replay idempotente.
      return { ok: false, outcome: "error", reason: "unique_violation_replay" };
    }
    return {
      ok: false,
      outcome: "error",
      reason: e instanceof Error ? e.message : "persist_recibo_unknown_error",
    };
  }
}
