CREATE TABLE `access_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`attempts` integer NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `people` ADD `contact_key` text;--> statement-breakpoint
ALTER TABLE `people` ADD `password_hash` text;--> statement-breakpoint
CREATE UNIQUE INDEX `people_contact_key_unique` ON `people` (`contact_key`);