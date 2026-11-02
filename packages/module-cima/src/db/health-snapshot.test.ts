/**
 * LOO-826 — Unit tests de los helpers PUROS del snapshot de salud CIMA:
 *  - `computeStartedSinTerminal` (watchdog B3): correlación started↔terminal por
 *    el prefijo epoch del sourceEventId (`${startedAtEpochMs}:${eventName}`,
 *    contrato de pull-audit.ts) + ventana de gracia.
 *  - `contarPorRecuperabilidad` (B1): desglose fino de la cuarentena.
 *  - `clasificarCrudoCuarentena`: crudo EIAC (mig 0096) pendiente de reproceso y
 *    el subconjunto que el TTL va a purgar dentro de la ventana de aviso.
 * `getCimaHealthSnapshot` es SELECT-only contra BD y se verifica vía smoke/panel.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  clasificarCrudoCuarentena,
  resumirCoberturaCampos,
  computeStartedSinTerminal,
  contarPorRecuperabilidad,
  CRUDO_PURGA_AVISO_DIAS,
  WATCHDOG_GRACE_MINUTOS,
  type CrudoCuarentenaRow,
  type CuarentenaItem,
  type PullWatchdogRow,
} from "./health-snapshot.ts";

const AHORA = new Date("2026-07-01T12:00:00.000Z");
const HORA_MS = 60 * 60 * 1000;

function row(
  eventName: string,
  epochMs: number,
  occurredAt: Date = new Date(epochMs),
): PullWatchdogRow {
  return { eventName, sourceEventId: `${epochMs}:${eventName}`, occurredAt };
}

// --- computeStartedSinTerminal (B3) -----------------------------------------

test("watchdog: started con completed del mismo run → 0 huérfanos", () => {
  const epoch = AHORA.getTime() - 5 * HORA_MS;
  const r = computeStartedSinTerminal(
    [row("cima_pull_started", epoch), row("cima_pull_completed", epoch)],
    AHORA,
  );
  assert.equal(r.startedSinTerminal, 0);
  assert.deepEqual(r.ultimosStartedAt, []);
});

test("watchdog: started con failed del mismo run también cuenta como terminal", () => {
  const epoch = AHORA.getTime() - 5 * HORA_MS;
  const r = computeStartedSinTerminal(
    [row("cima_pull_started", epoch), row("cima_pull_failed", epoch)],
    AHORA,
  );
  assert.equal(r.startedSinTerminal, 0);
});

test("watchdog: started SIN terminal pasada la gracia → huérfano detectado", () => {
  const epoch = AHORA.getTime() - 5 * HORA_MS;
  const r = computeStartedSinTerminal([row("cima_pull_started", epoch)], AHORA);
  assert.equal(r.startedSinTerminal, 1);
  assert.equal(r.ultimosStartedAt[0]?.getTime(), epoch);
});

test("watchdog: started RECIENTE (dentro de la gracia) NO cuenta (run en vuelo)", () => {
  const epoch = AHORA.getTime() - (WATCHDOG_GRACE_MINUTOS - 5) * 60 * 1000;
  const r = computeStartedSinTerminal([row("cima_pull_started", epoch)], AHORA);
  assert.equal(r.startedSinTerminal, 0);
});

test("watchdog: el terminal de OTRO run no salva a un started huérfano", () => {
  const e1 = AHORA.getTime() - 6 * HORA_MS;
  const e2 = AHORA.getTime() - 3 * HORA_MS;
  const r = computeStartedSinTerminal(
    [
      row("cima_pull_started", e1), // huérfano
      row("cima_pull_started", e2),
      row("cima_pull_completed", e2),
    ],
    AHORA,
  );
  assert.equal(r.startedSinTerminal, 1);
  assert.equal(r.ultimosStartedAt[0]?.getTime(), e1);
});

test("watchdog: sourceEventId null → fila ignorada (sin epoch no hay correlación)", () => {
  const r = computeStartedSinTerminal(
    [
      {
        eventName: "cima_pull_started",
        sourceEventId: null,
        occurredAt: new Date(AHORA.getTime() - 5 * HORA_MS),
      },
    ],
    AHORA,
  );
  assert.equal(r.startedSinTerminal, 0);
});

test("watchdog: huérfanos ordenados DESC y capados a 5 en ultimosStartedAt", () => {
  const rows: PullWatchdogRow[] = [];
  for (let i = 1; i <= 7; i++) {
    rows.push(row("cima_pull_started", AHORA.getTime() - i * HORA_MS));
  }
  const r = computeStartedSinTerminal(rows, AHORA);
  assert.equal(r.startedSinTerminal, 7);
  assert.equal(r.ultimosStartedAt.length, 5);
  // El más reciente primero.
  assert.equal(r.ultimosStartedAt[0]?.getTime(), AHORA.getTime() - 1 * HORA_MS);
  assert.equal(r.ultimosStartedAt[4]?.getTime(), AHORA.getTime() - 5 * HORA_MS);
});

// --- contarPorRecuperabilidad (B1) -------------------------------------------

function cuarentenaItem(
  recuperabilidad: CuarentenaItem["recuperabilidad"],
  nombre: string,
): CuarentenaItem {
  return {
    nombreFichero: nombre,
    tipoObjeto: "POL",
    codigoEntidad: "C0109",
    estado: "review",
    errorDetalle: null,
    descargadoAt: AHORA,
    recuperabilidad,
  };
}

test("contarPorRecuperabilidad: cuenta cada etiqueta (y 0 para las ausentes)", () => {
  const counts = contarPorRecuperabilidad([
    cuarentenaItem("requiere_accion", "a.zip"),
    cuarentenaItem("requiere_accion", "b.zip"),
    cuarentenaItem("recuperable", "c.zip"),
  ]);
  assert.deepEqual(counts, {
    recuperable: 1,
    requiere_accion: 2,
    out_of_cartera: 0,
  });
});

test("contarPorRecuperabilidad: cuarentena vacía → todo a 0", () => {
  assert.deepEqual(contarPorRecuperabilidad([]), {
    recuperable: 0,
    requiere_accion: 0,
    out_of_cartera: 0,
  });
});

const DIA_MS = 24 * HORA_MS;

function crudo(creadoHaceDias: number, purgaEnDias: number): CrudoCuarentenaRow {
  return {
    createdAt: new Date(AHORA.getTime() - creadoHaceDias * DIA_MS),
    purgarEn: new Date(AHORA.getTime() + purgaEnDias * DIA_MS),
  };
}

test("clasificarCrudoCuarentena: sin filas → 0 pendientes y masAntiguaHoras null", () => {
  const r = clasificarCrudoCuarentena([], AHORA);
  assert.equal(r.pendientes, 0);
  assert.equal(r.masAntiguaHoras, null);
  assert.equal(r.purgaInminente, 0);
  assert.equal(r.avisoDias, CRUDO_PURGA_AVISO_DIAS);
});

test("clasificarCrudoCuarentena: masAntiguaHoras toma la MÁS vieja, no la última", () => {
  // Si tomara la última de la lista daría 24h y el aviso diría que el crudo es
  // de ayer cuando lleva 30 días esperando un arreglo del mapper.
  const r = clasificarCrudoCuarentena([crudo(1, 89), crudo(30, 60), crudo(2, 88)], AHORA);
  assert.equal(r.pendientes, 3);
  assert.equal(r.masAntiguaHoras, 30 * 24);
});

test("clasificarCrudoCuarentena: purgaInminente cuenta SOLO lo que el TTL borra dentro de la ventana", () => {
  const r = clasificarCrudoCuarentena(
    [
      crudo(80, 1), // se purga mañana → inminente
      crudo(76, CRUDO_PURGA_AVISO_DIAS), // justo en el límite → inminente (<=)
      crudo(70, CRUDO_PURGA_AVISO_DIAS + 1), // fuera de la ventana
      crudo(1, 89), // recién guardado
    ],
    AHORA,
  );
  assert.equal(r.pendientes, 4);
  assert.equal(r.purgaInminente, 2);
});

test("clasificarCrudoCuarentena: una fila YA vencida sigue contando como inminente", () => {
  // purgar_en en el pasado = el DELETE del endpoint aún no ha pasado por ella.
  // Si no contara, la última oportunidad de avisar se perdería en silencio.
  const r = clasificarCrudoCuarentena([crudo(95, -2)], AHORA);
  assert.equal(r.purgaInminente, 1);
});

// --- resumirCoberturaCampos (mig 0097) ---

test("resumirCoberturaCampos: SIN filas devuelve null, NO un resumen a cero", () => {
  // «Todavía no se ha medido» ≠ «no hay campos sin leer». Un 0 aquí sería la
  // afirmación tranquilizadora y falsa que esta medición existe para evitar.
  assert.equal(resumirCoberturaCampos([]), null);
});

test("resumirCoberturaCampos: suma hojas y hojas nunca leídas por tipo", () => {
  const r = resumirCoberturaCampos([
    { tipoObjeto: "POL", rutas: 120, hojas: 90, nuncaLeidas: 31 },
    { tipoObjeto: "REC", rutas: 40, hojas: 30, nuncaLeidas: 4 },
  ]);
  assert.ok(r);
  assert.equal(r.hojas, 120);
  assert.equal(r.hojasNuncaLeidas, 35);
  // Ordenado por lo que más se está perdiendo, no por nombre.
  assert.deepEqual(r.porTipo.map((t) => t.tipoObjeto), ["POL", "REC"]);
});

test("resumirCoberturaCampos: medido y sin nada pendiente SÍ es 0 (revisado, no hay)", () => {
  const r = resumirCoberturaCampos([{ tipoObjeto: "POL", rutas: 10, hojas: 8, nuncaLeidas: 0 }]);
  assert.ok(r);
  assert.equal(r.hojasNuncaLeidas, 0); // distinto de `null`: esto SÍ se ha mirado
});
