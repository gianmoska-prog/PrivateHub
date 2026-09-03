alter table public.accounts
  add column balance_mode text not null default 'none'
    check (balance_mode in ('none', 'manual')),
  add column manual_balance numeric,
  add column manual_currency text not null default 'EUR'
    check (manual_currency ~ '^[A-Z]{3}$');

insert into public.accounts (
  owner_id,
  institution,
  product_name,
  country,
  status,
  balance_mode,
  manual_currency,
  notes
)
select distinct
  source.owner_id,
  'Intesa Sanpaolo',
  'Salvadanaio',
  'Italy',
  'active',
  'manual',
  'EUR',
  'Saldo aggiornato manualmente'
from public.accounts source
where source.owner_id is not null
  and source.institution = 'Intesa Sanpaolo'
  and not exists (
    select 1
    from public.accounts existing
    where existing.owner_id = source.owner_id
      and existing.institution = 'Intesa Sanpaolo'
      and existing.product_name = 'Salvadanaio'
  );
