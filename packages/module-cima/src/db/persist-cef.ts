/**
 * LOO-757 (épica CIMA LOO-515) — capa IMPURA de persistencia de la CUENTA DE EFECTIVO
 * / liquidaciones EIAC CEF (proceso 502). TODO lo que toca BD vive aquí. Implementa la
 * dep `persistCef` que el pipeline puro recibe por DI. Espejo de `persist-recibo.ts`.
 *
 * CEF = DATO FINANCIERO del corredor, **NO PII de persona física**. NO hay
 * Titular/IBAN de tercero que persistir → **NINGUNA columna se cifra** (a diferencia
 * de `persist-recibo.ts`). Si el EIAC trae un `FormaPago/Titular/PersonaFisica` + IBAN
 * embebido en una liquidación, NO se persiste (el mapper ni lo extrae).
 *
 * Patrón atómico (1 tx/fichero):
 *  - UPSERT `cuenta_efectivo` por la uq de negocio PARCIAL
 *    (correduria_id, codigo_entidad_dgs, periodo_inicio, periodo_fin
 *     WHERE codigo_entidad_dgs IS NOT NULL). El CEF de un periodo es un SNAPSHOT:
 *    el UPDATE refresca saldos/conceptos/hash. NO toca la clave de negocio ni origen.
 *  - DELETE + REINSERT de las `liquidaciones` (cascade a `liquidacion_movimientos`)
 *    de esa cuenta: CIMA es autoritativo sobre la composición del periodo. Idempotente.
 *  - Para cada movimiento: match best-effort recibo (poliza_recibos por idRecibo+dgs)
 *    + póliza (por idPoliza+dgs) → FK NULLABLE. Sin match → NO cuarentena (el registro
 *    financiero se guarda igual con FK null).
 *  - INSERT `operationalEvents` DENTRO de la tx (Art. 30). payload SIN PII (importes de
 *    negocio + ids/contadores; NUNCA IBAN — ni siquiera lo tenemos). sourceEventId
 *    determinista `${xmlHash}:${codigoEntidadDgs}:${periodoInicio}` + onConflictDoNothing.
 *
 * El matching (indexes recibo/poliza) lo construye el caller (pull-deps) ANTES, con los
 * candidatos del tenant; aquí persist solo los consulta.
 */

import { and, eq, sql } from "drizzle-orm";
import type { CimaDb } from "./conexion.ts";
import {
  cuentaEfectivo,
  liquidaciones,
  liquidacionMovimientos,
  operationalEvents,
  type NewCuentaEfectivo,
  type NewLiquidacion,
  type NewLiquidacionMovimiento,
} from "./schema.ts";
import { getIngestaCorreduriaId, guardEntidadAutorizada } from "./pull-persist.ts";
import {
  matchMovimientoPoliza,
  matchMovimientoRecibo,
} from "../cef-matching.ts";
import type { PersistCefInput, PersistCefResult } from "../ingest-pipeline.ts";
import { CODIGO_ENTIDAD_FORMATO_DESCONOCIDO } from "../codigo-entidad.ts";

/**
 * Test seam (patrón `dbc` de persist-recibo.ts): el persist usa `transaction` del
 * cliente Drizzle, y dentro de la tx `insert`/`delete`. En tests inyectamos un fake
 * sin BD (mock.module no funciona en tsx — `feedback_node_test_mock_module_no_tsx`).
 */
export type CefDbClient = Pick<CimaDb, "transaction" | "insert">;

function toDate(iso: string | null): Date | null {
  return iso ? new Date(iso) : null;
}

/** Payload de evento SIN PII. Importes/conceptos = dato de negocio del corredor, OK. */
function cefEventPayload(
  input: PersistCefInput,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  const { fichero, xmlHash, mapped } = input;
  return {
    nombreFichero: fichero.nombreFicheroComprimido,
    codigoEntidad: mapped.codigoEntidadDgs,
    periodoInicio: mapped.periodo.inicio,
    periodoFin: mapped.periodo.fin,
    // Conceptos/saldos = dato de NEGOCIO del corredor (no PII) → trazables en el audit.
    comisionesRecibos: mapped.conceptos.comisionesRecibos,
    retencionComisiones: mapped.conceptos.retencionComisiones,
    remesas: mapped.conceptos.remesas,
    saldoFinal: mapped.saldos.final,
    xmlHash,
    ...extra,
  };
}

/**
 * Persiste UNA cuenta de efectivo EIAC CEF en una transacción atómica. Implementa
 * `deps.persistCef` del pipeline.
 *  - `mapped.codigoEntidadDgs` null → review (sin clave de negocio para la uq).
 *  - presente → UPSERT cuenta (snapshot) + delete-reinsert liquidaciones/movimientos
 *    (match best-effort recibo/póliza, FK nullable) + op_event in-tx.
 */
export async function persistCimaCef(
  input: PersistCefInput,
  dbc: CefDbClient,
): Promise<PersistCefResult> {
  const { xmlHash, mapped, reciboIndex, polizaIndex } = input;
  const correduriaId = getIngestaCorreduriaId();

  // La idempotencia de la uq PARCIAL depende de `codigoEntidadDgs NOT NULL` (Postgres
  // trata NULLs como distintos en índices UNIQUE). Sin entidad → review (no se persiste).
  if (!mapped.codigoEntidadDgs) {
    // V07.1 — si `CodigoEntidad` vino pero con forma ilegible, el motivo lo dice
    // (≠ «falta»); mismo flujo de review.
    const reason = mapped.reviewReasons.includes(CODIGO_ENTIDAD_FORMATO_DESCONOCIDO)
      ? CODIGO_ENTIDAD_FORMATO_DESCONOCIDO
      : "falta_codigo_entidad_dgs";
    await dbc
      .insert(operationalEvents)
      .values({
        eventName: "cima_cef_review",
        source: "cima_ingestion",
        sourceEventId: `${xmlHash}:sin_entidad`,
        correduriaId,
        payload: cefEventPayload(input, { reason }),
      })
      .onConflictDoNothing({
        target: [operationalEvents.eventName, operationalEvents.sourceEventId],
      });
    return { ok: false, outcome: "review", reason };
  }

  // ── LOO-826 A1 — Tenant guard (fail-closed, hallazgo #18): espejo del guard que
  //    POL ya tenía en persistCimaFichero. CEF NO exige match de póliza (FK nullable)
  //    → un CEF de entidad NO autorizada persistía snapshot financiero SIN freno.
  //    Cortamos ANTES de cualquier escritura de datos (tras el check de dgs null,
  //    que conserva su reason específico). Outcome 'review' + op_event Art.30. ──────
  const guard = await guardEntidadAutorizada(input, "cef", correduriaId, dbc);
  if (guard) return guard;

  const codigoEntidadDgs = mapped.codigoEntidadDgs;
  const periodoInicio = toDate(mapped.periodo.inicio);
  const periodoFin = toDate(mapped.periodo.fin);

  try {
    const result = await dbc.transaction(async (tx) => {
      const cuentaValues = {
        correduriaId,
        codigoEntidadDgs,
        periodoInicio,
        periodoFin,
        // Saldos/conceptos = dato de negocio → claro (no hay nada que cifrar en CEF).
        saldoInicial: mapped.saldos.inicial,
        saldoFinal: mapped.saldos.final,
        recibosCobrados: mapped.conceptos.recibosCobrados,
        comisionesRecibos: mapped.conceptos.comisionesRecibos,
        retencionComisiones: mapped.conceptos.retencionComisiones,
        siniestrosPagados: mapped.conceptos.siniestrosPagados,
        otrosConceptos: mapped.conceptos.otrosConceptos,
        retencionOtros: mapped.conceptos.retencionOtros,
        remesas: mapped.conceptos.remesas,
        datosExtra: mapped.datosExtra ?? null,
        eiacXmlHash: xmlHash,
        origen: "cima" as const,
      } satisfies Partial<NewCuentaEfectivo>;

      // SNAPSHOT por periodo: upsert por la uq de negocio. El UPDATE refresca los
      // agregados (un periodo se re-emite con saldos/conceptos actualizados). NO toca
      // clave de negocio ni origen.
      const [cuenta] = await tx
        .insert(cuentaEfectivo)
        .values(cuentaValues as NewCuentaEfectivo)
        .onConflictDoUpdate({
          target: [
            cuentaEfectivo.correduriaId,
            cuentaEfectivo.codigoEntidadDgs,
            cuentaEfectivo.periodoInicio,
            cuentaEfectivo.periodoFin,
          ],
          // Predicado del índice ÚNICO PARCIAL (uq solo aplica a filas con entidad).
          targetWhere: sql`${cuentaEfectivo.codigoEntidadDgs} is not null`,
          set: {
            saldoInicial: cuentaValues.saldoInicial,
            saldoFinal: cuentaValues.saldoFinal,
            recibosCobrados: cuentaValues.recibosCobrados,
            comisionesRecibos: cuentaValues.comisionesRecibos,
            retencionComisiones: cuentaValues.retencionComisiones,
            siniestrosPagados: cuentaValues.siniestrosPagados,
            otrosConceptos: cuentaValues.otrosConceptos,
            retencionOtros: cuentaValues.retencionOtros,
            remesas: cuentaValues.remesas,
            datosExtra: cuentaValues.datosExtra,
            eiacXmlHash: cuentaValues.eiacXmlHash,
            updatedAt: new Date(),
          },
        })
        .returning({
          id: cuentaEfectivo.id,
          wasInserted: sql<boolean>`(xmax = 0)`,
        });

      const cuentaEfectivoId = cuenta.id;
      const yaExistia = !cuenta.wasInserted;

      // DELETE-REINSERT: CIMA es autoritativo sobre las liquidaciones del periodo. El
      // delete cascadea a liquidacion_movimientos (FK ON DELETE CASCADE). Si la cuenta
      // es alta (yaExistia=false) no hay nada que borrar, pero el delete es inocuo.
      await tx
        .delete(liquidaciones)
        .where(
          and(
            eq(liquidaciones.correduriaId, correduriaId),
            eq(liquidaciones.cuentaEfectivoId, cuentaEfectivoId),
          ),
        );

      let liquidacionesCount = 0;
      let movimientosCount = 0;
      let movimientosMatchedRecibo = 0;
      let movimientosMatchedPoliza = 0;

      for (const liq of mapped.liquidaciones) {
        const liqValues = {
          correduriaId,
          cuentaEfectivoId,
          idLiquidacionEntidad: liq.idLiquidacionEntidad,
          codigoEntidadDgs,
          estadoLiquidacion: liq.estado,
          fechaLiquidacion: toDate(liq.fechaLiquidacion),
          fechaPago: toDate(liq.fechaPago),
          importeRemesa: liq.importeRemesa,
          // mediador + claseFormaPago (nunca IBAN/Titular: el mapper no los lee).
          datosExtra: liq.datosExtra ?? null,
        } satisfies Partial<NewLiquidacion>;

        const [insertedLiq] = await tx
          .insert(liquidaciones)
          .values(liqValues as NewLiquidacion)
          .returning({ id: liquidaciones.id });
        const liquidacionId = insertedLiq.id;
        liquidacionesCount += 1;

        for (const mov of liq.movimientos) {
          // Match best-effort: FK nullable, NO cuarentena.
          const reciboId = matchMovimientoRecibo(
            mov.idReciboEiac,
            mov.codigoEntidadDgs,
            reciboIndex,
          );
          const polizaId = matchMovimientoPoliza(
            mov.idPolizaEntidad,
            mov.codigoEntidadDgs,
            polizaIndex,
          );
          if (reciboId) movimientosMatchedRecibo += 1;
          if (polizaId) movimientosMatchedPoliza += 1;

          const movValues = {
            correduriaId,
            liquidacionId,
            numeroOrden: mov.numeroOrden,
            fechaMovimiento: toDate(mov.fechaMovimiento),
            claseImporte: mov.claseImporte,
            importe: mov.importe,
            reciboId,
            polizaId,
            idReciboEiac: mov.idReciboEiac,
            // comisión liquidada, idRemesa/situación/clase del recibo y el bloque
            // contable (movimiento sin recibo). SIN PII.
            datosExtra: mov.datosExtra ?? null,
          } satisfies Partial<NewLiquidacionMovimiento>;

          await tx
            .insert(liquidacionMovimientos)
            .values(movValues as NewLiquidacionMovimiento);
          movimientosCount += 1;
        }
      }

      // operationalEvents DENTRO de la tx (Art. 30). payload SIN PII (NUNCA IBAN).
      // Alta → `cima_cef_persisted`; re-emisión del periodo (UPDATE) → mismo nombre con
      // yaExistia=true. Cada pull trae xmlHash distinto → sourceEventId único por pull.
      await tx
        .insert(operationalEvents)
        .values({
          eventName: "cima_cef_persisted",
          source: "cima_ingestion",
          sourceEventId: `${xmlHash}:${codigoEntidadDgs}:${mapped.periodo.inicio ?? "0"}`,
          correduriaId,
          payload: cefEventPayload(input, {
            cuentaEfectivoId,
            yaExistia,
            liquidacionesCount,
            movimientosCount,
            movimientosMatchedRecibo,
            movimientosMatchedPoliza,
          }),
        })
        .onConflictDoNothing({
          target: [operationalEvents.eventName, operationalEvents.sourceEventId],
        });

      return { cuentaEfectivoId, liquidacionesCount, movimientosCount };
    });

    return {
      ok: true,
      outcome: "persisted",
      cuentaEfectivoId: result.cuentaEfectivoId,
      liquidacionesCount: result.liquidacionesCount,
      movimientosCount: result.movimientosCount,
    };
  } catch (e) {
    const code = (e as { code?: string } | null)?.code;
    if (code === "23505") {
      // Violación de unicidad bajo carrera (la tx hizo rollback). Replay idempotente.
      return { ok: false, outcome: "error", reason: "unique_violation_replay" };
    }
    return {
      ok: false,
      outcome: "error",
      reason: e instanceof Error ? e.message : "persist_cef_unknown_error",
    };
  }
}
