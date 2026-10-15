-- Job metadata only: financial tables are never updated by this workflow.
CREATE TABLE category_jobs (
 id TEXT PRIMARY KEY, group_id TEXT NOT NULL, user_id TEXT NOT NULL,
 request_id TEXT NOT NULL, selection TEXT NOT NULL,
 status TEXT NOT NULL CONSTRAINT category_jobs_status_check CHECK(status IN ('queued','running','completed','failed')),
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 rows_read INTEGER NOT NULL DEFAULT 0, records_read INTEGER NOT NULL DEFAULT 0, error TEXT
);
CREATE UNIQUE INDEX category_jobs_request_unique ON category_jobs(user_id,group_id,request_id);
CREATE UNIQUE INDEX category_jobs_active_group ON category_jobs(group_id) WHERE status IN ('queued','running');
CREATE UNIQUE INDEX category_jobs_active_user ON category_jobs(user_id) WHERE status IN ('queued','running');
CREATE INDEX category_jobs_owner_recent ON category_jobs(user_id,group_id,created_at DESC);
CREATE INDEX category_jobs_group_recent ON category_jobs(group_id,created_at DESC);
CREATE TABLE category_job_items (
 job_id TEXT NOT NULL REFERENCES category_jobs(id) ON DELETE CASCADE,
 position INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
 plan TEXT, record_count INTEGER NOT NULL DEFAULT 0, changed_count INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(job_id,position)
);
