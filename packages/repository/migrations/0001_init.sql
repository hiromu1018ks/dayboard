-- dayborad 初期スキーマ
-- [database_schema.md §3] の全テーブル・制約・インデックスを作成する。
-- 作成順序は [§7.3] に従い、循環FK（todo_items.source_note_line_meta_id ↔
-- note_line_metas.converted_to_todo_id / converted_to_blocker_id、および
-- blocker_items.linked_todo_id → todo_items）はテーブル作成後に ALTER TABLE で付与する。

-- 1. day_notes — [§3.1]
CREATE TABLE day_notes (
  id               text PRIMARY KEY,
  date             date NOT NULL,
  theme            text,
  last_opened_mode text NOT NULL DEFAULT 'work'
                   CHECK (last_opened_mode IN ('work', 'note')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_day_notes_date ON day_notes (date);

-- 2. user_settings — [§3.2]。MVPは単一ユーザーのため常に1行
CREATE TABLE user_settings (
  id                  text PRIMARY KEY,
  keybinding_mode     text NOT NULL DEFAULT 'standard'
                      CHECK (keybinding_mode IN ('standard', 'vim')),
  vim_default_state   text NOT NULL DEFAULT 'normal'
                      CHECK (vim_default_state IN ('normal', 'insert')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- 3. todo_items — [§3.3]
--    source_note_line_meta_id のFKは循環参照のため一旦 FK なしで作成し、
--    note_line_metas 作成後に ALTER TABLE で付与する（[§7.3]）。
CREATE TABLE todo_items (
  id                       text PRIMARY KEY,
  day_note_id              text NOT NULL
                           REFERENCES day_notes(id) ON DELETE CASCADE,
  title                    text NOT NULL,
  status                   text NOT NULL DEFAULT 'todo'
                           CHECK (status IN ('todo', 'done', 'carried')),
  "order"                  integer NOT NULL,
  source_note_line_meta_id text,
  carried_from_todo_id     text,
  carried_from_date        date,
  created_at               timestamptz NOT NULL DEFAULT now(),
  completed_at             timestamptz,
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (carried_from_todo_id IS NULL AND carried_from_date IS NULL)
    OR
    (carried_from_todo_id IS NOT NULL AND carried_from_date IS NOT NULL)
  )
);

CREATE INDEX idx_todo_items_day_note_id_order
  ON todo_items (day_note_id, "order");
CREATE INDEX idx_todo_items_carried_from_todo_id
  ON todo_items (carried_from_todo_id)
  WHERE carried_from_todo_id IS NOT NULL;

-- 4. blocker_items — [§3.4]
--    linked_todo_id / source_note_line_meta_id のFKは後段で ALTER により付与（[§7.3]）。
CREATE TABLE blocker_items (
  id                       text PRIMARY KEY,
  day_note_id              text NOT NULL
                           REFERENCES day_notes(id) ON DELETE CASCADE,
  text                     text NOT NULL,
  linked_todo_id           text,
  source_note_line_meta_id text,
  resolved                 boolean NOT NULL DEFAULT false,
  "order"                  integer NOT NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  resolved_at              timestamptz,
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_blocker_items_day_note_id_order
  ON blocker_items (day_note_id, "order");

-- 5. reflections — [§3.5]。DayNoteと1:1
CREATE TABLE reflections (
  id                   text PRIMARY KEY,
  day_note_id          text NOT NULL UNIQUE
                       REFERENCES day_notes(id) ON DELETE CASCADE,
  done_text            text NOT NULL DEFAULT '',
  stuck_text           text NOT NULL DEFAULT '',
  tomorrow_action_text text NOT NULL DEFAULT '',
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- 6. note_entries — [§3.6]。DayNoteと1:1
CREATE TABLE note_entries (
  id          text PRIMARY KEY,
  day_note_id text NOT NULL
              REFERENCES day_notes(id) ON DELETE CASCADE,
  body        text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_note_entries_day_note_id
  ON note_entries (day_note_id);

-- 7. note_line_metas — [§3.7]
--    converted_to_todo_id / converted_to_blocker_id のFKは循環参照のため
--    後段で ALTER により付与（[§7.3]）。
CREATE TABLE note_line_metas (
  id                          text PRIMARY KEY,
  note_entry_id               text NOT NULL
                              REFERENCES note_entries(id) ON DELETE CASCADE,
  line_number_at_conversion   integer NOT NULL,
  normalized_line_text        text NOT NULL,
  line_hash                   text NOT NULL,
  line_text                   text NOT NULL,
  converted_to_todo_id        text,
  converted_to_blocker_id     text,
  converted_to_reflection     boolean NOT NULL DEFAULT false,
  converted_at                timestamptz NOT NULL DEFAULT now(),
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_note_line_metas_note_entry_id
  ON note_line_metas (note_entry_id);
CREATE INDEX idx_note_line_metas_todo_duplicate_lookup
  ON note_line_metas (note_entry_id, line_hash)
  WHERE converted_to_todo_id IS NOT NULL;
CREATE INDEX idx_note_line_metas_blocker_duplicate_lookup
  ON note_line_metas (note_entry_id, line_hash)
  WHERE converted_to_blocker_id IS NOT NULL;
CREATE UNIQUE INDEX uq_note_line_metas_converted_to_todo_id
  ON note_line_metas (converted_to_todo_id)
  WHERE converted_to_todo_id IS NOT NULL;
CREATE UNIQUE INDEX uq_note_line_metas_converted_to_blocker_id
  ON note_line_metas (converted_to_blocker_id)
  WHERE converted_to_blocker_id IS NOT NULL;

-- 8. 循環FK・後段FKを ALTER TABLE で付与（[§7.3]）
ALTER TABLE todo_items
  ADD CONSTRAINT todo_items_source_note_line_meta_id_note_line_metas_id_fk
  FOREIGN KEY (source_note_line_meta_id)
  REFERENCES note_line_metas(id) ON DELETE SET NULL;

ALTER TABLE blocker_items
  ADD CONSTRAINT blocker_items_linked_todo_id_todo_items_id_fk
  FOREIGN KEY (linked_todo_id)
  REFERENCES todo_items(id) ON DELETE SET NULL;

ALTER TABLE blocker_items
  ADD CONSTRAINT blocker_items_source_note_line_meta_id_note_line_metas_id_fk
  FOREIGN KEY (source_note_line_meta_id)
  REFERENCES note_line_metas(id) ON DELETE SET NULL;

ALTER TABLE note_line_metas
  ADD CONSTRAINT note_line_metas_converted_to_todo_id_todo_items_id_fk
  FOREIGN KEY (converted_to_todo_id)
  REFERENCES todo_items(id) ON DELETE SET NULL;

ALTER TABLE note_line_metas
  ADD CONSTRAINT note_line_metas_converted_to_blocker_id_blocker_items_id_fk
  FOREIGN KEY (converted_to_blocker_id)
  REFERENCES blocker_items(id) ON DELETE SET NULL;
