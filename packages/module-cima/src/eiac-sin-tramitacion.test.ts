import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { XMLParser } from "fast-xml-parser";

import { extractAcciones, extractPagos, extractSituaciones, mapEiacSinAll, type ParsedEiacSin } from "./eiac-sin-mapper.ts";

// Ejemplo OFICIAL de TIREA (XML-V07-1_V05.zip, «siniestro-mov-pagos»): datos
// sintéticos del propio estándar, no de un cliente. Se parsea de dos maneras
// —valores como texto y como número— porque el adaptador puede dar cualquiera.
const XML = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "__fixtures__", "eiac-siniestro-mov-pagos-V07-1_V05.xml"), "utf8");
const parsear = (parseTagValue: boolean) =>
  new XMLParser({ ignoreAttributes: true, removeNSPrefix: true, parseTagValue }).parse(XML) as ParsedEiacSin;

for (const parseTagValue of [false, true]) {
  test(`tramitación del ejemplo oficial TIREA (valores ${parseTagValue ? "numéricos" : "texto"})`, () => {
    const [s] = mapEiacSinAll(parsear(parseTagValue));
    // V07.1: `<CodigoEntidad>C0001</CodigoEntidad>` es TEXTO (en 6.0 era objeto);
    // sin este brazo el DGS nulo pasó en silencio.
    assert.equal(s.codigoEntidadDgs, "C0001");
    assert.deepEqual(s.situaciones, [{ codigo: "AP", fecha: "2024-01-01", descripcion: null }]);
    assert.deepEqual(
      s.acciones.map((a) => [a.accion, a.situacion, a.fecha, a.figuras.join()]),
      [
        ["DI", "EC", "2024-01-01", "TR"],
        ["EP", "FI", "2024-01-02", "PE"],
      ],
    );
    assert.equal(s.acciones[1].descripcion, "Entregado informe pericial.");
    assert.deepEqual(s.pagos, [{
      fecha: "2024-07-02",
      importe: "500.00",
      descripcion: "Pago por concepto.",
      receptor: "PE",
      fechaLiquidacion: "2024-07-01",
      formaPago: "IN",
      coberturas: [{ id: "COB01", descripcion: "Descripción de la cobertura", modalidad: "PR" }],
    }]);
    // 28/09/2026: el IBAN del perceptor viene en el ejemplo oficial y NO se guarda.
    assert.doesNotMatch(JSON.stringify(s), /ES7921000813610123456789/);
    assert.equal(s.fechaDeclaracion, "2024-01-01");
    assert.equal(s.totalRecobros, "0.00", "0 que vino ≠ null");
    assert.deepEqual(s.reservaDesglose, { descripcion: "Reserva actual", coberturas: [] });
    assert.equal(s.importeReserva, "1000.00");
    assert.equal(s.importeIndemnizacion, "500.00");
    assert.equal(s.totalPagos, "500.00");
    assert.equal(s.posicion, "RE");
  });
}

test("sin bloques de tramitación → listas vacías e importes null (no 0)", () => {
  const [s] = mapEiacSinAll({ Objetos: { Siniestro: { DatosSiniestro: { IdSiniestroEntidad: "X" } } } });
  assert.deepEqual([s.situaciones, s.acciones, s.pagos], [[], [], []]);
  assert.equal(s.importeReserva, null);
  assert.equal(s.totalPagos, null);
  assert.equal(s.posicion, null);
});

test("lo que no tiene código o importe se descarta; nunca lanza", () => {
  assert.deepEqual(extractSituaciones({ Situacion: [{ FechaSituacion: "2024-01-01" }] }), []);
  assert.deepEqual(extractAcciones({ Accion: { DescripcionAccion: "sin clase" } }), []);
  assert.deepEqual(extractPagos({ PagoSiniestro: { DescripcionPago: "sin fecha ni importe" } }), []);
  assert.deepEqual(extractAcciones(undefined), []);
});
