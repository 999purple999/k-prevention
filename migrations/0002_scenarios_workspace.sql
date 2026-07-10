-- Scenari per-workspace: ogni istanza (workspace) ha il proprio insieme di scenari.
-- Le righe esistenti restano nel workspace di default.
ALTER TABLE simulations ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS idx_simulations_ws ON simulations(user_id, workspace_id);
