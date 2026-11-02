/**
 * LOO-757 — Unit tests del mapper PURO `mapEiacCefAll`. Verifica el mapeo de la
 * estructura REAL del CEF (probe 2026-06-24): conceptos/saldos/periodo, liquidaciones
 * (objeto único y array), movimientos (objeto único y array), estado (dict + default),
 * y que NUNCA extrae IBAN/Titular del FormaPago embebido (CEF no es PII).
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  mapEiacCefAll,
  mapLiquidacionEstado,
  type ParsedEiacCef,
} from "./eiac-cef-mapper.ts";

// Fixture EIAC sin tipos: los tests lo mutan a mano (huecos 0104).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Suelto = Record<string, any>;

/** Fichero CEF con la forma real del probe (1 cuenta, 1 liquidación, 2 movimientos). */
function cefParsed(over: Record<string, unknown> = {}): ParsedEiacCef {
  return {
    Objetos: {
      CuentaEfectivo: {
        CodigoEntidad: { CodigoDGS: "C0109" },
        Periodo: {
          FechaInicio: "2026-01-01T00:00:00",
          FechaFin: "2026-01-31T00:00:00",
        },
        Saldos: { SaldoInicial: "10.00", SaldoFinal: "95.03" },
        Conceptos: {
          RecibosCobrados: "0",
          ComisionesRecibos: "95.03",
          RetencionComisiones: "12.00",
          SiniestrosPagados: "0",
          OtrosConceptos: "0",
          RetencionOtros: "0",
          Remesas: "80.77",
        },
        Liquidaciones: {
          Liquidacion: {
            DatosLiquidacion: {
              IdLiquidacionEntidad: "LIQ000000001",
              EstadoLiquidacion: "LI",
              FechaLiquidacion: "2026-02-01T00:00:00",
              FechaPago: "2026-02-05T00:00:00",
              ImporteRemesa: "80.77",
              MovimientosLiquidacion: {
                MovimientoLiquidacion: [
                  {
                    NumeroOrden: "1",
                    FechaMovimiento: "2026-01-15T00:00:00",
                    ImporteMovimiento: { ClaseImporte: "LI", Importe: "68.08" },
                    MovimientoRecibo: {
                      DatosPoliza: {
                        IdPoliza: "881227111",
                        CodigoEntidad: { CodigoDGS: "C0109" },
                      },
                      DatosRecibo: {
                        IdRecibo: "881227973",
                        // ⚠️ El EIAC embebe GestionCobro/IBAN aquí; el mapper NO lo extrae.
                        GestionCobro: {
                          DatosFormaPago: {
                            DatosCuentaCorriente: { IBAN: "ES9121000418450200051332" },
                          },
                        },
                      },
                    },
                  },
                  {
                    NumeroOrden: "2",
                    FechaMovimiento: "2026-01-20T00:00:00",
                    ImporteMovimiento: { ClaseImporte: "LI", Importe: "12.69" },
                    MovimientoRecibo: {
                      DatosPoliza: {
                        IdPoliza: "881227222",
                        CodigoEntidad: { CodigoDGS: "C0109" },
                      },
                      DatosRecibo: { IdRecibo: "881227974" },
                    },
                  },
                ],
              },
              // ⚠️ FormaPago con Titular/PersonaFisica + IBAN: el mapper lo IGNORA.
              FormaPago: {
                ClaseFormaPago: "IN",
                DatosCuentaCorriente: {
                  IBAN: "ES9121000418450200051332",
                  Titular: {
                    PersonaFisica: { Nombre: "Juan", Apellido1: "Pérez" },
                  },
                },
              },
            },
          },
        },
        ...over,
      },
    },
  };
}

test("mapEiacCefAll: mapea conceptos/saldos/periodo de la cuenta", () => {
  const [c] = mapEiacCefAll(cefParsed());
  assert.equal(c.codigoEntidadDgs, "C0109");
  assert.equal(c.periodo.inicio, "2026-01-01");
  assert.equal(c.periodo.fin, "2026-01-31");
  assert.equal(c.saldos.inicial, "10.00");
  assert.equal(c.saldos.final, "95.03");
  assert.equal(c.conceptos.comisionesRecibos, "95.03");
  assert.equal(c.conceptos.retencionComisiones, "12.00");
  assert.equal(c.conceptos.remesas, "80.77");
});

test("mapEiacCefAll: liquidación (objeto único) + movimientos (array) mapeados", () => {
  const [c] = mapEiacCefAll(cefParsed());
  assert.equal(c.liquidaciones.length, 1);
  const liq = c.liquidaciones[0];
  assert.equal(liq.idLiquidacionEntidad, "LIQ000000001");
  assert.equal(liq.estado, "liquidada"); // LI → liquidada
  assert.equal(liq.fechaLiquidacion, "2026-02-01");
  assert.equal(liq.fechaPago, "2026-02-05");
  assert.equal(liq.importeRemesa, "80.77");
  assert.equal(liq.movimientos.length, 2);
  const m0 = liq.movimientos[0];
  assert.equal(m0.numeroOrden, 1);
  assert.equal(m0.fechaMovimiento, "2026-01-15");
  assert.equal(m0.claseImporte, "LI");
  assert.equal(m0.importe, "68.08");
  assert.equal(m0.idPolizaEntidad, "881227111");
  assert.equal(m0.codigoEntidadDgs, "C0109");
  assert.equal(m0.idReciboEiac, "881227973");
});

test("mapEiacCefAll: NUNCA extrae IBAN/Titular del FormaPago ni del recibo embebido", () => {
  const cuentas = mapEiacCefAll(cefParsed());
  // El JSON serializado del mapeo no contiene el IBAN ni el nombre del titular.
  const serialized = JSON.stringify(cuentas);
  assert.doesNotMatch(serialized, /ES9121000418450200051332/);
  assert.doesNotMatch(serialized, /Titular/i);
  assert.doesNotMatch(serialized, /Juan/);
});

test("mapEiacCefAll: Liquidacion como ARRAY + MovimientoLiquidacion objeto único", () => {
  const [c] = mapEiacCefAll(
    cefParsed({
      Liquidaciones: {
        Liquidacion: [
          {
            DatosLiquidacion: {
              IdLiquidacionEntidad: "L1",
              EstadoLiquidacion: "LI",
              ImporteRemesa: "10.00",
              MovimientosLiquidacion: {
                MovimientoLiquidacion: {
                  NumeroOrden: "1",
                  ImporteMovimiento: { ClaseImporte: "LI", Importe: "10.00" },
                  MovimientoRecibo: {
                    DatosPoliza: { IdPoliza: "P1", CodigoEntidad: { CodigoDGS: "C0109" } },
                    DatosRecibo: { IdRecibo: "R1" },
                  },
                },
              },
            },
          },
          {
            DatosLiquidacion: {
              IdLiquidacionEntidad: "L2",
              EstadoLiquidacion: "PE",
              ImporteRemesa: "5.00",
            },
          },
        ],
      },
    }),
  );
  assert.equal(c.liquidaciones.length, 2);
  assert.equal(c.liquidaciones[0].movimientos.length, 1); // objeto único → 1
  assert.equal(c.liquidaciones[0].movimientos[0].idReciboEiac, "R1");
  assert.equal(c.liquidaciones[1].estado, "pendiente"); // PE → pendiente
  assert.equal(c.liquidaciones[1].movimientos.length, 0); // sin movimientos
});

test("mapEiacCefAll: sin cuentas → [] (no rompe)", () => {
  assert.deepEqual(mapEiacCefAll({ Objetos: {} }), []);
  assert.deepEqual(mapEiacCefAll({}), []);
});

test("mapLiquidacionEstado: dict best-effort + conocido (espejo REC/SIN)", () => {
  assert.deepEqual(mapLiquidacionEstado("LI"), { estado: "liquidada", conocido: true });
  assert.deepEqual(mapLiquidacionEstado("li"), { estado: "liquidada", conocido: true });
  assert.deepEqual(mapLiquidacionEstado("PE"), { estado: "pendiente", conocido: true });
  assert.deepEqual(mapLiquidacionEstado("PA"), { estado: "parcial", conocido: true });
  assert.deepEqual(mapLiquidacionEstado("AN"), { estado: "anulada", conocido: true });
  // desconocido → default pendiente, conocido=false (señaliza, no bloquea).
  assert.deepEqual(mapLiquidacionEstado("ZZ"), { estado: "pendiente", conocido: false });
  // ausente → default pendiente, conocido=false (el caller no señaliza si null).
  assert.deepEqual(mapLiquidacionEstado(null), { estado: "pendiente", conocido: false });
});

// --- #5 red de review CEF: estado de liquidación desconocido → señal (no bloquea) ---
test("mapEiacCefAll: EstadoLiquidacion desconocido (presente) → reviewReason señal", () => {
  const [c] = mapEiacCefAll(
    cefParsed({
      Liquidaciones: {
        Liquidacion: {
          DatosLiquidacion: {
            IdLiquidacionEntidad: "L1",
            EstadoLiquidacion: "ZZ", // código no reconocido
            ImporteRemesa: "10.00",
          },
        },
      },
    }),
  );
  // persiste igual (default pendiente) pero señala la cuenta para revisión.
  assert.equal(c.liquidaciones[0].estado, "pendiente");
  assert.ok(c.reviewReasons.includes("estado_liquidacion_desconocido"));
});

test("mapEiacCefAll: EstadoLiquidacion conocido o ausente → sin reviewReasons", () => {
  // Caso happy-path del fixture base (estado LI conocido).
  const [base] = mapEiacCefAll(cefParsed());
  assert.deepEqual(base.reviewReasons, []);
  // Ausente (sin código) → NO señaliza (no había nada que reconocer).
  const [sinEstado] = mapEiacCefAll(
    cefParsed({
      Liquidaciones: {
        Liquidacion: {
          DatosLiquidacion: { IdLiquidacionEntidad: "L1", ImporteRemesa: "10.00" },
        },
      },
    }),
  );
  assert.equal(sinEstado.liquidaciones[0].estado, "pendiente");
  assert.deepEqual(sinEstado.reviewReasons, []);
});

// ── Huecos 0104 (auditoría 28/09/2026) ────────────────────────────────────────
/** CEF con comisión liquidada, remesa, movimiento contable y mediadores. INVENTADO. */
function cefHuecos(): ParsedEiacCef {
  const p = cefParsed({
    DatosMediador: {
      IdMediador: { CodigoDGS: "J9999", CodigoInterno: "ZZ01" },
      ClaseMediador: "CO",
      NombreMediador: "CORREDURIA DE PRUEBA",
    },
  }) as { Objetos: { CuentaEfectivo: Suelto } };
  const dl = p.Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion;
  dl.DatosMediador = { IdMediador: { CodigoInterno: "ZZ02" }, ClaseMediador: "CO", NombreMediador: "LIQ MED" };
  const [m1, m2] = dl.MovimientosLiquidacion.MovimientoLiquidacion;
  Object.assign(m1.MovimientoRecibo.DatosRecibo, {
    IdRemesa: "900000001",
    SituacionRecibo: "CO",
    ClaseRecibo: "NP",
    DatosComisiones: {
      Comision: [
        { NumeroOrden: "1", ClaseComision: "ME", ComisionBruta: "10.00", ComisionLiquida: "8.50", Base: "100.00", RetencionIRPF: "1.50" },
        { NumeroOrden: "2", ClaseComision: "OT", ComisionBruta: "1.00", ComisionLiquida: "1.00" },
      ],
    },
  });
  // Movimiento SIN recibo: solo el bloque contable.
  delete m2.MovimientoRecibo;
  m2.MovimientoContable = {
    Clase: "OC",
    Concepto: "SALDO PRUEBA",
    Descripcion: "Ajuste de prueba",
    ImporteBruto: "-5.00",
    ImporteLiquido: "-4.00",
    RetencionIRPF: "-1.00",
  };
  return p as ParsedEiacCef;
}

test("huecos 0104: comisión liquidada + idRemesa/situación/clase del recibo → datosExtra del movimiento", () => {
  const [c] = mapEiacCefAll(cefHuecos());
  const mov = c.liquidaciones[0].movimientos[0];
  assert.deepEqual(mov.datosExtra, {
    comision: { clase: "ME", bruta: "10.00", liquida: "8.50", base: "100.00", retencionIrpf: "1.50" },
    comisionesExtra: [{ clase: "OT", bruta: "1.00", liquida: "1.00", base: null, retencionIrpf: null }],
    idRemesa: "900000001",
    situacionRecibo: "CO",
    claseRecibo: "NP",
    // 03/10/2026 — `NumeroOrden` de las comisiones es orden técnico (lista de exclusión).
    cimaExtra: [],
  });
});

test("huecos 0104: MovimientoContable (sin recibo) → datosExtra.contable en la misma fila", () => {
  const [c] = mapEiacCefAll(cefHuecos());
  const mov = c.liquidaciones[0].movimientos[1];
  assert.equal(mov.idReciboEiac, null);
  assert.deepEqual(mov.datosExtra, {
    contable: {
      clase: "OC",
      concepto: "SALDO PRUEBA",
      descripcion: "Ajuste de prueba",
      bruto: "-5.00",
      liquido: "-4.00",
      retencionIrpf: "-1.00",
    },
    cimaExtra: [],
  });
});

test("huecos 0104: mediador de la cuenta y de la liquidación; FormaPago solo la clase (sin IBAN/Titular)", () => {
  const [c] = mapEiacCefAll(cefHuecos());
  assert.deepEqual(c.datosExtra, {
    mediador: { clase: "CO", codigoInterno: "ZZ01", nombre: "CORREDURIA DE PRUEBA" },
    // 03/10/2026 — el DGS del mediador no lo lee `mapMediador`: va al «resto».
    cimaExtra: [{ ruta: "CuentaEfectivo.DatosMediador.IdMediador.CodigoDGS", valor: "J9999" }],
  });
  assert.deepEqual(c.liquidaciones[0].datosExtra, {
    mediador: { clase: "CO", codigoInterno: "ZZ02", nombre: "LIQ MED" },
    claseFormaPago: "IN",
    cimaExtra: [],
  });
  const blob = JSON.stringify(c);
  assert.equal(blob.includes("ES9121000418450200051332"), false);
  assert.equal(blob.includes("Juan"), false);
});

test("huecos 0104: sin bloques nuevos → datosExtra null (no inventa claves)", () => {
  const [c] = mapEiacCefAll(cefParsed());
  assert.equal(c.datosExtra, null);
  assert.equal(c.liquidaciones[0].movimientos[1].datosExtra, null);
});

// --- 03/10/2026: huecos del lote 3 (CEF): copia del recibo dentro de la liquidación ---

test("lote 3 CEF: movimiento guarda importes, cargos, ImportesDEC, fechas, movimientos y numeroSuplemento del recibo", () => {
  const parsed = cefParsed() as Suelto;
  const mov = parsed.Objetos.CuentaEfectivo.Liquidaciones.Liquidacion.DatosLiquidacion.MovimientosLiquidacion.MovimientoLiquidacion[0];
  mov.MovimientoRecibo.DatosPoliza.NumeroSuplemento = "2";
  Object.assign(mov.MovimientoRecibo.DatosRecibo, {
    Fechas: {
      FechaEmision: "2026-01-02T00:00:00",
      FechaEfectoInicial: "2026-01-03T00:00:00",
      FechaEfectoActual: "2026-01-04T00:00:00",
      FechaVencimiento: "2027-01-03T00:00:00",
      FechaSituacion: "9999-12-31T00:00:00",
    },
    DatosImportes: {
      Importes: {
        PrimaNeta: "-80.5",
        PrimaTotal: "100",
        DatosCargos: { Cargo: [{ NumeroOrden: "1", ClaseCargo: "CS", Importe: "3.4", DescripcionCargo: "CONSORCIO" }, { ClaseCargo: "XX", Importe: "no-numero" }] },
      },
      ImportesDEC: { PrimaTotalAnualizada: "1200", ComisionAnualizada: "x" },
    },
    MovimientosRecibo: { Movimiento: { ClaseMovimiento: "EM", FechaMovimiento: "2026-01-02T00:00:00" } },
  });
  const [cuenta] = mapEiacCefAll(parsed);
  const extra = cuenta.liquidaciones[0].movimientos[0].datosExtra!;
  assert.equal(extra.primaNeta, "-80.5", "importe con signo: un recibo anulado puede ser negativo");
  assert.equal(extra.primaTotal, "100");
  assert.deepEqual(extra.cargos, [
    { numeroOrden: "1", clase: "CS", importe: "3.4", descripcion: "CONSORCIO" },
    { clase: "XX" },
  ]);
  assert.deepEqual(extra.importesDec, { PrimaTotalAnualizada: "1200" }, "no numérico → omitido");
  assert.deepEqual(extra.fechasRecibo, {
    emision: "2026-01-02",
    efectoInicial: "2026-01-03",
    efectoActual: "2026-01-04",
    vencimiento: "2027-01-03",
  });
  assert.deepEqual(extra.movimientosRecibo, [{ clase: "EM", fecha: "2026-01-02" }]);
  assert.equal(extra.numeroSuplemento, "2");
  assert.ok(!JSON.stringify(extra).includes("ES91"), "el IBAN embebido sigue sin leerse");
});

test("lote 3 CEF: recibo sin importes/fechas/movimientos → ninguna clave nueva (nunca 0 ni '')", () => {
  const [cuenta] = mapEiacCefAll(cefParsed());
  const extra = cuenta.liquidaciones[0].movimientos[0].datosExtra ?? {};
  for (const k of ["primaNeta", "primaTotal", "cargos", "importesDec", "fechasRecibo", "movimientosRecibo", "numeroSuplemento"]) {
    assert.ok(!(k in extra), k);
  }
});
