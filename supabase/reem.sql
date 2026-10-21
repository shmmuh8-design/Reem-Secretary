-- ريم الذكية: ذاكرة ورسائل (الوصول فقط من الدالة السحابية عبر service role)
create table if not exists public.reem_facts (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.reem_messages (
  id         bigserial primary key,
  role       text not null check (role in ('user','model')),
  content    text not null,
  created_at timestamptz not null default now()
);
alter table public.reem_facts    enable row level security;
alter table public.reem_messages enable row level security;
revoke all on public.reem_facts, public.reem_messages from anon, authenticated;
