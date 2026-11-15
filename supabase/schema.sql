-- Correr una vez en Supabase > SQL Editor
create table if not exists pedidos (
  id uuid primary key default gen_random_uuid(),
  cliente jsonb not null,            -- nombre, apellido, celular, email
  items jsonb not null,              -- [{ label, subtotal, config }]
  total integer not null check (total > 0),   -- en pesos, calculado por el servidor
  estado text not null default 'pendiente_pago'
    check (estado in ('pendiente_pago', 'pagado', 'rechazado', 'cancelado')),
  mp_payment_id text,
  mp_status text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

-- Solo el servidor (service key) accede. Sin politicas = nadie mas lee ni escribe desde el navegador.
alter table pedidos enable row level security;
