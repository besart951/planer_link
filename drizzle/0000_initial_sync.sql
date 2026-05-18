create table if not exists employees (
  id uuid primary key,
  data jsonb not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  version_hlc text not null,
  device_id text not null,
  user_id uuid,
  field_versions_json jsonb not null
);

create index if not exists employees_updated_at_idx on employees (updated_at);
create index if not exists employees_user_id_idx on employees (user_id);

create table if not exists appointments (
  id uuid primary key,
  employee_id uuid,
  data jsonb not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  version_hlc text not null,
  device_id text not null,
  user_id uuid,
  field_versions_json jsonb not null
);

create index if not exists appointments_employee_id_idx on appointments (employee_id);
create index if not exists appointments_updated_at_idx on appointments (updated_at);
create index if not exists appointments_user_id_idx on appointments (user_id);

create table if not exists planner_settings (
  id uuid primary key,
  data jsonb not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  version_hlc text not null,
  device_id text not null,
  user_id uuid,
  field_versions_json jsonb not null
);

create table if not exists sync_records (
  entity text not null,
  id text not null,
  data jsonb not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  version_hlc text not null,
  device_id text not null,
  user_id text,
  field_versions_json jsonb not null,
  constraint sync_records_entity_id_idx unique (entity, id)
);

create index if not exists sync_records_updated_at_idx on sync_records (updated_at);
create index if not exists sync_records_user_id_idx on sync_records (user_id);

create table if not exists sync_events (
  seq bigint generated always as identity primary key,
  entity text not null,
  record_id text not null,
  device_id text not null,
  op_id text not null,
  record jsonb not null,
  created_at timestamptz not null
);

create index if not exists sync_events_record_idx on sync_events (entity, record_id);
create index if not exists sync_events_op_idx on sync_events (device_id, op_id);

create table if not exists sync_operations (
  device_id text not null,
  op_id text not null,
  status text not null,
  reason text,
  created_at timestamptz not null,
  constraint sync_operations_device_op_idx unique (device_id, op_id)
);

create table if not exists sync_conflicts (
  id text primary key,
  entity text not null,
  record_id text not null,
  field_name text not null,
  local_value jsonb,
  server_value jsonb,
  chosen_value jsonb,
  strategy text not null,
  op_id text not null,
  status text not null,
  created_at timestamptz not null,
  resolved_at timestamptz
);

create index if not exists sync_conflicts_status_idx on sync_conflicts (status);
create index if not exists sync_conflicts_record_idx on sync_conflicts (entity, record_id);
