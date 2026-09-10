CREATE TABLE `people` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`name` text NOT NULL,
	`contact` text NOT NULL,
	`availability` text NOT NULL,
	`selections` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'intent' NOT NULL,
	`assignment` text DEFAULT '' NOT NULL,
	`receipt` text,
	`payment_method` text,
	`review_note` text DEFAULT '' NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `people_token_hash_unique` ON `people` (`token_hash`);--> statement-breakpoint
CREATE TABLE `settings` (
	`id` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `songs` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`artist` text NOT NULL,
	`normal` text NOT NULL,
	`roles` text NOT NULL,
	`final` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `songs_normal_unique` ON `songs` (`normal`);