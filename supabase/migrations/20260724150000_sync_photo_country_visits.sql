begin;

-- A photo is evidence of a visit. Keep this invariant in the database so it
-- applies to uploads from web, native, older clients, and future integrations.
create or replace function public.sync_photo_country_visit()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if new.user_id is null or nullif(upper(trim(new.country_code)), '') is null then
    return new;
  end if;

  insert into public.visited_countries (
    user_id,
    country_code,
    country_name
  )
  values (
    new.user_id,
    upper(trim(new.country_code)),
    coalesce(nullif(trim(new.country_name), ''), upper(trim(new.country_code)))
  )
  on conflict (user_id, country_code)
  do update set
    country_name = case
      when nullif(trim(new.country_name), '') is null
        then public.visited_countries.country_name
      else excluded.country_name
    end;

  return new;
end;
$$;

drop trigger if exists on_country_photo_sync_visit on public.country_photos;
create trigger on_country_photo_sync_visit
  after insert or update of user_id, country_code, country_name
  on public.country_photos
  for each row execute procedure public.sync_photo_country_visit();

-- Repair photos that were saved before this invariant existed.
insert into public.visited_countries (
  user_id,
  country_code,
  country_name
)
select distinct on (photo.user_id, upper(trim(photo.country_code)))
  photo.user_id,
  upper(trim(photo.country_code)),
  coalesce(nullif(trim(photo.country_name), ''), upper(trim(photo.country_code)))
from public.country_photos as photo
where photo.user_id is not null
  and nullif(trim(photo.country_code), '') is not null
order by
  photo.user_id,
  upper(trim(photo.country_code)),
  photo.created_at desc
on conflict (user_id, country_code)
do update set
  country_name = case
    when excluded.country_name = excluded.country_code
      then public.visited_countries.country_name
    else excluded.country_name
  end;

commit;
