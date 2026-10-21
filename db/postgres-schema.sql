-- River v0.2 production PostgreSQL target schema.
-- Local development currently uses the server-side SQLite adapter. This schema
-- keeps the same ownership and locking rules ready for managed PostgreSQL.

create table if not exists users (
  id uuid primary key,
  username text not null unique,
  password_hash text not null,
  role text not null check (role in ('admin', 'user')),
  created_at timestamptz not null default now()
);

create table if not exists sessions (
  token_hash text primary key,
  user_id uuid not null references users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists user_preferences (
  user_id uuid primary key references users(id) on delete cascade,
  preferences jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists folders (
  id text primary key,
  user_id uuid not null references users(id) on delete cascade,
  parent_id text,
  name text not null,
  sort_order integer not null default 0,
  deleted_at timestamptz,
  deleted_root_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists notes (
  id text primary key,
  user_id uuid not null references users(id) on delete cascade,
  folder_id text,
  title text not null,
  ui_style text not null default 'effie',
  favorite boolean not null default false,
  pinned boolean not null default false,
  last_opened_at timestamptz,
  deleted_at timestamptz,
  generation_state text not null default 'draft',
  sources_locked_at timestamptz,
  profile_locked_at timestamptz,
  generated_at timestamptz,
  generation_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists note_documents (
  note_id text primary key references notes(id) on delete cascade,
  revision integer not null default 0,
  editor_doc jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists source_documents (
  id text primary key,
  user_id uuid not null references users(id) on delete cascade,
  file_name text not null,
  mime_type text not null,
  kind text not null,
  file_size bigint not null,
  sha256 text not null,
  parse_status text not null,
  parse_error text,
  text_char_count integer not null default 0,
  parsed_content jsonb not null default '{}'::jsonb,
  object_key text,
  created_at timestamptz not null default now()
);

create table if not exists note_sources (
  note_id text not null references notes(id) on delete cascade,
  source_id text not null references source_documents(id) on delete cascade,
  sort_order integer not null default 0,
  primary key (note_id, source_id)
);

create table if not exists note_learning_profiles (
  note_id text primary key references notes(id) on delete cascade,
  intent text not null,
  level text not null,
  custom_level text,
  purpose text not null,
  custom_purpose text,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists learning_maps (
  note_id text not null references notes(id) on delete cascade,
  kind text not null check (kind in ('requirements', 'questions')),
  editor_doc jsonb not null,
  revision integer not null default 1,
  sync_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (note_id, kind)
);

create table if not exists learning_map_items (
  id text primary key,
  note_id text not null references notes(id) on delete cascade,
  map_kind text not null,
  source_anchor text,
  generated_title text,
  user_answer text,
  user_notes text,
  generated_revision integer not null default 1,
  user_revision integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists note_generation_jobs (
  id uuid primary key,
  note_id text not null references notes(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  status text not null,
  source_snapshot jsonb not null,
  profile_snapshot jsonb not null,
  result_revision integer,
  error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists chat_threads (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  note_id text not null references notes(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists chat_messages (
  id uuid primary key,
  thread_id uuid not null references chat_threads(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  answer_mode text not null,
  context_revision integer,
  created_at timestamptz not null default now()
);

create index if not exists notes_user_idx on notes(user_id, deleted_at, updated_at desc);
create index if not exists folders_user_idx on folders(user_id, parent_id, sort_order);
create index if not exists sources_user_idx on source_documents(user_id, created_at desc);
create index if not exists chat_note_idx on chat_threads(user_id, note_id);
