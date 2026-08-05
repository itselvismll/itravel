begin;

-- A publicação é o registro principal. Dependências sociais não podem impedir
-- que o autor remova o próprio conteúdo.
do $$
declare
  constraint_record record;
begin
  for constraint_record in
    select constraint_name
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'comments'
      and constraint_type = 'FOREIGN KEY'
      and constraint_name in (
        select constraint_name
        from information_schema.constraint_column_usage
        where table_schema = 'public'
          and table_name = 'country_photos'
          and column_name = 'id'
      )
  loop
    execute format('alter table public.comments drop constraint %I', constraint_record.constraint_name);
  end loop;

  alter table public.comments
    add constraint comments_photo_id_fkey
    foreign key (photo_id)
    references public.country_photos (id)
    on delete cascade;
end;
$$;

do $$
declare
  constraint_record record;
begin
  for constraint_record in
    select constraint_name
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'favorite_photos'
      and constraint_type = 'FOREIGN KEY'
      and constraint_name in (
        select constraint_name
        from information_schema.constraint_column_usage
        where table_schema = 'public'
          and table_name = 'country_photos'
          and column_name = 'id'
      )
  loop
    execute format('alter table public.favorite_photos drop constraint %I', constraint_record.constraint_name);
  end loop;

  alter table public.favorite_photos
    add constraint favorite_photos_photo_id_fkey
    foreign key (photo_id)
    references public.country_photos (id)
    on delete cascade;
end;
$$;

-- A notificação pode permanecer no histórico, mas sem apontar para uma foto
-- que já não existe.
do $$
declare
  constraint_record record;
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'notifications' and column_name = 'photo_id'
  ) then
    for constraint_record in
      select constraint_name
      from information_schema.table_constraints
      where table_schema = 'public'
        and table_name = 'notifications'
        and constraint_type = 'FOREIGN KEY'
        and constraint_name in (
          select constraint_name
          from information_schema.constraint_column_usage
          where table_schema = 'public'
            and table_name = 'country_photos'
            and column_name = 'id'
        )
    loop
      execute format('alter table public.notifications drop constraint %I', constraint_record.constraint_name);
    end loop;

    alter table public.notifications
      add constraint notifications_photo_id_fkey
      foreign key (photo_id)
      references public.country_photos (id)
      on delete set null;
  end if;
end;
$$;

-- Capas escolhidas pelo autor são limpas automaticamente se apontarem para a
-- publicação removida. A URL é mantida coerente pelo trigger abaixo.
create or replace function public.clear_deleted_photo_cover()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.visited_countries
  set cover_photo_id = null,
      cover_photo_url = null
  where user_id = old.user_id
    and cover_photo_id = old.id;
  return old;
end;
$$;

revoke all on function public.clear_deleted_photo_cover() from public;

drop trigger if exists before_country_photo_delete_clear_cover on public.country_photos;
create trigger before_country_photo_delete_clear_cover
  before delete on public.country_photos
  for each row execute function public.clear_deleted_photo_cover();

commit;
