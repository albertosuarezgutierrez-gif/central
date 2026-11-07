// Genera prisma/sql/0002_plantilla_encargo_v1.sql desde PLANTILLA_ENCARGO_V1 (core-herramientas). Uso: node scripts/generar-plantilla-sql.mjs
// La plantilla publicada es INMUTABLE: si 0002 ya está aplicada, NO se regenera; una plantilla nueva = 000N + versión nueva.
import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { PLANTILLA_ENCARGO_V1 as P } from '../../../packages/core-herramientas/src/plantilla-encargo-v1.ts'

if (P.texto.includes('$plantilla_v1$')) throw new Error('el texto contiene el delimitador')
const sha = createHash('sha256').update(P.texto, 'utf8').digest('hex')
const sql = `-- Plantilla v1 del contrato de encargo (GENERADA por scripts/generar-plantilla-sql.mjs desde core-herramientas; no editar a mano).
-- ⛔ NO APLICADA. Aplicar como postgres DESPUÉS de 0001. sha256 = ${sha}
-- El CHECK de la tabla recalcula el sha256 del texto: si alguien tocara el texto, el INSERT fallaría.
BEGIN;
INSERT INTO herramientas.plantilla (codigo, version, estado, texto_md, sha256)
VALUES ('${P.codigo}', '${P.version}', '${P.estado}', $plantilla_v1$${P.texto}$plantilla_v1$, '${sha}')
ON CONFLICT (codigo, version) DO NOTHING;
COMMIT;
`
writeFileSync(new URL('../prisma/sql/0002_plantilla_encargo_v1.sql', import.meta.url), sql)
console.log('0002 generada', sha)
