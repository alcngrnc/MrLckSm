-- Safe extension for dispatch architecture (no route removals/renames)
-- 1) Jobs table extensions for driver acceptance flow
alter table public.jobs
  add column if not exists accepted_driver_id uuid references public.profiles(id),
  add column if not exists accepted_at timestamptz,
  add column if not exists driver_eta_minutes integer,
  add column if not exists driver_status text;

create index if not exists jobs_status_idx on public.jobs(status);
create index if not exists jobs_tracking_code_idx on public.jobs(tracking_code);
create index if not exists jobs_accepted_driver_id_idx on public.jobs(accepted_driver_id);

-- 2) Enable RLS (idempotent)
alter table public.jobs enable row level security;
alter table public.profiles enable row level security;

-- 3) Policies for jobs visibility and technician updates
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'jobs'
      and policyname = 'jobs_select_admin_dispatcher_all'
  ) then
    create policy jobs_select_admin_dispatcher_all
      on public.jobs
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.role in ('admin', 'dispatcher')
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'jobs'
      and policyname = 'jobs_select_technician_available_or_assigned'
  ) then
    create policy jobs_select_technician_available_or_assigned
      on public.jobs
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.role = 'technician'
        )
        and (
          status = 'new'
          or accepted_driver_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'jobs'
      and policyname = 'jobs_update_admin_dispatcher_all'
  ) then
    create policy jobs_update_admin_dispatcher_all
      on public.jobs
      for update
      to authenticated
      using (
        exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.role in ('admin', 'dispatcher')
        )
      )
      with check (
        exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.role in ('admin', 'dispatcher')
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'jobs'
      and policyname = 'jobs_update_technician_assigned_only'
  ) then
    create policy jobs_update_technician_assigned_only
      on public.jobs
      for update
      to authenticated
      using (
        accepted_driver_id = auth.uid()
        and exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.role = 'technician'
        )
      )
      with check (
        accepted_driver_id = auth.uid()
        and exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.role = 'technician'
        )
      );
  end if;
end $$;

-- 4) Profiles policies for admin/dispatcher management and technician self access
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'profiles_select_self'
  ) then
    create policy profiles_select_self
      on public.profiles
      for select
      to authenticated
      using (id = auth.uid());
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'profiles_select_admin_dispatcher_all'
  ) then
    create policy profiles_select_admin_dispatcher_all
      on public.profiles
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.role in ('admin', 'dispatcher')
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'profiles_update_admin_dispatcher_all'
  ) then
    create policy profiles_update_admin_dispatcher_all
      on public.profiles
      for update
      to authenticated
      using (
        exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.role in ('admin', 'dispatcher')
        )
      )
      with check (
        exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.role in ('admin', 'dispatcher')
        )
      );
  end if;
end $$;
