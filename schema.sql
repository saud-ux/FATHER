CREATE TABLE IF NOT EXISTS `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`data` text NOT NULL
);

CREATE TABLE IF NOT EXISTS image_objects (key TEXT PRIMARY KEY, mime TEXT NOT NULL, size INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS image_chunks (key TEXT NOT NULL, part INTEGER NOT NULL, bytes BLOB NOT NULL, PRIMARY KEY(key,part));

CREATE TABLE IF NOT EXISTS active_game (slot INTEGER PRIMARY KEY CHECK(slot=1), session_id TEXT NOT NULL UNIQUE);
