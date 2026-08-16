-- Enforce PM assignment and MD reporting invariants at the database boundary.

CREATE UNIQUE INDEX IF NOT EXISTS uq_app_user_prj_mgr_id
    ON nicsi_erp.app_user (prj_mgr_id)
    WHERE prj_mgr_id IS NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_app_user_managed_by'
          AND conrelid = 'nicsi_erp.app_user'::regclass
    ) THEN
        ALTER TABLE nicsi_erp.app_user
            ADD CONSTRAINT fk_app_user_managed_by
            FOREIGN KEY (managed_by)
            REFERENCES nicsi_erp.app_user(username)
            ON DELETE RESTRICT;
    END IF;
END $$;
