/**
 * LOO-750 (épica CIMA LOO-515) — capa IMPURA de persistencia de siniestros EIAC
 * SIN. Espejo de `pull-persist.ts` (`persistCimaFichero`): TODO lo que toca
 * BD/crypto vive aquí. Implementa la dep `persistSiniestro` que el pipeline puro
 * recibe por DI.
 *
 * Patrón atómico (idéntico a persistCimaFichero):
 *  - UNA transacción por siniestro. Fallo → rollback total (cero estado parcial).
 *  - UPSERT `siniestros` (origen='cima' + trazabilidad EIAC) con
 *    `onConflictDoUpdate` sobre la uq de negocio PARCIAL
 *    (correduria_id, id_siniestro_entidad, codigo_entidad_dgs WHERE
 *    id_siniestro_entidad IS NOT NULL). LOO-755: un movimiento (fichero 361) sobre
 *    un siniestro ya ingestado (apertura 311) hace UPDATE de los campos MUTABLES
 *    (estado/fecha/tipo/lugar) para que el estado no quede obsoleto. NO toca la
 *    clave de negocio, origen, eiacXmlHash ni los FK póliza/cliente.
 *  - N INSERTs en subtablas de terceros (contrarios/testigos/lesionados) con PII
 *    Tier-1 CIFRADA (`encryptFieldNullable`: nombre/telefono/matricula) — Art.14 RGPD.
 *    SOLO en la apertura (INSERT real). Un movimiento NO re-inserta ni actualiza
 *    figuras (D8: idempotencia de terceros; no duplicar). Detectamos INSERT vs
 *    UPDATE con `xmax = 0` en el RETURNING (truco Postgres: fila recién insertada
 *    ⇒ xmax=0; fila actualizada por el conflicto ⇒ xmax≠0).
 *  - INSERT `operationalEvents` DENTRO de la tx (Art. 30 LOPD-GDD). payload SIN PII
 *    (solo ids/hashes/contadores). sourceEventId determinista
 *    `${xmlHash}:${idSiniestroEntidad}` + onConflictDoNothing(eventName, sourceEventId).
 *    Apertura → `cima_siniestro_persisted`; movimiento → `cima_siniestro_actualizado`.
 *  - Sin match de póliza → NO inserta; devuelve outcome 'review' + evento
 *    `cima_siniestro_sin_poliza_review` (payload sin PII). El siniestro queda en
 *    cuarentena (D2): no se inventa la FK NOT NULL a póliza/cliente.
 *
 * El matching (polizaId/clienteId) lo resuelve el pipeline ANTES vía
 * `matchSiniestroPoliza`; aquí persist confía en `match` (o null = cuarentena).
 */

import { eq, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { CimaDb } from "./conexion.ts";
import {
  cimaFicheros,
  operationalEvents,
  siniestros,
  siniestroContrarios,
  siniestroLesionados,
  siniestroTestigos,
  type NewSiniestro,
} from "./schema.ts";
import { decryptFieldNullable, encryptFieldNullable } from "@central/module-seguros-pii";
import { getIngestaCorreduriaId, guardEntidadAutorizada } from "./pull-persist.ts";
import { columnaExiste } from "./columna-opcional.ts";
import { CIMA_EXTRA_MAX, type CimaExtraEntrada } from "../cima-extra.ts";
import { fusionarTercerosCima } from "../figuras-cima-pii.ts";
import type { FiguraCima } from "../figuras-cima.ts";
import type {
  PersistSiniestroInput,
  PersistSiniestroResult,
} from "../ingest-pipeline.ts";
import type {
  EiacSinMapped,
  MappedAccion,
  MappedAsistencia,
  MappedFigura,
  MappedFiguraNombrada,
} from "../eiac-sin-mapper.ts";

/**
 * Test seam (patrón `dbc` de broker-submit/persist-with-audit.ts): el persist usa
 * SOLO `transaction` + `insert` del cliente Drizzle. En tests inyectamos un fake
 * sin BD (mock.module no funciona en tsx — memoria `feedback_node_test_mock_module_no_tsx`).
 */
export type SiniestroDbClient = Pick<CimaDb, "transaction" | "insert">;

/** Payload de evento SIN PII. */
function siniestroEventPayload(
  input: PersistSiniestroInput,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  const { fichero, xmlHash, mapped } = input;
  return {
    nombreFichero: fichero.nombreFicheroComprimido,
    codigoEntidad: mapped.codigoEntidadDgs,
    idSiniestroEntidad: mapped.idSiniestroEntidad,
    idPolizaEntidad: mapped.idPolizaEntidad,
    estado: mapped.estado,
    figurasCount: mapped.figuras.length,
    // Conteo de lesionados (M1): señal operativa no-PII (entero) que se perdía del
    // audit trail cuando llegaba como `Numero` sin detalle de persona.
    numeroLesionados: mapped.numeroLesionados,
    xmlHash,
    ...extra,
  };
}

/**
 * Persiste UN siniestro EIAC SIN en una transacción atómica. Implementa
 * `deps.persistSiniestro` del pipeline.
 *  - `input.match` null → cuarentena: NO inserta, emite review event, outcome 'review'.
 *  - `input.match` presente → INSERT siniestro + terceros cifrados + op_event in-tx.
 */
export async function persistCimaSiniestro(
  input: PersistSiniestroInput,
  dbc: SiniestroDbClient,
): Promise<PersistSiniestroResult> {
  const { xmlHash, mapped, match } = input;
  const correduriaId = getIngestaCorreduriaId();

  // ── Cuarentena (D2): sin póliza en cartera → NO se persiste, solo audit Art.30 ──
  if (!match) {
    await dbc
      .insert(operationalEvents)
      .values({
        eventName: "cima_siniestro_sin_poliza_review",
        source: "cima_ingestion",
        sourceEventId: `${xmlHash}:${mapped.idSiniestroEntidad ?? "0"}`,
        correduriaId,
        payload: siniestroEventPayload(input, { reason: input.motivoSinMatch ?? "sin_poliza_en_cartera" }),
      })
      .onConflictDoNothing({
        target: [operationalEvents.eventName, operationalEvents.sourceEventId],
      });
    return { ok: false, outcome: "review", reason: input.motivoSinMatch ?? "sin_poliza_en_cartera" };
  }

  // Invariantes que el pipeline garantiza para outcome 'ok' (defensa en profundidad).
  if (!mapped.idSiniestroEntidad) {
    return { ok: false, outcome: "review", reason: "falta_id_siniestro_entidad" };
  }
  // La idempotencia de la `uq` PARCIAL (correduria, idSiniestroEntidad,
  // codigoEntidadDgs) depende de `codigoEntidadDgs NOT NULL`: Postgres trata NULLs
  // como distintos en índices UNIQUE → un re-pull con DGS null insertaría duplicado
  // en vez de deduplicar. Hoy `matchSiniestroPoliza` exige DGS non-null (sin DGS →
  // cuarentena, nunca llega aquí), pero blindamos el invariante en el chokepoint de
  // escritura (M2, espejo del guard de idSiniestroEntidad arriba).
  if (!mapped.codigoEntidadDgs) {
    return { ok: false, outcome: "review", reason: "falta_codigo_entidad_dgs" };
  }

  // ── LOO-826 A1 — Tenant guard (fail-closed, hallazgo #18): espejo del guard que
  //    POL ya tenía en persistCimaFichero. Un SIN de entidad NO autorizada puede
  //    matchear una póliza LEGACY de cartera (la cartera importada incluye otras
  //    aseguradoras) y persistir → cortamos ANTES de la tx (tras los checks de
  //    invariantes, que conservan sus reasons específicos). Outcome 'review'
  //    (cuarentena humana) + op_event Art.30. ────────────────────────────────────
  const guard = await guardEntidadAutorizada(input, "siniestro", correduriaId, dbc);
  if (guard) return guard;

  const idSiniestroEntidad = mapped.idSiniestroEntidad;
  const codigoEntidadDgs = mapped.codigoEntidadDgs;
  const { polizaId, clienteId } = match;

  try {
    const result = await dbc.transaction(async (tx) => {
      // 1. ── Cabecera del siniestro (idempotente por uq de negocio) ───────────
      const siniestroValues = {
        correduriaId,
        clienteId,
        polizaId,
        estado: mapped.estado,
        tipo: mapped.tipo,
        referencia: idSiniestroEntidad,
        fechaHora: mapped.fechaOcurrencia ? new Date(mapped.fechaOcurrencia) : null,
        // PII Tier-1 (lugar exacto del siniestro) → cifrado AES-256-GCM.
        lugarDireccion: encryptFieldNullable(mapped.lugarDireccion) ?? null,
        lugarCp: mapped.lugarCp,
        lugarCiudad: mapped.lugarCiudad,
        lugarProvincia: mapped.lugarProvincia,
        // Free-text operativo (puede arrastrar PII) → NO cifrado (igual que el manual).
        comentario: mapped.comentario,
        // Desglose de daños del EIAC. NO es PII → en claro. `null` si el EIAC no
        // trae ninguno (no ensucia el jsonb con un array vacío).
        danosCima: mapped.danos.length > 0 ? mapped.danos : null,
        // Tramitación de la compañía (24/09/2026). `null` = no vino en este fichero.
        situacionesCima: mapped.situaciones.length > 0 ? mapped.situaciones : null,
        // Nombre de figura de persona física → CIFRADO dentro del jsonb.
        accionesCima: mapped.acciones.length > 0 ? mapped.acciones.map(cifrarAccion) : null,
        pagosCima: mapped.pagos.length > 0 ? mapped.pagos : null,
        reservaCima: mapped.importeReserva,
        indemnizacionCima: mapped.importeIndemnizacion,
        totalPagosCima: mapped.totalPagos,
        posicionCima: mapped.posicion,
        // 28/09/2026 — huecos de la auditoría de cobertura (ver `columnasHuecos`).
        ...columnasHuecos(mapped),
        origen: "cima" as const,
        eiacXmlHash: xmlHash,
        idSiniestroEntidad,
        codigoEntidadDgs,
      } satisfies Partial<NewSiniestro>;

      // 03/10/2026 — Orden de llegada ≠ orden del dato. Un SIN MÁS VIEJO que el
      // último aplicado (reproceso del archivo, o ficheros que llegan
      // desordenados al pull) NO puede retroceder el siniestro: entra en modo
      // RELLENO (solo completa huecos; lo guardado gana). Bloquea la fila (FOR
      // UPDATE) para que la decisión y el UPDATE sean atómicos frente a otra tx.
      const previo = await ultimaClaveAplicada(tx, {
        correduriaId,
        idSiniestroEntidad,
        codigoEntidadDgs,
      });
      // Sin historia (no existe) → se aplica entero. Con historia: relleno si el
      // entrante es más viejo o si su nombre no se puede leer (conservador).
      const nombreEntrante = input.fichero.nombreFicheroComprimido;
      const relleno =
        previo !== null &&
        (claveFicheroSin(nombreEntrante) === null || esMasViejo(nombreEntrante, previo.nombre));
      const claveMasNueva = relleno ? previo!.nombre : null;
      // Campo «foto actual»: normal = lo último del fichero si lo trae; relleno =
      // lo guardado si existe, el fichero solo rellena el hueco.
      const foto = (col: AnyPgColumn) => {
        const exc = sql.raw(`excluded.${col.name}`);
        return relleno ? sql`coalesce(${col}, ${exc})` : sql`coalesce(${exc}, ${col})`;
      };
      // Campo que hoy se sobrescribe: en relleno solo se completa si está vacío.
      const pisa = <T>(col: AnyPgColumn, valor: T) =>
        relleno ? sql`coalesce(${col}, ${sql.raw(`excluded.${col.name}`)})` : valor;
      const historico = (columna: ColumnaHistorico, opts: { ignorar?: string[]; clave?: string } = {}) =>
        fusionHistorico(columna, { ...opts, ganaExistente: relleno });

      // LOO-755: UPSERT con UPDATE de los campos MUTABLES. Un movimiento (361)
      // sobre un siniestro ya ingestado (311) refresca su estado en vez de quedar
      // obsoleto. NO tocamos la clave de negocio, origen, eiacXmlHash ni los FK
      // (póliza/cliente): un movimiento no reasigna el siniestro a otra póliza.
      const [upserted] = await tx
        .insert(siniestros)
        .values(siniestroValues as NewSiniestro)
        .onConflictDoUpdate({
          target: [
            siniestros.correduriaId,
            siniestros.idSiniestroEntidad,
            siniestros.codigoEntidadDgs,
          ],
          // Predicado del índice ÚNICO PARCIAL (uq solo aplica a filas CIMA).
          targetWhere: sql`${siniestros.idSiniestroEntidad} is not null`,
          set: {
            estado: pisa(siniestros.estado, siniestroValues.estado),
            tipo: pisa(siniestros.tipo, siniestroValues.tipo),
            // `fechaHora` = fecha de OCURRENCIA del siniestro (la cabecera no
            // cambia entre apertura y movimiento, pero la refrescamos por si el
            // 361 trae una corrección de la entidad).
            fechaHora: pisa(siniestros.fechaHora, siniestroValues.fechaHora),
            // Lugar del siniestro (lugarDireccion ya viene CIFRADO en
            // siniestroValues — re-cifrar aquí rompería la simetría con el INSERT).
            lugarDireccion: pisa(siniestros.lugarDireccion, siniestroValues.lugarDireccion),
            lugarCp: pisa(siniestros.lugarCp, siniestroValues.lugarCp),
            lugarCiudad: pisa(siniestros.lugarCiudad, siniestroValues.lugarCiudad),
            lugarProvincia: pisa(siniestros.lugarProvincia, siniestroValues.lugarProvincia),
            // Un movimiento puede traer el desglose de daños que la apertura no
            // tenía todavía (peritación posterior) — se refresca SOLO si trae
            // algo. Un 361 de puro cambio de estado no repite `ImplicadoDiversos`
            // y `mapped.danos` llega `[]` → `siniestroValues.danosCima` es `null`;
            // sobrescribir a ciegas borraría el desglose que ya se sabía (mismo
            // fallo que `pull-persist.ts` ya evita en `datos_especificos` con
            // "fusiona, no sustituye"). `coalesce` conserva lo que ya había.
            danosCima: foto(siniestros.danosCima),
            // Históricos: se FUSIONAN (unión sin duplicados), no se sustituyen. La
            // norma EIAC §6.1.3 manda solo lo NUEVO de cada periodo: sobrescribir
            // borraría la peritación de ayer al llegar la reparación de hoy.
            situacionesCima: historico("situaciones_cima"),
            // La clave de fusión ignora lo que se añadió el 28/09 (y lo cifrado,
            // que no es determinista): si no, el mismo paso leído antes y después
            // del cambio —o re-cifrado— saldría dos veces. Gana la versión nueva.
            accionesCima: historico("acciones_cima", { ignorar: ["figurasDetalle"] }),
            pagosCima: historico("pagos_cima", {
              ignorar: ["fechaLiquidacion", "formaPago", "coberturas", "receptorRazonSocial"],
            }),
            conveniosCima: historico("convenios_cima"),
            // Un expediente EVOLUCIONA (PE→LI, importes): se identifica por su
            // número y gana el último que manda la compañía.
            expedientesCima: historico("expedientes_cima", { clave: "numero" }),
            asistenciasCima: historico("asistencias_cima", { ignorar: ["nombre"] }),
            // Foto actual: el último que manda la compañía; si no lo trae, se conserva.
            fechaDeclaracion: foto(siniestros.fechaDeclaracion),
            daaCima: foto(siniestros.daaCima),
            responsabilidadCima: foto(siniestros.responsabilidadCima),
            totalRecobrosCima: foto(siniestros.totalRecobrosCima),
            reservaDesgloseCima: foto(siniestros.reservaDesgloseCima),
            riesgoCima: foto(siniestros.riesgoCima),
            contactoNombreCima: foto(siniestros.contactoNombreCima),
            contactoTelefonoCima: foto(siniestros.contactoTelefonoCima),
            vehiculoCima: foto(siniestros.vehiculoCima),
            vehiculoContrarioCima: foto(siniestros.vehiculoContrarioCima),
            refMediadorCima: foto(siniestros.refMediadorCima),
            descripcionCima: foto(siniestros.descripcionCima),
            contactoObservacionesCima: foto(siniestros.contactoObservacionesCima),
            // Importes: el último que manda la compañía; si este fichero no lo trae, se conserva.
            reservaCima: foto(siniestros.reservaCima),
            indemnizacionCima: foto(siniestros.indemnizacionCima),
            totalPagosCima: foto(siniestros.totalPagosCima),
            posicionCima: foto(siniestros.posicionCima),
            updatedAt: new Date(),
          },
        })
        // INSERT vs UPDATE: `xmax = 0` ⇒ la fila se acaba de INSERTAR (apertura);
        // `xmax ≠ 0` ⇒ la fila existía y el conflicto la ACTUALIZÓ (movimiento).
        // Evita el SELECT de recuperación del id (ambas ramas devuelven la fila).
        .returning({
          id: siniestros.id,
          wasInserted: sql<boolean>`(xmax = 0)`,
        });

      const siniestroId = upserted.id;
      const yaExistia = !upserted.wasInserted;

      // 1b. ── «Resto» de CIMA → `siniestros.cima_extra` (03/10/2026, 0106). ──
      //    Fuera del INSERT de Drizzle y SOLO si la columna existe: declararla en
      //    el schema antes de aplicar el DDL tumbaría cada alta (ver
      //    columna-opcional.ts). `undefined` = no se sabe → no se toca (null ≠ []).
      //    El SIN es un DELTA (EIAC §6.1.3): se fusiona por ruta con lo guardado;
      //    en relleno (fichero más viejo) gana lo guardado.
      //    04/10/2026 — y los TERCEROS con estructura (`cima_extra.terceros`, PII
      //    cifrada en `fusionarTercerosCima`), también como delta.
      const hayTerceros = (mapped.terceros?.length ?? 0) > 0;
      if ((mapped.cimaExtra !== undefined || hayTerceros) && (await columnaExiste(tx, "siniestros", "cima_extra"))) {
        const guardado = yaExistia ? await cimaExtraGuardado(tx, siniestroId) : null;
        const valor = valorCimaExtraSin(
          guardado,
          mapped.cimaExtra !== undefined
            ? { entradas: mapped.cimaExtra, truncado: mapped.cimaExtraTruncado === true }
            : null,
          mapped.terceros,
          relleno,
        );
        await tx.execute(sql`
          update ${siniestros} set cima_extra = ${JSON.stringify(valor)}::jsonb
          where ${siniestros.id} = ${siniestroId}::uuid`);
      }

      // 2. ── Terceros. Testigos y lesionados: SOLO en la apertura (D8). Los
      //    CONTRARIOS se FUSIONAN (28/09/2026): el SIN llega como delta (norma
      //    EIAC §6.1.3) y un movimiento puede traer un contrario que la apertura
      //    no tenía. Se inserta solo el que no está ya (comparado en claro contra
      //    lo guardado, que está cifrado con IV aleatorio). ─────────────────────
      let figurasPersisted = 0;
      const contrarios = mapped.figuras.filter((f) => f.kind === "contrario");
      const yaGuardados = yaExistia && contrarios.length > 0
        ? await contrariosGuardados(tx, siniestroId)
        : [];
      for (const figura of mapped.figuras) {
        if (figura.kind !== "contrario" && yaExistia) continue;
        if (figura.kind === "contrario" && yaGuardados.some((g) => contrarioCubierto(g, figura))) continue;
        await insertFigura(tx, figura, siniestroId, correduriaId);
        figurasPersisted += 1;
      }

      // 3. ── operationalEvents DENTRO de la tx (Art. 30). payload SIN PII. ─────
      //    Apertura → `cima_siniestro_persisted`; movimiento (UPDATE) →
      //    `cima_siniestro_actualizado`. Cada movimiento trae xmlHash distinto →
      //    `${xmlHash}:${id}` es único por movimiento; onConflictDoNothing dedup
      //    el replay del MISMO movimiento sin churn.
      await tx
        .insert(operationalEvents)
        .values({
          eventName: yaExistia
            ? "cima_siniestro_actualizado"
            : "cima_siniestro_persisted",
          source: "cima_ingestion",
          sourceEventId: `${xmlHash}:${idSiniestroEntidad}`,
          correduriaId,
          payload: siniestroEventPayload(input, {
            siniestroId,
            polizaId,
            clienteId,
            yaExistia,
            figurasPersisted,
            // Solo en modo relleno (un SIN más viejo que el último aplicado).
            ...(relleno ? { aplicadoComo: "relleno", claveMasNueva } : {}),
          }),
        })
        .onConflictDoNothing({
          target: [operationalEvents.eventName, operationalEvents.sourceEventId],
        });

      return { siniestroId };
    });

    return { ok: true, outcome: "persisted", siniestroId: result.siniestroId };
  } catch (e) {
    const code = (e as { code?: string } | null)?.code;
    if (code === "23505") {
      // Violación de unicidad bajo carrera (la tx hizo rollback). Replay idempotente.
      return { ok: false, outcome: "error", reason: "unique_violation_replay" };
    }
    return {
      ok: false,
      outcome: "error",
      reason: e instanceof Error ? e.message : "persist_siniestro_unknown_error",
    };
  }
}

/** Inserta UN tercero en su subtabla según `kind`, cifrando la PII Tier-1. */
async function insertFigura(
  tx: Parameters<Parameters<CimaDb["transaction"]>[0]>[0],
  figura: MappedFigura,
  siniestroId: string,
  correduriaId: string,
): Promise<void> {
  // PII Tier-1 (tercero, Art.14) cifrada AES-256-GCM.
  const nombre = encryptFieldNullable(figura.nombre) ?? null;
  const telefono = encryptFieldNullable(figura.telefono) ?? null;

  if (figura.kind === "testigo") {
    await tx.insert(siniestroTestigos).values({
      siniestroId,
      correduriaId,
      nombre,
      telefono,
    });
    return;
  }
  if (figura.kind === "lesionado") {
    await tx.insert(siniestroLesionados).values({
      siniestroId,
      correduriaId,
      nombre,
      telefono,
      ibaEnCocheCliente: figura.ibaEnCocheCliente,
    });
    return;
  }
  // contrario (incluye desconocido → contrario genérico + flagReview en el mapper).
  await tx.insert(siniestroContrarios).values({
    siniestroId,
    correduriaId,
    nombre,
    telefono,
    matricula: encryptFieldNullable(figura.matricula) ?? null,
    marcaModelo: figura.marcaModelo,
    compania: figura.compania,
    numeroPoliza: figura.numeroPoliza,
    esConductor: figura.esConductor,
    codigoEntidadDgs: figura.codigoEntidadDgs ?? null,
    responsabilidad: figura.responsabilidad ?? null,
    numeroLesionados: figura.numeroLesionados ?? null,
  });
}

type ContrarioComparable = Pick<
  MappedFigura,
  "nombre" | "telefono" | "matricula" | "compania" | "numeroPoliza"
> & { codigoEntidadDgs: string | null; responsabilidad: string | null };

/** Contrarios ya guardados del siniestro, DESCIFRADOS en memoria (no salen de aquí). */
async function contrariosGuardados(
  tx: Parameters<Parameters<CimaDb["transaction"]>[0]>[0],
  siniestroId: string,
): Promise<ContrarioComparable[]> {
  const filas = await tx
    .select({
      nombre: siniestroContrarios.nombre,
      telefono: siniestroContrarios.telefono,
      matricula: siniestroContrarios.matricula,
      compania: siniestroContrarios.compania,
      numeroPoliza: siniestroContrarios.numeroPoliza,
      codigoEntidadDgs: siniestroContrarios.codigoEntidadDgs,
      responsabilidad: siniestroContrarios.responsabilidad,
    })
    .from(siniestroContrarios)
    .where(eq(siniestroContrarios.siniestroId, siniestroId));
  return filas.map((f) => ({
    nombre: decryptFieldNullable(f.nombre) ?? null,
    telefono: decryptFieldNullable(f.telefono) ?? null,
    matricula: decryptFieldNullable(f.matricula) ?? null,
    compania: f.compania,
    numeroPoliza: f.numeroPoliza,
    codigoEntidadDgs: f.codigoEntidadDgs,
    responsabilidad: f.responsabilidad,
  }));
}

const norm = (v: string | null | undefined, digitos = false): string | null => {
  if (v == null) return null;
  const t = digitos ? v.replace(/\D/g, "") : v.trim().toUpperCase().replace(/\s+/g, " ");
  return t === "" ? null : t;
};

/**
 * ¿El contrario que llega ya está guardado? Sí si un guardado lo CUBRE: todo lo
 * que trae el nuevo coincide con el guardado (un delta que repite al contrario
 * con menos datos no lo duplica). Regla de identidad del repo: si los dos traen
 * un identificador (nombre, teléfono, matrícula, póliza) y DIFIERE, son dos
 * personas y no se funden jamás — eso ya lo garantiza «todo coincide».
 */
export function contrarioCubierto(guardado: ContrarioComparable, nuevo: MappedFigura): boolean {
  const pares: Array<[string | null, string | null]> = [
    [norm(guardado.nombre), norm(nuevo.nombre)],
    [norm(guardado.telefono, true), norm(nuevo.telefono, true)],
    [norm(guardado.matricula), norm(nuevo.matricula)],
    [norm(guardado.compania), norm(nuevo.compania)],
    [norm(guardado.numeroPoliza), norm(nuevo.numeroPoliza)],
    [norm(guardado.codigoEntidadDgs), norm(nuevo.codigoEntidadDgs)],
    [norm(guardado.responsabilidad), norm(nuevo.responsabilidad)],
  ];
  let alguno = false;
  for (const [g, n] of pares) {
    if (n == null) continue;
    alguno = true;
    if (g !== n) return false;
  }
  return alguno;
}

/** Figura con nombre: el de PERSONA FÍSICA se cifra; la razón social de empresa, en claro. */
function cifrarNombrada<T extends MappedFiguraNombrada>(f: T): T {
  return { ...f, nombre: encryptFieldNullable(f.nombre) ?? null };
}

function cifrarAccion(a: MappedAccion): MappedAccion {
  return { ...a, figurasDetalle: (a.figurasDetalle ?? []).map(cifrarNombrada) };
}

/**
 * Columnas nuevas del 28/09/2026. PII (contacto, conductor, nombres de persona
 * física, todo lo del contrario salvo la marca) CIFRADA con el mismo
 * `encryptFieldNullable` que los terceros. `null` = no vino en este fichero (el
 * UPDATE la conserva con `coalesce`/fusión); nunca `[]`/`{}` que taparía el hueco.
 */
export function columnasHuecos(mapped: EiacSinMapped) {
  const lista = <T>(xs: T[] | undefined): T[] | null => (xs && xs.length > 0 ? xs : null);
  const vehiculo = mapped.vehiculo
    ? { ...mapped.vehiculo, conductorNombre: encryptFieldNullable(mapped.vehiculo.conductorNombre) ?? null }
    : null;
  const vc = mapped.vehiculoContrario;
  const vehiculoContrario = vc
    ? {
        matricula: encryptFieldNullable(vc.matricula) ?? null,
        marcaModelo: vc.marcaModelo,
        conductorNombre: encryptFieldNullable(vc.conductorNombre) ?? null,
        otros: vc.otros.map((o) => ({ ...o, valor: encryptFieldNullable(o.valor) ?? null })),
      }
    : null;
  return {
    fechaDeclaracion: mapped.fechaDeclaracion ?? null,
    daaCima: mapped.daa ?? null,
    responsabilidadCima: mapped.responsabilidad ?? null,
    totalRecobrosCima: mapped.totalRecobros ?? null,
    reservaDesgloseCima: mapped.reservaDesglose ?? null,
    conveniosCima: lista(mapped.convenios),
    expedientesCima: lista(mapped.expedientes),
    riesgoCima: mapped.riesgo ?? null,
    contactoNombreCima: encryptFieldNullable(mapped.contactoNombre) ?? null,
    contactoTelefonoCima: encryptFieldNullable(mapped.contactoTelefono) ?? null,
    vehiculoCima: vehiculo,
    vehiculoContrarioCima: vehiculoContrario,
    asistenciasCima: lista((mapped.asistencias ?? []).map((a: MappedAsistencia) => cifrarNombrada(a))),
    refMediadorCima: mapped.refMediador ?? null,
    descripcionCima: mapped.descripcion ?? null,
    contactoObservacionesCima: encryptFieldNullable(mapped.contactoObservaciones) ?? null,
  };
}

/** Lo guardado en `siniestros.cima_extra` (fila ya bloqueada por la tx). */
async function cimaExtraGuardado(tx: Pick<Tx, "execute">, siniestroId: string): Promise<unknown> {
  const filas = (await tx.execute(sql`
    select cima_extra as "cimaExtra" from ${siniestros}
    where ${siniestros.id} = ${siniestroId}::uuid`)) as unknown as Array<{ cimaExtra: unknown }>;
  return filas[0]?.cimaExtra ?? null;
}

function entradasValidas(v: unknown): CimaExtraEntrada[] | null {
  if (!Array.isArray(v)) return null;
  return v.filter(
    (e): e is CimaExtraEntrada =>
      typeof e === "object" && e !== null && typeof e.ruta === "string" && typeof e.valor === "string",
  );
}

/**
 * PURA. Valor de `siniestros.cima_extra` tras aplicar un SIN. Un SIN es un delta:
 * una ruta que el fichero NO trae no se borra. Por RUTA (grupo completo, una ruta
 * puede repetirse en arrays): normal → gana el fichero; `ganaExistente` (relleno,
 * fichero más viejo) → gana lo guardado y el fichero solo añade rutas nuevas.
 * Guardado ilegible = nada guardado. Tope `CIMA_EXTRA_MAX`; `cimaExtraTruncado` se
 * arrastra (lo que se truncó una vez sigue sin estar completo).
 */
export function fusionarCimaExtraSin(
  guardado: unknown,
  entrante: { entradas: CimaExtraEntrada[]; truncado: boolean },
  ganaExistente: boolean,
): { cimaExtra: CimaExtraEntrada[]; cimaExtraTruncado?: true } {
  const g = typeof guardado === "object" && guardado !== null ? (guardado as Record<string, unknown>) : null;
  const previas = entradasValidas(g?.cimaExtra) ?? [];
  const base = ganaExistente ? previas : entrante.entradas;
  const otras = ganaExistente ? entrante.entradas : previas;
  const rutasBase = new Set(base.map((e) => e.ruta));
  const todas = [...base, ...otras.filter((e) => !rutasBase.has(e.ruta))];
  const cimaExtra = todas.slice(0, CIMA_EXTRA_MAX);
  const truncado = entrante.truncado || g?.cimaExtraTruncado === true || todas.length > CIMA_EXTRA_MAX;
  return truncado ? { cimaExtra, cimaExtraTruncado: true } : { cimaExtra };
}

/**
 * PURA salvo el cifrado de terceros. Valor COMPLETO de `siniestros.cima_extra` tras
 * aplicar un SIN: el resto (`cimaExtra`, `fusionarCimaExtraSin`) y los `terceros`
 * (`fusionarTercerosCima`), los dos como delta. `entrante: null` = el resto de este
 * fichero no se sabe → se conserva el guardado tal cual (y si no había, no se
 * escribe la clave `cimaExtra`: null ≠ []). Los terceros guardados sobreviven a un
 * SIN que no trae ninguno.
 */
export function valorCimaExtraSin(
  guardado: unknown,
  entrante: { entradas: CimaExtraEntrada[]; truncado: boolean } | null,
  terceros: FiguraCima[] | undefined,
  ganaExistente: boolean,
): Record<string, unknown> {
  const g = typeof guardado === "object" && guardado !== null ? (guardado as Record<string, unknown>) : null;
  const out: Record<string, unknown> = {};
  if (entrante) {
    Object.assign(out, fusionarCimaExtraSin(guardado, entrante, ganaExistente));
  } else if (g && Array.isArray(g.cimaExtra)) {
    out.cimaExtra = g.cimaExtra;
    if (g.cimaExtraTruncado === true) out.cimaExtraTruncado = true;
  }
  const t = fusionarTercerosCima(g?.terceros, terceros, ganaExistente);
  if (t !== undefined) out.terceros = t;
  return out;
}

type ColumnaHistorico =
  | "situaciones_cima"
  | "acciones_cima"
  | "pagos_cima"
  | "convenios_cima"
  | "expedientes_cima"
  | "asistencias_cima";

/**
 * Unión sin duplicados de un histórico jsonb (lo que había + lo que trae el
 * fichero). `null` si los dos están vacíos. Dos elementos son «el mismo» si
 * coincide su CLAVE: por defecto el valor entero; con `ignorar`, el objeto sin
 * esas claves (lo cifrado, que no es determinista, y lo añadido después); con
 * `clave`, esa propiedad (un expediente es su número). Ante el mismo, gana el
 * que trae el fichero (el más nuevo) — salvo `ganaExistente` (fichero más viejo
 * que lo aplicado: gana lo guardado). Re-procesar el mismo fichero no duplica
 * nada (idempotente). El orden no se garantiza: quien lo pinta ordena por fecha.
 */
function fusionHistorico(
  columna: ColumnaHistorico,
  opts: { ignorar?: string[]; clave?: string; ganaExistente?: boolean } = {},
) {
  const col = sql.raw(`"siniestros"."${columna}"`);
  const exc = sql.raw(`excluded."${columna}"`);
  const seguro = (k: string) => {
    if (!/^[A-Za-z]+$/.test(k)) throw new Error(`clave jsonb no válida: ${k}`);
    return k;
  };
  const claveSql = opts.clave
    ? sql.raw(`coalesce(t.e->>'${seguro(opts.clave)}', t.e::text)`)
    : opts.ignorar && opts.ignorar.length > 0
      ? sql.raw(`(t.e - array[${opts.ignorar.map((k) => `'${seguro(k)}'`).join(",")}]::text[])::text`)
      : sql.raw(`t.e::text`);
  // Lo guardado va PRIMERO en la concatenación (n bajos), lo del fichero después.
  // `desc` ⇒ ante empate gana el fichero; `asc` (ganaExistente, modo relleno de un
  // SIN más viejo) ⇒ gana lo guardado: un expediente LI no vuelve a PE.
  const orden = sql.raw(opts.ganaExistente ? "asc" : "desc");
  return sql`(select jsonb_agg(u.e) from (select distinct on (${claveSql}) t.e from jsonb_array_elements(coalesce(${col}, '[]'::jsonb) || coalesce(${exc}, '[]'::jsonb)) with ordinality as t(e, n) order by ${claveSql}, t.n ${orden}) u)`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 03/10/2026 — Orden de los ficheros SIN. Un fichero más VIEJO que el último
// aplicado no retrocede el siniestro (reproceso del archivo / pull desordenado).
// ─────────────────────────────────────────────────────────────────────────────

/** Clave comparable de un fichero EIAC SIN. */
export type ClaveFicheroSin = {
  /** YYYYMMDD del dato (el del nombre, no el de descarga). */
  fecha: string;
  /** Desempate (misma seq): 311 (apertura) < 361 (movimiento) < 399 < cualquier otro. */
  rango: number;
  proceso: number;
  /** Secuencia/marca de generación de la compañía (solo dígitos, sin ceros a la izquierda). */
  seq: string;
};

const RANGO_PROCESO: Record<string, number> = { "311": 0, "361": 1, "399": 2 };
const RE_NOMBRE_SIN = /_SIN_(\d+)_\d+_(\d{8})_(\d+)\.zip$/i;

/**
 * Nombre EIAC `<ent>_<med>_SIN_<proceso>_<n>_<YYYYMMDD>_<seq>.zip` → clave
 * comparable; `null` si el nombre no se puede leer (manual, renombrado…).
 * Puro: sin BD.
 */
export function claveFicheroSin(nombre: string | null | undefined): ClaveFicheroSin | null {
  if (!nombre) return null;
  const m = RE_NOMBRE_SIN.exec(nombre.trim());
  if (!m) return null;
  const [, proceso, fecha, seqRaw] = m;
  const mes = Number(fecha.slice(4, 6));
  const dia = Number(fecha.slice(6, 8));
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  return {
    fecha,
    rango: RANGO_PROCESO[proceso] ?? 3,
    proceso: Number(proceso),
    seq: seqRaw.replace(/^0+(?=\d)/, ""),
  };
}

/**
 * <0 si a es anterior a b, 0 si iguales, >0 si posterior. Orden: fecha del dato,
 * luego seq NUMÉRICA (marca de generación: el orden real dentro del día — un 399
 * de cierre a las 10:00 y un 361 de reapertura a las 15:00 → manda el 361), y el
 * proceso (311 < 361 < 399 < otros) solo como desempate con la misma seq.
 */
export function compararClaveSin(a: ClaveFicheroSin, b: ClaveFicheroSin): number {
  if (a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1;
  if (a.seq.length !== b.seq.length) return a.seq.length - b.seq.length;
  if (a.seq !== b.seq) return a.seq < b.seq ? -1 : 1;
  if (a.rango !== b.rango) return a.rango - b.rango;
  return a.proceso - b.proceso;
}

/**
 * ¿El fichero entrante es MÁS VIEJO que el último aplicado? Clave igual = NO
 * (replay idempotente del mismo fichero). Entrante ilegible frente a una
 * almacenada = SÍ (conservador: solo rellena). Almacenada ilegible/ausente con
 * entrante legible = NO (no hay con qué comparar → comportamiento de siempre).
 * El caso «existe la fila pero ningún nombre legible» lo decide el llamador.
 */
export function esMasViejo(entrante: string | null | undefined, almacenada: string | null | undefined): boolean {
  const ka = claveFicheroSin(almacenada);
  const ke = claveFicheroSin(entrante);
  if (!ke) return almacenada != null;
  if (!ka) return false;
  return compararClaveSin(ke, ka) < 0;
}

/** De una lista de nombres, el de clave MÁS NUEVA (los ilegibles no cuentan). */
export function nombreMasNuevo(nombres: Array<string | null | undefined>): string | null {
  let mejor: { nombre: string; clave: ClaveFicheroSin } | null = null;
  for (const n of nombres) {
    const k = claveFicheroSin(n);
    if (!n || !k) continue;
    if (!mejor || compararClaveSin(k, mejor.clave) > 0) mejor = { nombre: n, clave: k };
  }
  return mejor?.nombre ?? null;
}

type Tx = Parameters<Parameters<CimaDb["transaction"]>[0]>[0];

/**
 * Dentro de la tx: BLOQUEA la fila del siniestro (FOR UPDATE) y devuelve el
 * nombre del fichero MÁS NUEVO ya aplicado a ella. Fuentes: los op_events
 * `cima_siniestro_persisted`/`cima_siniestro_actualizado` del siniestro
 * (payload.nombreFichero) y, de respaldo, el fichero de la apertura
 * (`siniestros.eiac_xml_hash` → `cima_ficheros.xml_hash`).
 *  - `null` ⇒ el siniestro NO existe todavía (sin historia → se aplica entero).
 *  - `{ nombre: null }` ⇒ existe pero ningún nombre es legible.
 * Nota: el filtro `payload->>'siniestroId'` NO tiene índice (usa solo
 * idx_ops_event_name). Bien al volumen actual (cientos de eventos SIN/año); si
 * crece, índice de expresión sobre ((payload->>'siniestroId')) filtrado por esos event_name.
 */
export async function ultimaClaveAplicada(
  tx: Pick<Tx, "execute">,
  k: { correduriaId: string; idSiniestroEntidad: string; codigoEntidadDgs: string },
): Promise<{ nombre: string | null } | null> {
  const filas = (await tx.execute(sql`
    select ${siniestros.id} as id, ${siniestros.eiacXmlHash} as hash
    from ${siniestros}
    where ${siniestros.correduriaId} = ${k.correduriaId}
      and ${siniestros.idSiniestroEntidad} = ${k.idSiniestroEntidad}
      and ${siniestros.codigoEntidadDgs} = ${k.codigoEntidadDgs}
    for update`)) as unknown as Array<{ id: string; hash: string | null }>;
  const fila = filas[0];
  if (!fila) return null;
  const nombres = (await tx.execute(sql`
    select ${operationalEvents.payload}->>'nombreFichero' as nombre
    from ${operationalEvents}
    where ${operationalEvents.eventName} in ('cima_siniestro_persisted', 'cima_siniestro_actualizado')
      and ${operationalEvents.payload}->>'siniestroId' = ${fila.id}
    union all
    select ${cimaFicheros.nombreFichero} as nombre
    from ${cimaFicheros}
    where ${fila.hash}::text is not null and ${cimaFicheros.xmlHash} = ${fila.hash}`)) as unknown as Array<{
    nombre: string | null;
  }>;
  return { nombre: nombreMasNuevo(nombres.map((n) => n.nombre)) };
}
