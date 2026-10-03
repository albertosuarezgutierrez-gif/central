-- El bonus del conductor imputado a un vehículo NUEVO (03/10/2026, Alberto).
--
-- auto-nuevo / moto-nuevo ya no cotizan «de calle»: declaran como seguro anterior la mejor póliza
-- de motor que conocemos del cliente (`elegirSeguroAnteriorParaImputar`, module-seguros). Si sus
-- años sin siniestros NO constan, se declara el MÁXIMO (la compañía lo contrasta con SINCO) y el
-- presupuesto queda CONDICIONADO a verificación. Al emitir, un bonus supuesto sin verificación se
-- corta con 422 (`decidirBloqueoBonus`).
--
-- Tres estados, nunca dos:
--   bonus_supuesto NULL  = no consta (tarificación anterior a esta columna, o no se pudo anotar) →
--                          al emitir se trata como «no se sabe» y se pide verificación.
--   bonus_supuesto false = el bonus declarado era un dato (o no se declaró seguro anterior).
--   bonus_supuesto true  = se declaró el máximo porque no constaba.
-- bonus_imputado: qué póliza se imputó y por qué (id opaco `poliza:`/`oportunidad:`). El `porque` describe esa
--                   póliza para pantalla: compañía, últimas 4 cifras del nº y la MATRÍCULA y modelo del vehículo
--                   asegurado (dato del riesgo, vinculable al cliente): no es «sin datos personales».
-- bonus_verificacion: { fuente: certificado|sinco|dato_confirmado, nota, por, en } que dio el corredor al emitir.
--
-- ⚠️ SIN APLICAR (03/10/2026). Mientras no se aplique, la escritura de la marca falla sin tumbar la
-- cotización y la emisión de auto/moto nuevo con seguro anterior pedirá verificación siempre (NULL).

alter table seguros.tarificaciones
  add column if not exists bonus_supuesto boolean,
  add column if not exists bonus_imputado jsonb,
  add column if not exists bonus_verificacion jsonb;

comment on column seguros.tarificaciones.bonus_supuesto is
  'true = años sin siniestros declarados al MÁXIMO por no constar (precio condicionado a SINCO/certificado); '
  'false = dato o sin seguro anterior; NULL = no consta (anterior al 03/10/2026). No se emite con true/NULL sin verificación.';
comment on column seguros.tarificaciones.bonus_imputado is
  'Qué póliza del cliente se declaró como seguro anterior y por qué (id opaco + texto con compañía, últimas cifras del nº y matrícula/modelo del vehículo de esa póliza).';
comment on column seguros.tarificaciones.bonus_verificacion is
  'Verificación del bonus dada al emitir: fuente (certificado|sinco|dato_confirmado), nota, por, en.';
