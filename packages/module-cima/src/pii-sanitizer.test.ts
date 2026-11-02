import assert from "node:assert/strict";
import test from "node:test";

import { sanitizePiiES } from "./pii-sanitizer.ts";

test("sanitizePiiES: null/empty → empty string", () => {
  assert.equal(sanitizePiiES(null), "");
  assert.equal(sanitizePiiES(undefined), "");
  assert.equal(sanitizePiiES(""), "");
});

test("sanitizePiiES: DNI español redacted", () => {
  assert.equal(
    sanitizePiiES("Key (dni_lookup_hash)=(28792627P) conflict"),
    "Key (dni_lookup_hash)=([dni]) conflict",
  );
  assert.equal(sanitizePiiES("DNI 12345678Z encontrado"), "DNI [dni] encontrado");
});

test("sanitizePiiES: NIE redacted", () => {
  assert.equal(sanitizePiiES("NIE X1234567L"), "NIE [nie]");
  assert.equal(sanitizePiiES("nie y9876543t"), "nie [nie]");
});

test("sanitizePiiES: CIF redacted", () => {
  assert.equal(sanitizePiiES("CIF A12345678"), "CIF [cif]");
  assert.equal(sanitizePiiES("entidad B98765432"), "entidad [cif]");
});

test("sanitizePiiES: email redacted", () => {
  assert.equal(
    sanitizePiiES("conflict on email=juan.perez@example.com line 2"),
    "conflict on email=[email] line 2",
  );
});

test("sanitizePiiES: teléfono ES redacted", () => {
  assert.equal(sanitizePiiES("tel 612345678 invalido"), "tel [tel] invalido");
  assert.equal(sanitizePiiES("+34 612 345 678 ok"), "[tel] ok");
  assert.equal(sanitizePiiES("0034612345678"), "[tel]");
  assert.equal(sanitizePiiES("contact 712-345-678"), "contact [tel]");
});

test("sanitizePiiES: IBAN ES redacted", () => {
  assert.equal(
    sanitizePiiES("iban ES6700491500051234567892 no encontrado"),
    "iban [iban] no encontrado",
  );
  assert.equal(
    sanitizePiiES("ES67 0049 1500 0512 3456 7892"),
    "[iban]",
  );
});

test("sanitizePiiES: combinación múltiple en un mensaje", () => {
  const input = "Persist failed: nombre=Juan, DNI=12345678Z, email=juan@x.com, tel=612345678";
  const out = sanitizePiiES(input);
  assert.match(out, /\[dni\]/);
  assert.match(out, /\[email\]/);
  assert.match(out, /\[tel\]/);
  // PII original NO debe aparecer en el output.
  assert.doesNotMatch(out, /12345678Z/);
  assert.doesNotMatch(out, /juan@x\.com/);
  assert.doesNotMatch(out, /612345678/);
});

test("sanitizePiiES: truncate AL FINAL después de redact", () => {
  const input = "x".repeat(300) + " 12345678Z";
  const out = sanitizePiiES(input, { maxLength: 200 });
  assert.equal(out.length, 200);
  // El DNI estaba al final → la truncación pre-redact lo habría perdido, pero
  // sanitizamos PRIMERO y truncamos DESPUÉS → no se filtra DNI.
  assert.doesNotMatch(out, /12345678Z/);
});

test("sanitizePiiES: respeta maxLength custom", () => {
  assert.equal(sanitizePiiES("a".repeat(50), { maxLength: 10 }).length, 10);
});

test("sanitizePiiES: strings sanos sin PII intactos", () => {
  assert.equal(sanitizePiiES("zip_multi_entry:3"), "zip_multi_entry:3");
  assert.equal(sanitizePiiES("codigo_entidad_ausente"), "codigo_entidad_ausente");
  assert.equal(sanitizePiiES("review: art14,fechas_invalidas"), "review: art14,fechas_invalidas");
});

test("sanitizePiiES: 8 dígitos solos NO matchean (sin letra al final no es DNI)", () => {
  assert.equal(sanitizePiiES("12345678 sin letra"), "12345678 sin letra");
});
