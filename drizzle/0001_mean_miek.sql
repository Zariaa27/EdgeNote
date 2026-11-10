CREATE TABLE `account_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`purpose` text NOT NULL,
	`target_email` text,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `account_tokens_token_hash_unique` ON `account_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `account_tokens_user_purpose_idx` ON `account_tokens` (`user_id`,`purpose`);--> statement-breakpoint
ALTER TABLE `users` ADD `email_verified_at` integer;
--> statement-breakpoint
UPDATE `users` SET `email_verified_at` = `created_at` WHERE `email_verified_at` IS NULL;