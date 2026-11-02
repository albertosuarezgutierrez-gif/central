import assert from "node:assert/strict";
import test from "node:test";

import { parseEiacXml } from "./manual-xml.ts";
import { mapEiacPolAll, type ParsedEiacPol } from "./eiac-pol-mapper.ts";

// --- fixture MÍNIMO de un XML EIAC POL con una sola <Poliza> con
// <RiesgoComunidades> (LOO-829: el gap de mapper ya está arreglado; esto
// prueba la puerta de entrada NUEVA — el parseo de XML crudo del rescate
// manual, no el mapper en sí, que ya tiene su propia batería en
// eiac-pol-mapper.test.ts). Datos SINTÉTICOS, nunca PII real. ---
const XML_MINIMO_COMUNIDADES = `<?xml version="1.0" encoding="UTF-8"?>
<ProcesosEIAC>
  <Objetos>
    <Poliza>
      <DatosPoliza>
        <IdPoliza>P01</IdPoliza>
        <CodigoEntidad>
          <CodigoDGS>C0072</CodigoDGS>
        </CodigoEntidad>
        <DatosRamo>
          <RamoDGS>241</RamoDGS>
          <DescripcionRamo>GENERALI COMUNIDADES</DescripcionRamo>
        </DatosRamo>
      </DatosPoliza>
      <SituacionPoliza>EV</SituacionPoliza>
      <Fechas>
        <FechaEfectoInicial>2020-02-01T00:00:00</FechaEfectoInicial>
        <FechaVencimiento>2021-02-01T00:00:00</FechaVencimiento>
      </Fechas>
      <DatosRiesgos>
        <Riesgo>
          <RiesgoComunidades>
            <SituacionRiesgo>
              <CodigoPostal>41003</CodigoPostal>
            </SituacionRiesgo>
          </RiesgoComunidades>
        </Riesgo>
      </DatosRiesgos>
      <Tomador>
        <PersonaFisica>
          <TipoIdentificacion>NI</TipoIdentificacion>
          <IdPersona>00000001R</IdPersona>
          <Nombre>Nombre</Nombre>
          <Apellido1>Apellido</Apellido1>
        </PersonaFisica>
      </Tomador>
    </Poliza>
  </Objetos>
</ProcesosEIAC>
`;

test("parseEiacXml: XML EIAC mínimo con RiesgoComunidades → mapEiacPolAll da ok/comunidades", () => {
  const parsed = parseEiacXml(XML_MINIMO_COMUNIDADES) as ParsedEiacPol;
  const [mapped] = mapEiacPolAll(parsed);

  assert.equal(mapped.outcome, "ok");
  assert.equal(mapped.tipoSeguro, "comunidades");
  assert.equal(mapped.idPolizaEntidad, "P01");
  assert.equal(mapped.codigoEntidadDgs, "C0072");
  assert.deepEqual(mapped.reviewReasons, []);
});

test("parseEiacXml: CodigoPostal '41003' se conserva como STRING (parseTagValue:false)", () => {
  const parsed = parseEiacXml(XML_MINIMO_COMUNIDADES) as {
    ProcesosEIAC: {
      Objetos: {
        Poliza: { DatosRiesgos: { Riesgo: { RiesgoComunidades: { SituacionRiesgo: { CodigoPostal: unknown } } } } };
      };
    };
  };
  const cp =
    parsed.ProcesosEIAC.Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoComunidades
      .SituacionRiesgo.CodigoPostal;
  assert.equal(typeof cp, "string");
  assert.equal(cp, "41003");
});

test("parseEiacXml: lanza ante texto sin <Objetos> reconocible (revisión Graphify #835) — fast-xml-parser por sí solo NO lanza con XML mal formado (verificado: devuelve {} en silencio), así que sin esta guarda un fichero corrupto se colaría como 'datos: {}' y el pipeline lo procesaría como 0 pólizas en vez de como un 400 xml_ilegible", () => {
  assert.throws(() => parseEiacXml(""));
  assert.throws(() => parseEiacXml("esto no es XML"));
  assert.throws(() => parseEiacXml("<a><b>sin objetos</b></a>"));
});
