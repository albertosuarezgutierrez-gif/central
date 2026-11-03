/**
 * PORT central (fase 3) — los 4 tests de `figuras-cima.test.ts` del CRM que se
 * recortaron en la fase 1 porque usan funciones de la capa de BD:
 * `prepararDatosEspecificosCima` (pull-persist) y `valorCimaExtraSin`
 * (persist-siniestro). Copia LITERAL; los helpers (`personaCompleta`, `pol`, `T`)
 * son los del test original. Datos SINTÉTICOS.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { mapEiacPol, type ParsedEiacPol } from "../eiac-pol-mapper.ts";
import type { FiguraCima } from "../figuras-cima.ts";
import { fusionarTercerosCima } from "../figuras-cima-pii.ts";
import { prepararDatosEspecificosCima } from "./pull-persist.ts";
import { valorCimaExtraSin } from "./persist-siniestro.ts";

let prevKey: string | undefined;
beforeEach(() => {
  prevKey = process.env.PII_ENCRYPTION_KEY;
  process.env.PII_ENCRYPTION_KEY = "a".repeat(64);
});
afterEach(() => {
  if (prevKey === undefined) delete process.env.PII_ENCRYPTION_KEY;
  else process.env.PII_ENCRYPTION_KEY = prevKey;
});

const esCifrado = (v: unknown) => typeof v === "string" && v.startsWith("v1:");

/** Persona física con TODO lo que la norma permite, incluidas las categorías que siguen fuera. */
function personaCompleta(over: Record<string, unknown> = {}) {
  return {
    PersonaFisica: {
      TipoIdentificacion: "NI",
      IdPersona: "00000001R",
      Nombre: "ANA",
      Apellido1: "PRUEBA",
      Apellido2: "FICTICIA",
      Sexo: "SEXO-CENTINELA",
      EstadoCivil: "ECIVIL-CENTINELA",
      Profesion: { Descripcion: "PROFESION-CENTINELA" },
      Idioma: "IDIOMA-CENTINELA",
      FechaNacimiento: "1980-05-01T00:00:00",
      Domicilio: { NombreVia: "CALLE FALSA 1", OtrosDatosVia: "2B", ClaseVia: "CL", CodigoPostal: "41003", Poblacion: "SEVILLA", Provincia: "41", Pais: "ESP" },
      DatosContacto: {
        Telefonos: { Telefono: { Numero: "600000000" } },
        Emails: { Email: { Direccion: "ana@example.com" } },
        Consentimientos: { Consentimiento: { Clase: "CONSENT-CENTINELA" } },
      },
      ...over,
    },
  };
}

function pol(poliza: Record<string, unknown>): ParsedEiacPol {
  return {
    Objetos: {
      Poliza: {
        DatosPoliza: { IdPoliza: "P-1", CodigoEntidad: { CodigoDGS: "C0468" }, DatosRamo: { RamoDGS: "999" } },
        SituacionPoliza: "EV",
        Fechas: { FechaEfectoInicial: "2026-01-01", FechaVencimiento: "2027-01-01" },
        Tomador: personaCompleta(),
        ...poliza,
      },
    },
  } as ParsedEiacPol;
}

test("persist POL: prepararDatosEspecificosCima cifra figuras y la persona de vida (también en riesgos[])", () => {
  const r = mapEiacPol(
    pol({ DatosRiesgos: { Riesgo: { RiesgoVida: { Persona: personaCompleta().PersonaFisica, IdAplicacion: "APL-1" } } } }),
  );
  const out = prepararDatosEspecificosCima(r.datosEspecificos)!;
  const json = JSON.stringify(out);
  assert.ok(!json.includes("00000001R"), "documento en claro");
  assert.ok(!json.includes("ana@example.com"), "email en claro");
  assert.ok(!json.includes("CALLE FALSA"), "calle en claro");
  assert.ok(!json.includes("1980-05-01"), "nacimiento en claro");
  assert.ok(esCifrado(((out.vida as Record<string, unknown>).persona as Record<string, unknown>).nombre));
});

const T = (nombre: string, documento: string | null = null): FiguraCima => ({
  papel: "perjudicado", claseFigura: "PE", tipoPersona: "fisica", nombre, documento,
  tipoDocumento: null, domicilio: null, telefono: null, email: null,
});

test("terceros persist: un SIN sin terceros NO borra los guardados", () => {
  const guardado = { cimaExtra: [], terceros: fusionarTercerosCima(null, [T("PEPE")], false) };
  const v = valorCimaExtraSin(guardado, { entradas: [], truncado: false }, [], false);
  assert.equal((v.terceros as unknown[]).length, 1);
});

test("cima_extra SIN: resto desconocido (null) conserva el cimaExtra guardado", () => {
  const v = valorCimaExtraSin({ cimaExtra: [{ ruta: "a", valor: "1" }] }, null, [T("PEPE")], false);
  assert.deepEqual(v.cimaExtra, [{ ruta: "a", valor: "1" }]);
});

test("cima_extra SIN: sin nada guardado ni resto conocido, no se inventa `cimaExtra`", () => {
  const v = valorCimaExtraSin(null, null, [T("PEPE")], false);
  assert.equal("cimaExtra" in v, false);
});
