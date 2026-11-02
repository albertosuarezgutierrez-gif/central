/**
 * EIAC V07.1 (producción el 16/11/2026): `CodigoEntidad` pasa de objeto
 * `{CodigoInterno, CodigoDGS}` (6.0) a texto «C0001». Los cuatro mappers (POL, REC,
 * SIN, CEF) tienen que sacar el DGS de AMBAS formas: los ficheros 6.0 y 7.1
 * conviven. Fixtures: ejemplos OFICIALES de TIREA (`*-V07-1_V06.xml`, datos
 * sintéticos del propio estándar, sin PII real), parseados por el camino de
 * producción (`parseEiacXml`) y también con valores numéricos (el adaptador puede
 * dar cualquiera de las dos).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { XMLParser } from "fast-xml-parser";

import { CODIGO_ENTIDAD_FORMATO_DESCONOCIDO } from "./codigo-entidad.ts";
import { extractDatosPoliza, mapEiacPolAll, type ParsedEiacPol } from "./eiac-pol-mapper.ts";
import { mapEiacRecAll, type ParsedEiacRec } from "./eiac-rec-mapper.ts";
import { mapEiacSinAll, type ParsedEiacSin } from "./eiac-sin-mapper.ts";
import { mapEiacCefAll, type ParsedEiacCef } from "./eiac-cef-mapper.ts";
import { extractTercerosSiniestro } from "./figuras-cima.ts";
import { parseEiacXml } from "./manual-xml.ts";

const leer = (nombre: string) =>
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "__fixtures__", nombre), "utf8");

const PARSERS: Array<[string, (xml: string) => unknown]> = [
  ["texto (producción)", (xml) => parseEiacXml(xml)],
  ["numérico", (xml) => new XMLParser({ ignoreAttributes: true, removeNSPrefix: true, parseTagValue: true }).parse(xml)],
];

/** Sustituye el texto de TODOS los `<CodigoEntidad>` (para el guardián de formato). */
const conCodigoEntidad = (xml: string, valor: string) =>
  xml.replace(/<CodigoEntidad>C0001<\/CodigoEntidad>/g, `<CodigoEntidad>${valor}</CodigoEntidad>`);

for (const [modo, parse] of PARSERS) {
  test(`V07.1 POL (${modo}): DGS relleno desde CodigoEntidad en texto`, () => {
    const [p] = mapEiacPolAll(parse(leer("eiac-polizas-V07-1_V06.xml")) as ParsedEiacPol);
    assert.equal(p.codigoEntidadDgs, "C0001");
  });

  test(`V07.1 POL colectiva (${modo}): DGS relleno`, () => {
    const [p] = mapEiacPolAll(parse(leer("eiac-pol-colectiva-V07-1_V06.xml")) as ParsedEiacPol);
    assert.equal(p.codigoEntidadDgs, "C0001");
  });

  test(`V07.1 REC (${modo}): DGS relleno`, () => {
    const [r] = mapEiacRecAll(parse(leer("eiac-recibos-V07-1_V06.xml")) as ParsedEiacRec);
    assert.equal(r.codigoEntidadDgs, "C0001");
  });

  test(`V07.1 SIN declaración (${modo}): DGS relleno`, () => {
    const [s] = mapEiacSinAll(parse(leer("eiac-siniestro-dec-V07-1_V06.xml")) as ParsedEiacSin);
    assert.equal(s.codigoEntidadDgs, "C0001");
  });

  test(`V07.1 CEF (${modo}): DGS de la cuenta relleno`, () => {
    const [c] = mapEiacCefAll(parse(leer("eiac-ctaefectivo-V07-1_V06.xml")) as ParsedEiacCef);
    assert.equal(c.codigoEntidadDgs, "C0001");
  });

  test(`V07.1 CEF (${modo}): DGS de cada movimiento de recibo relleno`, () => {
    const [c] = mapEiacCefAll(parse(leer("eiac-ctaefectivo-V07-1_V06.xml")) as ParsedEiacCef);
    // Solo los movimientos de RECIBO llevan DatosPoliza (los de pago/otros no).
    const dgs = c.liquidaciones.flatMap((l) =>
      l.movimientos.filter((m) => m.idPolizaEntidad !== null).map((m) => m.codigoEntidadDgs),
    );
    assert.equal(dgs.length, 3, "el ejemplo trae 3 movimientos de recibo");
    assert.deepEqual([...new Set(dgs)], ["C0001"]);
  });
}

test("V07.1 sin nota de formato en los ejemplos oficiales (todo legible)", () => {
  const xml = (n: string) => parseEiacXml(leer(n));
  const notas = [
    ...mapEiacPolAll(xml("eiac-polizas-V07-1_V06.xml") as ParsedEiacPol).flatMap((m) => m.reviewReasons),
    ...mapEiacRecAll(xml("eiac-recibos-V07-1_V06.xml") as ParsedEiacRec).flatMap((m) => m.reviewReasons),
    ...mapEiacSinAll(xml("eiac-siniestro-dec-V07-1_V06.xml") as ParsedEiacSin).flatMap((m) => m.reviewReasons),
    ...mapEiacCefAll(xml("eiac-ctaefectivo-V07-1_V06.xml") as ParsedEiacCef).flatMap((m) => m.reviewReasons),
  ];
  assert.ok(!notas.includes(CODIGO_ENTIDAD_FORMATO_DESCONOCIDO));
});

// --- Convivencia: la forma 6.0 (objeto) sigue saliendo igual ---

test("V06 POL: objeto {CodigoInterno, CodigoDGS} sigue dando el DGS", () => {
  const [p] = mapEiacPolAll({
    Objetos: { Poliza: { DatosPoliza: { IdPoliza: "X1", CodigoEntidad: { CodigoInterno: "5", CodigoDGS: "C0058" } } } },
  });
  assert.equal(p.codigoEntidadDgs, "C0058");
});

test("V06 REC: objeto sigue dando el DGS", () => {
  const [r] = mapEiacRecAll({
    Objetos: { Recibo: { DatosPoliza: { IdPoliza: "X1", CodigoEntidad: { CodigoDGS: "C0109" } }, DatosRecibo: { IdRecibo: "R1" } } },
  });
  assert.equal(r.codigoEntidadDgs, "C0109");
});

test("V06 SIN: objeto sigue dando el DGS", () => {
  const [s] = mapEiacSinAll({
    Objetos: { Siniestro: { DatosPoliza: { IdPoliza: "X1", CodigoEntidad: { CodigoDGS: "C0072" } }, DatosSiniestro: { IdSiniestroEntidad: "S1" } } },
  });
  assert.equal(s.codigoEntidadDgs, "C0072");
});

test("V06 CEF: objeto sigue dando el DGS de cuenta y movimiento", () => {
  const [c] = mapEiacCefAll({
    Objetos: {
      CuentaEfectivo: {
        CodigoEntidad: { CodigoDGS: "C0468" },
        Liquidaciones: {
          Liquidacion: {
            DatosLiquidacion: {
              MovimientosLiquidacion: {
                MovimientoLiquidacion: { MovimientoRecibo: { DatosPoliza: { IdPoliza: "X1", CodigoEntidad: { CodigoDGS: "C0468" } } } },
              },
            },
          },
        },
      },
    },
  } as ParsedEiacCef);
  assert.equal(c.codigoEntidadDgs, "C0468");
  assert.equal(c.liquidaciones[0]?.movimientos[0]?.codigoEntidadDgs, "C0468");
});

// --- Los otros dos lectores de CodigoEntidad (póliza reemplazada, contrario) ---

test("póliza reemplazada: DGS en texto V07.1 y en objeto V06", () => {
  const v07 = extractDatosPoliza({ DatosPolizaReemplazada: { IdPoliza: "R1", CodigoEntidad: "C0468" } });
  assert.equal((v07?.polizaReemplazada as { codigoDgs?: string }).codigoDgs, "C0468");
  const v06 = extractDatosPoliza({ DatosPolizaReemplazada: { IdPoliza: "R1", CodigoEntidad: { CodigoDGS: "C0468" } } });
  assert.equal((v06?.polizaReemplazada as { codigoDgs?: string }).codigoDgs, "C0468");
});

test("contrario de siniestro: DGS de su compañía en texto V07.1", () => {
  const ts = extractTercerosSiniestro({
    Contrarios: { Contrario: { DatosPoliza: { NombreEntidad: "CIA FICTICIA", CodigoEntidad: "m0083", IdPoliza: "X-1" } } },
  });
  assert.equal(ts.find((x) => x.papel === "contrario")?.codigoEntidadDgs, "M0083");
});

test("prima anual por compañía (C0058/C0072) también con CodigoEntidad en texto", () => {
  const [p] = mapEiacPolAll({
    Objetos: {
      Poliza: {
        DatosPoliza: { IdPoliza: "X1", CodigoEntidad: "C0058" },
        FraccionPago: "SE",
        DatosImportes: { Importes: { PrimaTotal: "500.00", PrimaNeta: "400.00" } },
      },
    },
  } as ParsedEiacPol);
  assert.equal(p.primaBruta, "500.00", "C0058 manda la prima total anual aunque fraccione");
});

// --- Guardián: CodigoEntidad presente pero ilegible ≠ «falta» ---

test("guardián REC: CodigoEntidad ilegible → nota específica, outcome sin cambiar", () => {
  const xml = leer("eiac-recibos-V07-1_V06.xml");
  const [ok] = mapEiacRecAll(parseEiacXml(xml) as ParsedEiacRec);
  const [r] = mapEiacRecAll(parseEiacXml(conCodigoEntidad(xml, "ALLIANZ")) as ParsedEiacRec);
  assert.equal(r.codigoEntidadDgs, null);
  assert.ok(r.reviewReasons.includes(CODIGO_ENTIDAD_FORMATO_DESCONOCIDO));
  assert.equal(r.outcome, ok.outcome, "la nota no manda a review por sí sola");
});

test("guardián SIN: CodigoEntidad ilegible → nota específica, outcome sin cambiar", () => {
  const xml = leer("eiac-siniestro-dec-V07-1_V06.xml");
  const [ok] = mapEiacSinAll(parseEiacXml(xml) as ParsedEiacSin);
  const [s] = mapEiacSinAll(parseEiacXml(conCodigoEntidad(xml, "ALLIANZ")) as ParsedEiacSin);
  assert.equal(s.codigoEntidadDgs, null);
  assert.ok(s.reviewReasons.includes(CODIGO_ENTIDAD_FORMATO_DESCONOCIDO));
  assert.equal(s.outcome, ok.outcome, "la nota no manda a review por sí sola");
});

test("guardián POL: CodigoEntidad ilegible → nota específica, outcome sin cambiar", () => {
  const xml = leer("eiac-polizas-V07-1_V06.xml");
  const [ok] = mapEiacPolAll(parseEiacXml(xml) as ParsedEiacPol);
  const [p] = mapEiacPolAll(parseEiacXml(conCodigoEntidad(xml, "ALLIANZ")) as ParsedEiacPol);
  assert.equal(p.codigoEntidadDgs, null);
  assert.ok(p.reviewReasons.includes(CODIGO_ENTIDAD_FORMATO_DESCONOCIDO));
  assert.equal(p.outcome, ok.outcome, "una POL sin DGS ya entraba: la nota no la manda a review");
});

test("guardián CEF: CodigoEntidad ilegible → señal específica", () => {
  const xml = leer("eiac-ctaefectivo-V07-1_V06.xml");
  const [c] = mapEiacCefAll(parseEiacXml(conCodigoEntidad(xml, "ALLIANZ")) as ParsedEiacCef);
  assert.equal(c.codigoEntidadDgs, null);
  assert.ok(c.reviewReasons.includes(CODIGO_ENTIDAD_FORMATO_DESCONOCIDO));
});

test("guardián: CodigoEntidad AUSENTE no es «formato desconocido» (sigue siendo falta)", () => {
  const xml = leer("eiac-recibos-V07-1_V06.xml").replace(/<CodigoEntidad>C0001<\/CodigoEntidad>/g, "");
  const [r] = mapEiacRecAll(parseEiacXml(xml) as ParsedEiacRec);
  assert.equal(r.codigoEntidadDgs, null);
  assert.ok(!r.reviewReasons.includes(CODIGO_ENTIDAD_FORMATO_DESCONOCIDO));
});

test("contrario en el mapper SIN (figuras): DGS de su compañía en texto V07.1", () => {
  const [s] = mapEiacSinAll({
    Objetos: {
      Siniestro: {
        DatosPoliza: { IdPoliza: "X1", CodigoEntidad: "C0109" },
        DatosSiniestro: {
          IdSiniestroEntidad: "S1",
          FechaOcurrencia: "2026-03-01T00:00:00",
          Contrarios: { Contrario: { DatosPoliza: { NombreEntidad: "CIA FICTICIA", CodigoEntidad: "m0083", IdPoliza: "X-1" } } },
        },
      },
    },
  } as ParsedEiacSin);
  assert.equal(s.figuras.find((f) => f.kind === "contrario")?.codigoEntidadDgs, "M0083");
});
