import test from "node:test";
import assert from "node:assert/strict";

import {
  COBERTURA_MAX_PROFUNDIDAD,
  COBERTURA_MAX_RUTAS,
  aplanarRutas,
  medirCoberturaCampos,
} from "./field-coverage.ts";

// ── aplanarRutas ────────────────────────────────────────────────────────────

test("aplanarRutas: hojas y contenedores, con la ruta completa por puntos", () => {
  const { rutas } = aplanarRutas({
    DatosPoliza: { IdPoliza: "P1", DatosRamo: { RamoDGS: "2161" } },
  });
  assert.equal(rutas.get("DatosPoliza"), false); // contenedor
  assert.equal(rutas.get("DatosPoliza.IdPoliza"), true); // hoja
  assert.equal(rutas.get("DatosPoliza.DatosRamo"), false);
  assert.equal(rutas.get("DatosPoliza.DatosRamo.RamoDGS"), true);
});

test("aplanarRutas: los índices de array se ELIDEN (dos Riesgo = una ruta)", () => {
  const { rutas } = aplanarRutas({
    Riesgo: [{ RiesgoAutos: { Matricula: "x" } }, { RiesgoHogar: { CodigoPostal: "y" } }],
  });
  const claves = [...rutas.keys()].sort();
  assert.deepEqual(claves, [
    "Riesgo",
    "Riesgo.RiesgoAutos",
    "Riesgo.RiesgoAutos.Matricula",
    "Riesgo.RiesgoHogar",
    "Riesgo.RiesgoHogar.CodigoPostal",
  ]);
  // Ni un `[0]` ni un `[1]` en ninguna ruta: si esto se rompe, la agregación por
  // ruta deja de agregar (una fila por elemento de array) y la tabla explota.
  assert.ok(!claves.some((k) => /\d/.test(k)));
});

test("aplanarRutas: un segmento que NO parece nombre XML se DESCARTA (posible PII)", () => {
  // Un mapa cuyas claves son valores (aquí un DNI y una matrícula con espacio):
  // sus rutas serían PII. Se cuentan, no se emiten.
  const { rutas, descartadas } = aplanarRutas({
    PorDni: { "12345678Z": { Prima: "100" }, "1234 ABC": { Prima: "200" } },
  });
  assert.equal(descartadas, 2);
  assert.deepEqual([...rutas.keys()], ["PorDni"]);
});

test("aplanarRutas: contenedor gana sobre hoja cuando la misma ruta es de las dos formas", () => {
  const { rutas } = aplanarRutas({
    Riesgo: [{ Situacion: "texto suelto" }, { Situacion: { CodigoPostal: "41003" } }],
  });
  assert.equal(rutas.get("Riesgo.Situacion"), false);
  assert.equal(rutas.get("Riesgo.Situacion.CodigoPostal"), true);
});

test("aplanarRutas: tope de rutas → truncado=true (no se afirma «esto es todo»)", () => {
  const grande: Record<string, unknown> = {};
  for (let i = 0; i < COBERTURA_MAX_RUTAS + 50; i++) grande[`Campo${i}`] = "v";
  const { truncado, rutas } = aplanarRutas(grande);
  assert.equal(truncado, true);
  assert.equal(rutas.size, COBERTURA_MAX_RUTAS);
});

test("aplanarRutas: ciclo no cuelga", () => {
  const a: Record<string, unknown> = { Campo: "v" };
  a.Self = a;
  const { rutas } = aplanarRutas(a);
  assert.ok(rutas.has("Campo"));
});

// ── medirCoberturaCampos ────────────────────────────────────────────────────

const ARBOL = {
  DatosPoliza: { IdPoliza: "P1", NumeroColectivo: "7" },
  DatosRiesgos: {
    Riesgo: [{ RiesgoComunidades: { NumeroViviendas: "12", Ascensores: "1" } }],
  },
};

/** Mapper de juguete: lee IdPoliza y NumeroViviendas, ignora el resto. */
function mapperParcial(datos: unknown): unknown {
  const d = datos as {
    DatosPoliza?: { IdPoliza?: string };
    DatosRiesgos?: { Riesgo?: Array<{ RiesgoComunidades?: { NumeroViviendas?: string } }> };
  };
  const riesgos = d.DatosRiesgos?.Riesgo;
  const uno = Array.isArray(riesgos) ? riesgos[0] : riesgos;
  return { id: d.DatosPoliza?.IdPoliza, viv: uno?.RiesgoComunidades?.NumeroViviendas };
}

test("medirCoberturaCampos: marca LEÍDO lo que el mapper toca de verdad", () => {
  const c = medirCoberturaCampos(ARBOL, mapperParcial);
  const por = new Map(c.rutas.map((r) => [r.ruta, r]));
  assert.equal(por.get("DatosPoliza.IdPoliza")?.leido, true);
  assert.equal(por.get("DatosRiesgos.Riesgo.RiesgoComunidades.NumeroViviendas")?.leido, true);
});

test("medirCoberturaCampos: marca NO LEÍDO el campo que el mapper nunca mira", () => {
  const c = medirCoberturaCampos(ARBOL, mapperParcial);
  const por = new Map(c.rutas.map((r) => [r.ruta, r]));
  // Éste es EL caso del encargo: CIMA lo manda, el mapper no lo lee, y hasta
  // ahora se perdía sin dejar rastro (ni review, ni error, ni nada).
  assert.equal(por.get("DatosPoliza.NumeroColectivo")?.leido, false);
  assert.equal(por.get("DatosRiesgos.Riesgo.RiesgoComunidades.Ascensores")?.leido, false);
});

test("medirCoberturaCampos: el ratio cuenta HOJAS, no contenedores", () => {
  const c = medirCoberturaCampos(ARBOL, mapperParcial);
  assert.equal(c.hojas, 4); // IdPoliza, NumeroColectivo, NumeroViviendas, Ascensores
  assert.equal(c.hojasLeidas, 2);
});

test("medirCoberturaCampos: NUNCA emite valores, sólo nombres de ruta", () => {
  const conPii = {
    Tomador: { PersonaFisica: { Nombre: "ALBERTO", Nif: "12345678Z" } },
  };
  const c = medirCoberturaCampos(conPii, () => null);
  const texto = JSON.stringify(c);
  assert.ok(!texto.includes("ALBERTO"), texto);
  assert.ok(!texto.includes("12345678Z"), texto);
  assert.ok(texto.includes("Tomador.PersonaFisica.Nif"));
});

test("medirCoberturaCampos: enumerar claves (Object.keys) NO cuenta como leer", () => {
  // `unrecognizedRiesgoBlocks` hace justo esto: mira los NOMBRES de los bloques
  // para diagnosticar, sin tocar su contenido. Contarlo como lectura diría que
  // leemos un ramo entero que en realidad estamos tirando.
  const c = medirCoberturaCampos(ARBOL, (d) => Object.keys(d as object));
  assert.equal(c.hojasLeidas, 0);
});

test("medirCoberturaCampos: leer el objeto entero (Object.entries) SÍ cuenta", () => {
  // `mapCobertura` vuelca a `datosExtra` toda clave sin columna: eso sí es leer.
  const c = medirCoberturaCampos(
    { Cobertura: { Limite: "1", Prima: "2" } },
    (d) => Object.entries((d as { Cobertura: object }).Cobertura),
  );
  assert.equal(c.hojasLeidas, 2);
});

test("medirCoberturaCampos: un mapper que lanza deja mapperFallo=true y NO pinta cobertura completa", () => {
  const c = medirCoberturaCampos(ARBOL, (d) => {
    void (d as { DatosPoliza: { IdPoliza: string } }).DatosPoliza.IdPoliza;
    throw new Error("boom");
  });
  assert.equal(c.mapperFallo, true);
  // Conservador: lo no observado queda como NO leído (empuja a mirar), nunca al revés.
  assert.ok(c.hojasLeidas < c.hojas);
});

test("medirCoberturaCampos: el árbol original NO se muta ni se queda con Proxies vivos", () => {
  const arbol = { A: { B: "v" } };
  let fugado: unknown = null;
  const c = medirCoberturaCampos(arbol, (d) => {
    fugado = (d as { A: unknown }).A;
    return null;
  });
  assert.equal(c.total > 0, true);
  assert.deepEqual(arbol, { A: { B: "v" } });
  // La referencia que el mapper se llevó está REVOCADA: tocarla lanza.
  assert.throws(() => JSON.stringify(fugado));
});

test("aplanarRutas: pasada la profundidad máxima, truncado=true (y no se cuelga)", () => {
  // Cepo del OTRO tope. Sin él, un árbol muy anidado se corta en silencio y el
  // resumen diría «CIMA manda N campos» cuando manda más y no los hemos mirado.
  let hoja: Record<string, unknown> = { Fin: "v" };
  for (let i = 0; i < COBERTURA_MAX_PROFUNDIDAD + 3; i++) hoja = { [`N${i}`]: hoja };
  const { truncado } = aplanarRutas(hoja);
  assert.equal(truncado, true);
});

// ── 03/10/2026: ruta canónica (sin ProcesosEIAC.) en lo que se ESCRIBE ──────

import { consolidarRutasCobertura } from "./field-coverage.ts";

test("consolidarRutasCobertura: quita el prefijo, fusiona duplicadas (leído = OR, contenedor gana) y descarta el envoltorio", () => {
  const out = consolidarRutasCobertura([
    { ruta: "ProcesosEIAC", hoja: false, leido: false },
    { ruta: "ProcesosEIAC.Objetos.Poliza.PrimaTotal", hoja: true, leido: false },
    { ruta: "Objetos.Poliza.PrimaTotal", hoja: true, leido: true },
    { ruta: "ProcesosEIAC.Objetos.Poliza", hoja: false, leido: false },
    { ruta: "Objetos.Poliza", hoja: true, leido: false },
  ]);
  assert.deepEqual(out, [
    { ruta: "Objetos.Poliza", hoja: false, leido: false },
    { ruta: "Objetos.Poliza.PrimaTotal", hoja: true, leido: true },
  ]);
  assert.ok(out.every((r) => !r.ruta.startsWith("ProcesosEIAC")));
});

test("consolidarRutasCobertura: conserva el motivo de exclusión (pull-deps re-consolida antes de escribir)", () => {
  const out = consolidarRutasCobertura([
    { ruta: "ProcesosEIAC.Objetos.Recibo.X.IBAN", hoja: true, leido: false },
    { ruta: "Objetos.Recibo.X.IBAN", hoja: true, leido: false, excluido: "bancario" },
    { ruta: "Objetos.Recibo.X.Leida", hoja: true, leido: true, excluido: "persona" },
    { ruta: "Objetos.Recibo.X.Normal", hoja: true, leido: false },
  ]);
  assert.deepEqual(out, [
    { ruta: "Objetos.Recibo.X.IBAN", hoja: true, leido: false, excluido: "bancario" },
    // Leída: no es «excluida» (el motivo solo describe una hoja NO leída).
    { ruta: "Objetos.Recibo.X.Leida", hoja: true, leido: true },
    { ruta: "Objetos.Recibo.X.Normal", hoja: true, leido: false },
  ]);
});

test("medirCoberturaCampos: con envoltorio ProcesosEIAC las rutas salen canónicas y sin duplicados", () => {
  const c = medirCoberturaCampos({ ProcesosEIAC: { Objetos: { Poliza: { PrimaTotal: "1" } } } }, (d) => {
    const t = d as { ProcesosEIAC: { Objetos: { Poliza: { PrimaTotal: string } } } };
    return t.ProcesosEIAC.Objetos.Poliza.PrimaTotal;
  });
  const rutas = c.rutas.map((r) => r.ruta);
  assert.deepEqual(rutas, ["Objetos", "Objetos.Poliza", "Objetos.Poliza.PrimaTotal"]);
  assert.equal(c.rutas.find((r) => r.ruta === "Objetos.Poliza.PrimaTotal")?.leido, true);
  assert.equal(new Set(rutas).size, rutas.length);
});
