PRAGMA defer_foreign_keys=ON;--> statement-breakpoint

CREATE TABLE `__new_groups` (
	`groupid` text PRIMARY KEY NOT NULL,
	`group_name` text(50) NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`userids` text(1000),
	`metadata` text(2000)
);--> statement-breakpoint

INSERT INTO `__new_groups`("groupid", "group_name", "created_at", "userids", "metadata")
	SELECT
		g."groupid",
		g."group_name",
		CASE
			WHEN g."created_at" = 'CURRENT_TIMESTAMP' THEN COALESCE(
				(
					SELECT datetime(
						CASE
							WHEN MIN(u."created_at") > 9999999999 THEN MIN(u."created_at") / 1000
							ELSE MIN(u."created_at")
						END,
						'unixepoch'
					)
					FROM `user` u
					INNER JOIN json_each(
						CASE
							WHEN json_valid(g."userids") THEN g."userids"
							ELSE '[]'
						END
					) member
						ON member.value = u."id"
				),
				CURRENT_TIMESTAMP
			)
			ELSE g."created_at"
		END,
		g."userids",
		g."metadata"
	FROM `groups` g;--> statement-breakpoint

DROP TABLE `groups`;--> statement-breakpoint
ALTER TABLE `__new_groups` RENAME TO `groups`;--> statement-breakpoint

PRAGMA defer_foreign_keys=OFF;
