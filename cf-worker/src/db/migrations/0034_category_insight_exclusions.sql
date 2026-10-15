-- Explicit household category preference. No financial or saved-category assignments change.
-- Existing and newly created categories remain included until a user opts out.
ALTER TABLE group_categories ADD COLUMN exclude_from_insights INTEGER NOT NULL DEFAULT 0 CHECK (exclude_from_insights IN (0,1));
