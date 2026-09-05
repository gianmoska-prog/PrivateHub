alter table public.documents
drop constraint if exists documents_country_check;

alter table public.documents
add constraint documents_country_check
check (country in ('Italy', 'Brazil', 'General'));

insert into public.documents (owner_id, document_type, country, status)
select
  owner_registry.owner_id,
  document_type,
  'General',
  'not_uploaded'
from private_hub.owner_registry
cross join (values ('Payslips'), ('Miscellaneous')) as document_types(document_type)
where owner_registry.owner_id is not null
on conflict (owner_id, country, document_type) do nothing;
