-- Additive sidecars: existing financial rows and old Worker writes are untouched.
CREATE TABLE group_categories (
 id TEXT PRIMARY KEY, group_id TEXT NOT NULL REFERENCES groups(groupid),
 name TEXT NOT NULL, slug TEXT, archived_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(group_id, slug), UNIQUE(group_id, id)
);
CREATE INDEX group_categories_active ON group_categories(group_id, archived_at);
CREATE TABLE record_categories (
 group_id TEXT NOT NULL REFERENCES groups(groupid), record_kind TEXT NOT NULL CHECK(record_kind IN ('expense','budget')),
 record_id TEXT NOT NULL, category_id TEXT,
 source TEXT NOT NULL CHECK(source IN ('manual','linked','scheduled','rule','provider','ai','uncategorised')),
 version INTEGER NOT NULL DEFAULT 1, mutation_id TEXT,
 PRIMARY KEY(group_id, record_kind, record_id),
 FOREIGN KEY(group_id,category_id) REFERENCES group_categories(group_id,id)
);
CREATE INDEX record_categories_filter ON record_categories(group_id, record_kind, category_id, record_id);
CREATE TABLE category_rules (
 id TEXT PRIMARY KEY, group_id TEXT NOT NULL REFERENCES groups(groupid),
 pattern TEXT NOT NULL, match_kind TEXT NOT NULL CHECK(match_kind IN ('merchant','description')),
 category_id TEXT NOT NULL, created_by TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(group_id, match_kind, pattern),
 FOREIGN KEY(group_id,category_id) REFERENCES group_categories(group_id,id)
);
CREATE INDEX category_rules_group ON category_rules(group_id);
