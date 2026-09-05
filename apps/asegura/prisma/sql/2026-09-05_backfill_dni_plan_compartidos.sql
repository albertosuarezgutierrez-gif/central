-- El DNI CENTINELA: una columna más en la foto del plan del backfill (05/09/2026).
--
-- ─── El hallazgo ────────────────────────────────────────────────────────────────────────
-- Al preparar el paso 3 del backfill (escribir `clientes.dni_lookup_hash`) quedaban 18 de
-- los 620 grupos de mismo DNI sin resolver, y uno no se parecía a los demás:
--
--   · **20 fichas comparten un mismo DNI**, con **20 nombres sin relación entre sí**
--     («alberto suárez gutiérrez», «alejandro saez caro», «chema 14134», «eva 12895»,
--     «francisca maría loreto dianez»…) y **19 correos distintos**. Una de ellas está en
--     CARTERA VIVA. Todas menos esa vienen del volcado `intranet:` y tienen 1 póliza.
--
-- Eso no es una persona duplicada: es el mismo documento tecleado en la ficha de veinte
-- personas. `looksLikeDniNieCif` no lo filtra porque el valor SÍ parece un documento — es
-- el «valor de cajón» de la regla del repo, pero con letra correcta.
--
-- ─── Por qué importa para el backfill ───────────────────────────────────────────────────
-- `uq_clientes_dni_lookup_hash` solo cubre `tipo='cliente'`, y **14.990 de las 15.092 fichas
-- con DNI y sin hash son `lead`**. En un lead el hash centinela se habría escrito sin que
-- nada fallara, y a partir de ahí:
--   · buscar por ese DNI devolvería veinte personas distintas, y
--   · [Probable] la ingesta de CIMA, que engancha la póliza a la ficha POR ese hash, podría
--     colgarle una póliza viva a quien no es.
-- El guardián está en la pieza pura (`packages/module-seguros/src/backfill-dni.ts`, destino
-- `compartido`): ≥3 nombres distintos bajo el mismo DNI y ningún token de nombre común a
-- todas. Con DOS nombres NO se activa a propósito — ahí «Adela Gutiérrez Alcalá» / «Adela
-- Alcalá» (la misma persona) y un DNI mal tecleado son indistinguibles, y esos siguen
-- siendo `choca`, que es lo que los pone delante de una persona.
--
-- ─── Qué añade esta migración ───────────────────────────────────────────────────────────
-- La foto guardaba `choques` (la lista de fusiones) pero no los centinelas, y desde SQL no
-- se pueden calcular: hacen falta las claves PII. Sin esta columna, el día que se prepare
-- el lote que CORRIJA esos DNI habría que volver a descubrirlos.
--
-- `default '[]'::jsonb` y no `not null` a secas: una versión desplegada más vieja de
-- `apps/asegura` sigue escribiendo la foto sin esta columna, y el insert no debe romperse.
-- ⚠️ Ojo con leerlo: `[]` aquí significa «esta foto no los calculó» tanto como «no hay»,
-- hasta que la versión desplegada sea la del 05/09/2026 o posterior. Mírese `calculado_en`.

alter table seguros.backfill_dni_plan
  add column if not exists compartidos jsonb not null default '[]'::jsonb;

comment on column seguros.backfill_dni_plan.compartidos is
  'DNI centinela: grupos de fichas (solo uuids) que comparten un documento escrito en fichas de personas distintas. NO son candidatos a fusión — son un dato a corregir. Se calculan con la clave PII, así que solo los puede escribir apps/asegura.';
