-- ¿De quién es la póliza que sube el cliente? (07/09/2026)
--
-- Alberto: «si él sube esas pólizas a nombre de empresa, se pregunta». Tiene
-- razón, y corrige un análisis previo de esta sesión que mezclaba dos cosas que
-- NO dependen una de la otra:
--
--   · ETIQUETAR lo que sube («esto es de mi empresa») no necesita nada: es un
--     dato suyo sobre una póliza suya, y el momento de preguntarlo es justo ese,
--     con el PDF delante.
--   · ACCEDER a la cartera que la correduría ya tiene de esa empresa sí necesita
--     ficha y autorización.
--
-- Esto es lo primero. Lo segundo sigue igual que estaba.
--
-- 🚨 ES UNA DECLARACIÓN, NO UN VÍNCULO. Lo que el cliente teclea aquí NO crea
-- una ficha de sociedad ni se casa solo con una que exista: dar de alta un
-- cliente en la cartera porque alguien escribe un nombre en un formulario es
-- exactamente lo que el portal no puede hacer. La reconciliación con la ficha
-- real la decide el corredor.
--
-- ⚠️ `titular_tipo` es NULLABLE y eso es el dato, no un descuido: `null`
-- significa «no se preguntó», que es el estado de TODAS las filas anteriores a
-- hoy. Leerlo como «propio» convertiría un hueco en una afirmación sobre de
-- quién es una póliza — justo el error que la regla de la casa prohíbe, y aquí
-- con consecuencias: decidiría contra qué ficha se comprueba si ya la llevamos.
--
-- 🚨 GRANT por columna ANTES de declararlas en Prisma: declarar sin conceder
-- rompe TODAS las lecturas del modelo con 42501.

alter table seguros.portal_poliza_declarada
  add column if not exists titular_tipo           text,
  add column if not exists titular_empresa_nombre text,
  add column if not exists titular_empresa_cif    text;

-- Vocabulario cerrado. `null` sigue permitido a propósito (ver arriba).
alter table seguros.portal_poliza_declarada
  drop constraint if exists portal_poliza_declarada_titular_tipo;
alter table seguros.portal_poliza_declarada
  add constraint portal_poliza_declarada_titular_tipo
  check (titular_tipo is null or titular_tipo in ('propio', 'empresa'));

-- Si dice que es de una empresa, hay que saber de CUÁL. «De mi empresa» sin
-- nombre no es una declaración: es un hueco con forma de dato, y aguas abajo se
-- leería como una empresa identificada. El CIF sí puede faltar (mucha gente no
-- se lo sabe de memoria) y por eso no entra en el CHECK.
alter table seguros.portal_poliza_declarada
  drop constraint if exists portal_poliza_declarada_empresa_con_nombre;
alter table seguros.portal_poliza_declarada
  add constraint portal_poliza_declarada_empresa_con_nombre
  check (titular_tipo is distinct from 'empresa' or nullif(btrim(titular_empresa_nombre), '') is not null);

grant select (titular_tipo, titular_empresa_nombre, titular_empresa_cif),
      insert (titular_tipo, titular_empresa_nombre, titular_empresa_cif),
      update (titular_tipo, titular_empresa_nombre, titular_empresa_cif)
  on seguros.portal_poliza_declarada to prisma_asegura_portal;

-- El corredor lo LEE para poder reconciliarlo con la ficha real.
grant select (titular_tipo, titular_empresa_nombre, titular_empresa_cif)
  on seguros.portal_poliza_declarada to prisma_seguros;
