/**
 * LOO-753 — Unit tests del mapper PURO `mapEiacRecAll`. Verifica el mapeo de la
 * estructura REAL del REC (probe 2026-06-24): situación→estado (dict + default +
 * review por desconocido), fechas (toIsoDate), primas/comisiones, **IBAN en claro**
 * (el cifrado es del persist), y la cola heterogénea (cargos/movimientos/otros) →
 * datosExtra. Gating: sin IdRecibo → review.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  mapEiacRecAll,
  mapReciboSituacion,
  type ParsedEiacRec,
} from "./eiac-rec-mapper.ts";

// Fixture EIAC sin tipos: los tests lo mutan a mano (huecos 0104).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Suelto = Record<string, any>;

/** Fichero REC con la forma real del probe (1 recibo). */
function recParsed(over: Record<string, unknown> = {}): ParsedEiacRec {
  return {
    Objetos: {
      Recibo: {
        DatosPoliza: {
          IdPoliza: "881227111",
          CodigoEntidad: { CodigoDGS: "C0109" },
        },
        DatosRecibo: {
          IdRecibo: "881227973",
          SituacionRecibo: "CO",
          ClaseRecibo: "NP",
          Fechas: {
            FechaSituacion: "2026-03-01T00:00:00",
            FechaEfectoInicial: "2026-01-01T00:00:00",
            FechaEfectoActual: "2026-01-01T00:00:00",
            FechaVencimiento: "2027-01-01T00:00:00",
            FechaEmision: "2026-01-05T00:00:00",
          },
          GestionCobro: {
            ClaseGestion: "CO",
            DatosFormaPago: {
              ClaseFormaPago: "CC",
              DatosCuentaCorriente: { IBAN: "ES9121000418450200051332" },
            },
          },
          DatosImportes: {
            Importes: {
              PrimaTotal: "731.15",
              PrimaNeta: "667.48",
              DatosCargos: {
                Cargo: [
                  { NumeroOrden: "1", ClaseCargo: "AR", Importe: "0.00", DescripcionCargo: "Recargo" },
                  { NumeroOrden: "2", ClaseCargo: "CL", Importe: "5.00", DescripcionCargo: "Consorcio" },
                ],
              },
            },
            ImportesDEC: { PrimaTotalAnualizada: "737.22", PrimaNetaAnualizada: "673.01" },
          },
          DatosComisiones: {
            Comision: [
              { NumeroOrden: "1", ClaseComision: "ME", ComisionBruta: "63.67", ComisionLiquida: "50.00", Base: "667.48", RetencionIRPF: "13.67" },
              { NumeroOrden: "2", ClaseComision: "AD", ComisionBruta: "10.00", ComisionLiquida: "8.00", Base: "100.00", RetencionIRPF: "2.00" },
            ],
          },
          MovimientosRecibo: {
            Movimiento: { NumeroOrden: "1", ClaseMovimiento: "EM", FechaMovimiento: "2026-01-05T00:00:00" },
          },
          OtrosDatos: {
            Dato: [
              { NumeroOrden: "1", IdDato: "FORMA_PAGO", DescripcionDato: "Forma de pago", IdSubdato: "1", ValorSubdato: "Domiciliado" },
              { NumeroOrden: "2", IdDato: "NIF_PAGADOR", DescripcionDato: "NIF_PAGADOR", IdSubdato: "1", ValorSubdato: "12345678Z" },
              { NumeroOrden: "3", IdDato: "PAGADOR", DescripcionDato: "PAGADOR", IdSubdato: "1", ValorSubdato: "PEPE PEREZ" },
              { NumeroOrden: "4", IdDato: "DOC_TOM", DescripcionDato: "DOCUMENTO TOMADOR", IdSubdato: "1", ValorSubdato: "87654321X" },
              { NumeroOrden: "5", IdDato: "NIF_CIF", DescripcionDato: "NIF_CIF", IdSubdato: "1", ValorSubdato: "B00000001" },
              { NumeroOrden: "6", IdDato: "Id_Cliente", DescripcionDato: "Identificador Cliente", IdSubdato: "1", ValorSubdato: "11111111H" },
              { NumeroOrden: "7", IdDato: "Pobl_Cliente", DescripcionDato: "Población del Cliente", IdSubdato: "1", ValorSubdato: "VILLAPUEBLO" },
              { NumeroOrden: "9", IdDato: "REF_X", DescripcionDato: "Referencia", IdSubdato: "1", ValorSubdato: "X1234567L" },
              { NumeroOrden: "8", IdDato: "Post_Cliente", DescripcionDato: "Código Postal del Cliente", IdSubdato: "1", ValorSubdato: "41003" },
            ],
          },
        },
      },
    },
    ...over,
  };
}

test("mapEiacRecAll: mapea clave de negocio, situación CO→cobrado, fechas e importes", () => {
  const [m] = mapEiacRecAll(recParsed());
  assert.equal(m.outcome, "ok");
  assert.deepEqual(m.reviewReasons, []);
  assert.equal(m.idRecibo, "881227973");
  assert.equal(m.codigoEntidadDgs, "C0109");
  assert.equal(m.idPolizaEntidad, "881227111");
  assert.equal(m.situacion, "cobrado");
  assert.equal(m.claseRecibo, "NP");
  // Fechas → ISO YYYY-MM-DD.
  assert.equal(m.fechaVencimiento, "2027-01-01");
  assert.equal(m.fechaEmision, "2026-01-05");
  assert.equal(m.fechaEfectoInicial, "2026-01-01");
  assert.equal(m.fechaSituacion, "2026-03-01");
  // Importes (negocio, claro).
  assert.equal(m.primaTotal, "731.15");
  assert.equal(m.primaNeta, "667.48");
  assert.equal(m.formaPago, "CC");
  // Primera comisión a columna.
  assert.equal(m.comisionBruta, "63.67");
  assert.equal(m.comisionLiquida, "50.00");
});

test("mapEiacRecAll: el IBAN se extrae EN CLARO (el cifrado es del persist)", () => {
  const [m] = mapEiacRecAll(recParsed());
  // El mapper NO cifra: devuelve el IBAN en claro para que el persist lo cifre.
  assert.equal(m.iban, "ES9121000418450200051332");
});

test("mapEiacRecAll: cargos/comisiones extra/movimientos/otros → datosExtra (sin PII)", () => {
  const [m] = mapEiacRecAll(recParsed());
  assert.ok(m.datosExtra, "datosExtra presente");
  const extra = m.datosExtra as Record<string, unknown>;
  // Cargos (2).
  assert.ok(Array.isArray(extra.cargos));
  assert.equal((extra.cargos as unknown[]).length, 2);
  // Comisión extra (la [0] va a columna; la [1] aquí).
  assert.ok(Array.isArray(extra.comisionesExtra));
  assert.equal((extra.comisionesExtra as unknown[]).length, 1);
  // Movimientos + otrosDatos + importesDec.
  assert.ok(Array.isArray(extra.movimientos));
  assert.ok(Array.isArray(extra.otrosDatos));
  assert.ok(extra.importesDec);
  // datosExtra NO contiene el IBAN (PII) en ningún sitio.
  assert.doesNotMatch(JSON.stringify(extra), /ES9121000418450200051332/);
});

test("mapEiacRecAll: sin IdRecibo → review falta_id_recibo", () => {
  const p = recParsed();
  // @ts-expect-error — forzamos la ausencia de IdRecibo en el fixture.
  delete (p.Objetos!.Recibo as Record<string, unknown>).DatosRecibo.IdRecibo;
  const [m] = mapEiacRecAll(p);
  assert.equal(m.outcome, "review");
  assert.ok(m.reviewReasons.includes("falta_id_recibo"));
});

test("mapEiacRecAll: SituacionRecibo desconocida → default pendiente + review", () => {
  const p = recParsed();
  (p.Objetos!.Recibo as Record<string, { SituacionRecibo: string }>).DatosRecibo.SituacionRecibo =
    "ZZ";
  const [m] = mapEiacRecAll(p);
  assert.equal(m.situacion, "pendiente"); // default defensivo
  assert.equal(m.outcome, "review");
  assert.ok(m.reviewReasons.includes("estado_recibo_desconocido:ZZ"));
  assert.ok(m.reviewReasons.every((r) => !r.startsWith("estado_recibo_desconocido") || r.endsWith(":ZZ")));
});

test("mapEiacRecAll: SituacionRecibo LI (Liquidado) → cobrado sin review", () => {
  const p = recParsed();
  (p.Objetos!.Recibo as Record<string, { SituacionRecibo: string }>).DatosRecibo.SituacionRecibo =
    "LI";
  const [m] = mapEiacRecAll(p);
  assert.equal(m.situacion, "cobrado");
  assert.ok(!m.reviewReasons.some((r) => r.startsWith("estado_recibo_desconocido")));
  assert.equal(m.outcome, "ok");
});

test("mapEiacRecAll: SituacionRecibo RE (Rehabilitado) → pendiente sin review", () => {
  const p = recParsed();
  (p.Objetos!.Recibo as Record<string, { SituacionRecibo: string }>).DatosRecibo.SituacionRecibo =
    "re";
  const [m] = mapEiacRecAll(p);
  assert.equal(m.situacion, "pendiente");
  assert.ok(!m.reviewReasons.some((r) => r.startsWith("estado_recibo_desconocido")));
  assert.equal(m.outcome, "ok");
});

test("mapReciboSituacion: dict best-effort + conocido", () => {
  assert.deepEqual(mapReciboSituacion("CO"), { situacion: "cobrado", conocido: true });
  assert.deepEqual(mapReciboSituacion("EM"), { situacion: "emitido", conocido: true });
  assert.deepEqual(mapReciboSituacion("DE"), { situacion: "devuelto", conocido: true });
  assert.deepEqual(mapReciboSituacion("AN"), { situacion: "anulado", conocido: true });
  // Oficiales EIAC V07.1 §13.3.33: LI liquidado → cobrado; RE rehabilitado → pendiente.
  assert.deepEqual(mapReciboSituacion("LI"), { situacion: "cobrado", conocido: true });
  assert.deepEqual(mapReciboSituacion("RE"), { situacion: "pendiente", conocido: true });
  // desconocido → default pendiente, conocido=false.
  assert.deepEqual(mapReciboSituacion("XX"), { situacion: "pendiente", conocido: false });
  // ausente → default pendiente, conocido=false (el caller no manda review si null).
  assert.deepEqual(mapReciboSituacion(null), { situacion: "pendiente", conocido: false });
});

test("mapEiacRecAll: Recibo como array → mapea cada uno; vacío → 1 review", () => {
  const p: ParsedEiacRec = { Objetos: { Recibo: [] } };
  const out = mapEiacRecAll(p);
  assert.equal(out.length, 1);
  assert.equal(out[0].outcome, "review");
});

test("mapEiacRecAll: tolera ProcesosEIAC wrapper y datos basura sin throw", () => {
  const wrapped: ParsedEiacRec = {
    ProcesosEIAC: { Objetos: { Recibo: recParsed().Objetos!.Recibo } },
  };
  const [m] = mapEiacRecAll(wrapped);
  assert.equal(m.idRecibo, "881227973");
  // Datos basura → 1 review, sin throw.
  const garbage = mapEiacRecAll({} as ParsedEiacRec);
  assert.equal(garbage[0].outcome, "review");
});

test("mapEiacRecAll: OtrosDatos de PERSONA (NIF_PAGADOR, PAGADOR, DOCUMENTO TOMADOR, NIF_CIF) no se guardan", () => {
  const [m] = mapEiacRecAll(recParsed());
  const extra = m.datosExtra as Record<string, unknown>;
  const json = JSON.stringify(extra.otrosDatos);
  assert.match(json, /FORMA_PAGO/);
  assert.doesNotMatch(json, /12345678Z|PEPE PEREZ|87654321X|B00000001|PAGADOR|NIF_CIF|11111111H|VILLAPUEBLO|41003|X1234567L/);
});

// ── Huecos 0104 (auditoría 28/09/2026) ────────────────────────────────────────
/** Recibo con los bloques que antes se tiraban. Valores INVENTADOS. */
function recHuecos(): ParsedEiacRec {
  const base = recParsed() as { Objetos: { Recibo: Suelto } };
  const r = base.Objetos.Recibo;
  r.DatosPoliza.NumeroSuplemento = "0003";
  r.DatosPoliza.DatosMediador = {
    IdMediador: { CodigoDGS: "J9999", CodigoInterno: "ZZ01" },
    ClaseMediador: "CO",
    NombreMediador: "CORREDURIA DE PRUEBA",
  };
  r.DatosRecibo.IdRemesa = "900000001";
  r.DatosRecibo.GestionCobro.ClaseGestion = "ME";
  r.DatosRecibo.Fechas.FechaFinSeguro = "2027-06-30T00:00:00";
  r.DatosRecibo.DatosImportes.Importes.OtrosImportes = {
    Importe: { ClaseOtroImporte: "BO", Importe: "-12.50", DescripcionOtroImporte: "Bonificacion" },
  };
  r.DatosRecibo.DatosImportes.Importes.DatosMoneda = { Moneda: "EUR", TipoCambio: "1" };
  r.DatosRecibo.MovimientosRecibo = {
    Movimiento: [
      { NumeroOrden: "1", ClaseMovimiento: "EM", FechaMovimiento: "2026-01-05T00:00:00" },
      {
        NumeroOrden: "2",
        ClaseMovimiento: "AN",
        FechaMovimiento: "2026-02-01T00:00:00",
        Anulacion: { MotivoAnulacion: "FA", DescripcionMotivo: "Anulacion falta de pago" },
      },
    ],
  };
  r.DatosRecibo.GestionCobro.DatosFormaPago.DatosCuentaCorriente.Titular = {
    PersonaFisica: { Nombre: "FULANITO", Apellido1: "DE TAL" },
  };
  return base as ParsedEiacRec;
}

test("huecos 0104: IdRemesa, ClaseGestion y la Comision[0] completa van a columna", () => {
  const [m] = mapEiacRecAll(recHuecos());
  assert.equal(m.outcome, "ok");
  assert.equal(m.idRemesa, "900000001");
  assert.equal(m.gestionCobro, "ME");
  assert.equal(m.claseComision, "ME");
  assert.equal(m.baseComision, "667.48");
  assert.equal(m.retencionIrpf, "13.67");
  // La [0] no se duplica en comisionesExtra.
  const extra = m.datosExtra as Suelto;
  assert.equal(extra.comisionesExtra.length, 1);
  assert.equal(extra.comisionesExtra[0].claseComision, "AD");
});

test("huecos 0104: Base/IRPF no numéricos → null (no romper el INSERT a numeric)", () => {
  const p = recHuecos() as { Objetos: { Recibo: Suelto } };
  p.Objetos.Recibo.DatosRecibo.DatosComisiones.Comision[0].Base = "1.234,56";
  p.Objetos.Recibo.DatosRecibo.DatosComisiones.Comision[0].RetencionIRPF = "N/A";
  const [m] = mapEiacRecAll(p as ParsedEiacRec);
  assert.equal(m.baseComision, null);
  assert.equal(m.retencionIrpf, null);
});

test("huecos 0104: motivo de anulación, bonificaciones, suplemento, mediador y fin del seguro → datosExtra", () => {
  const [m] = mapEiacRecAll(recHuecos());
  const extra = m.datosExtra as Suelto;
  assert.deepEqual(extra.movimientos[1], {
    numeroOrden: "2",
    claseMovimiento: "AN",
    fechaMovimiento: "2026-02-01",
    motivoAnulacion: "FA",
    descripcionMotivo: "Anulacion falta de pago",
  });
  // Un movimiento sin Anulacion no gana claves vacías.
  assert.equal("motivoAnulacion" in extra.movimientos[0], false);
  assert.deepEqual(extra.otrosImportes, [
    { clase: "BO", importe: "-12.50", descripcion: "Bonificacion" },
  ]);
  assert.equal(extra.numeroSuplemento, "0003");
  assert.deepEqual(extra.mediador, {
    clase: "CO",
    codigoInterno: "ZZ01",
    nombre: "CORREDURIA DE PRUEBA",
  });
  assert.equal(extra.fechaFinSeguro, "2027-06-30");
});

test("huecos 0104: descartes — EUR no se guarda, el Titular de la cuenta tampoco", () => {
  const [m] = mapEiacRecAll(recHuecos());
  const extra = m.datosExtra as Suelto;
  assert.equal("moneda" in extra, false);
  const blob = JSON.stringify(m);
  assert.equal(blob.includes("FULANITO"), false);
  assert.equal(blob.includes("DE TAL"), false);
});

test("huecos 0104: moneda ≠ EUR → se guarda y el recibo va a revisión (no pintar USD como €)", () => {
  const p = recHuecos() as { Objetos: { Recibo: Suelto } };
  p.Objetos.Recibo.DatosRecibo.DatosImportes.Importes.DatosMoneda.Moneda = "USD";
  const [m] = mapEiacRecAll(p as ParsedEiacRec);
  assert.equal(m.outcome, "review");
  assert.ok(m.reviewReasons.includes("moneda_no_eur"));
  assert.equal((m.datosExtra as Suelto).moneda, "USD");
});
