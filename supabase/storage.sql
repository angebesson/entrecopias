-- Correr una vez en Supabase > SQL Editor (despues de schema.sql)
-- Bucket PRIVADO para los archivos que suben los clientes. Nadie lee ni escribe desde el navegador:
-- la subida se hace con una URL firmada que crea el servidor (api/subir-archivo.js).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'archivos',
  'archivos',
  false,
  20971520, -- 20 MB
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png'
  ]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
