CREATE TABLE ai.document_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_type VARCHAR(50),
    source_id UUID,
    chunk_text TEXT NOT NULL,
    embedding vector(768),
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ON ai.document_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
