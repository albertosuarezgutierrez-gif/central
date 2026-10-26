-- 2026-10-26 · ids IBKR verificados. Idempotente: solo rellena donde contract_id IS NULL.
update trading_watchlist t set contract_id = v.cid from (values
 ('SPY',756733),('QQQ',320227571),('IWM',9579970),('NVO',10611),('NVDA',4815747),('META',107113386),
 ('MSFT',272093),('NFLX',15124833),('SPOT',312496724),('RBLX',476026060),('PLTR',444857009),('LLY',9160),
 ('CVX',5684),('STX',491932113),('SNDK',760250490),('WDC',13681),('ORCL',272800),('BKNG',308728373),
 ('APP',481863646),('SQM',12374),('CHT',81671853),('ABNB',459530964),('SPCX',890493863),('VST',254457731)
) as v(simbolo, cid) where t.simbolo = v.simbolo and t.contract_id is null;
