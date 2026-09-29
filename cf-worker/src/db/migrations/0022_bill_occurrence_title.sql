-- Keep the title shown for a dated payment even if the bill plan is renamed.
ALTER TABLE `bill_occurrences` ADD COLUMN `title` text NOT NULL DEFAULT '';--> statement-breakpoint
UPDATE `bill_occurrences`
SET `title` = COALESCE((SELECT `title` FROM `bills` WHERE `bills`.`id` = `bill_occurrences`.`bill_id`), '')
WHERE `title` = '';
