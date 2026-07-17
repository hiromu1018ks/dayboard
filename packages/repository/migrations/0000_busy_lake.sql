CREATE TABLE `blocker_items` (
	`id` text PRIMARY KEY NOT NULL,
	`day_note_id` text NOT NULL,
	`text` text NOT NULL,
	`linked_todo_id` text,
	`source_note_line_meta_id` text,
	`resolved` integer DEFAULT false NOT NULL,
	`order` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`resolved_at` integer,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`day_note_id`) REFERENCES `day_notes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`linked_todo_id`) REFERENCES `todo_items`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`source_note_line_meta_id`) REFERENCES `note_line_metas`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_blocker_items_day_note_id_order` ON `blocker_items` (`day_note_id`,`order`);--> statement-breakpoint
CREATE TABLE `day_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`theme` text,
	`last_opened_mode` text DEFAULT 'work' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	CONSTRAINT "day_notes_last_opened_mode_check" CHECK("last_opened_mode" IN ('work', 'note'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_day_notes_date` ON `day_notes` (`date`);--> statement-breakpoint
CREATE TABLE `note_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`day_note_id` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`day_note_id`) REFERENCES `day_notes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_note_entries_day_note_id` ON `note_entries` (`day_note_id`);--> statement-breakpoint
CREATE TABLE `note_line_metas` (
	`id` text PRIMARY KEY NOT NULL,
	`note_entry_id` text NOT NULL,
	`line_number_at_conversion` integer NOT NULL,
	`normalized_line_text` text NOT NULL,
	`line_hash` text NOT NULL,
	`line_text` text NOT NULL,
	`converted_to_todo_id` text,
	`converted_to_blocker_id` text,
	`converted_to_reflection` integer DEFAULT false NOT NULL,
	`converted_at` integer DEFAULT (unixepoch()) NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`note_entry_id`) REFERENCES `note_entries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`converted_to_todo_id`) REFERENCES `todo_items`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`converted_to_blocker_id`) REFERENCES `blocker_items`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_note_line_metas_note_entry_id` ON `note_line_metas` (`note_entry_id`);--> statement-breakpoint
CREATE INDEX `idx_note_line_metas_todo_duplicate_lookup` ON `note_line_metas` (`note_entry_id`,`line_hash`) WHERE "converted_to_todo_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_note_line_metas_blocker_duplicate_lookup` ON `note_line_metas` (`note_entry_id`,`line_hash`) WHERE "converted_to_blocker_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_note_line_metas_converted_to_todo_id` ON `note_line_metas` (`converted_to_todo_id`) WHERE "converted_to_todo_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_note_line_metas_converted_to_blocker_id` ON `note_line_metas` (`converted_to_blocker_id`) WHERE "converted_to_blocker_id" IS NOT NULL;--> statement-breakpoint
CREATE TABLE `reflections` (
	`id` text PRIMARY KEY NOT NULL,
	`day_note_id` text NOT NULL,
	`done_text` text DEFAULT '' NOT NULL,
	`stuck_text` text DEFAULT '' NOT NULL,
	`tomorrow_action_text` text DEFAULT '' NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`day_note_id`) REFERENCES `day_notes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reflections_day_note_id_unique` ON `reflections` (`day_note_id`);--> statement-breakpoint
CREATE TABLE `todo_items` (
	`id` text PRIMARY KEY NOT NULL,
	`day_note_id` text NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'todo' NOT NULL,
	`order` integer NOT NULL,
	`source_note_line_meta_id` text,
	`carried_from_todo_id` text,
	`carried_from_date` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`completed_at` integer,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`day_note_id`) REFERENCES `day_notes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_note_line_meta_id`) REFERENCES `note_line_metas`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "todo_items_status_check" CHECK("status" IN ('todo', 'done', 'carried')),
	CONSTRAINT "todo_items_carried_from_pair_check" CHECK(("carried_from_todo_id" IS NULL AND "carried_from_date" IS NULL) OR ("carried_from_todo_id" IS NOT NULL AND "carried_from_date" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX `idx_todo_items_day_note_id_order` ON `todo_items` (`day_note_id`,`order`);--> statement-breakpoint
CREATE INDEX `idx_todo_items_carried_from_todo_id` ON `todo_items` (`carried_from_todo_id`) WHERE "carried_from_todo_id" IS NOT NULL;--> statement-breakpoint
CREATE TABLE `user_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`keybinding_mode` text DEFAULT 'standard' NOT NULL,
	`vim_default_state` text DEFAULT 'normal' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	CONSTRAINT "user_settings_keybinding_mode_check" CHECK("keybinding_mode" IN ('standard', 'vim')),
	CONSTRAINT "user_settings_vim_default_state_check" CHECK("vim_default_state" IN ('normal', 'insert'))
);
