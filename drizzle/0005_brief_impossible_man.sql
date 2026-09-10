CREATE TABLE `session_songs` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`song_id` text NOT NULL,
	`final` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`config` text NOT NULL,
	`use_public_library` integer DEFAULT 1 NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_slug_unique` ON `sessions` (`slug`);--> statement-breakpoint
ALTER TABLE `people` ADD `session_id` text DEFAULT 'session-001' NOT NULL;