alter table public.spending_category_rules drop constraint spending_category_rules_category_check;
alter table public.spending_category_rules add constraint spending_category_rules_category_check check (category in ('groceries','dining','transport','shopping','bills','health','sport','services','fees','cash','transfers','other'));
