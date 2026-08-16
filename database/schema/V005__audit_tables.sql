CREATE TABLE audit.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    correlation_id UUID,
    user_id UUID,
    username VARCHAR(50),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100),
    entity_id UUID,
    old_value JSONB,
    new_value JSONB,
    ip_address INET,
    user_agent TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'SUCCESS',
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
-- Prevent any UPDATE or DELETE on audit_logs
CREATE OR REPLACE FUNCTION audit.prevent_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit logs are immutable. UPDATE and DELETE are not allowed.';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER audit_logs_immutable
BEFORE UPDATE OR DELETE ON audit.audit_logs
FOR EACH ROW EXECUTE FUNCTION audit.prevent_audit_modification();
