CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`data` text NOT NULL
);
