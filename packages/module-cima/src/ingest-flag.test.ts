import assert from "node:assert/strict";
import test from "node:test";

import { decideCimaPullMode, isCimaIngestaEnabled } from "./ingest-flag.ts";

function withFlag(value: string | undefined, fn: () => void): void {
  const prev = process.env.CIMA_INGESTA_ENABLED;
  if (value === undefined) delete process.env.CIMA_INGESTA_ENABLED;
  else process.env.CIMA_INGESTA_ENABLED = value;
  try {
    fn();
  } finally {
    if (prev === undefined) delete process.env.CIMA_INGESTA_ENABLED;
    else process.env.CIMA_INGESTA_ENABLED = prev;
  }
}

test("isCimaIngestaEnabled: default OFF cuando la var no está definida", () => {
  withFlag(undefined, () => assert.equal(isCimaIngestaEnabled(), false));
});

test("isCimaIngestaEnabled: 'true' y '1' activan", () => {
  withFlag("true", () => assert.equal(isCimaIngestaEnabled(), true));
  withFlag("1", () => assert.equal(isCimaIngestaEnabled(), true));
});

test("isCimaIngestaEnabled: case-insensitive + trim", () => {
  withFlag("  TRUE ", () => assert.equal(isCimaIngestaEnabled(), true));
});

test("isCimaIngestaEnabled: valores no-truthy quedan OFF", () => {
  for (const v of ["false", "0", "", "yes", "on", "off"]) {
    withFlag(v, () => assert.equal(isCimaIngestaEnabled(), false, `v=${v}`));
  }
});

test("decideCimaPullMode: flag ON sin dryRun → real (cron scheduled)", () => {
  assert.equal(decideCimaPullMode({ enabled: true, dryRunRequested: false }), "real");
});

// LOO-819 — dryRunRequested gana SIEMPRE: con el flag ON en prod (LOO-556), un
// dispatch con dry_run=true antes ESCRIBÍA (footgun del incidente LOO-760).
test("decideCimaPullMode: flag ON + dryRun → dry_run (LOO-819, dryRun gana al flag)", () => {
  assert.equal(decideCimaPullMode({ enabled: true, dryRunRequested: true }), "dry_run");
});

test("decideCimaPullMode: flag OFF + dryRun → dry_run", () => {
  assert.equal(decideCimaPullMode({ enabled: false, dryRunRequested: true }), "dry_run");
});

test("decideCimaPullMode: flag OFF sin dryRun → disabled", () => {
  assert.equal(decideCimaPullMode({ enabled: false, dryRunRequested: false }), "disabled");
});
