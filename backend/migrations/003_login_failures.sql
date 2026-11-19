BEGIN;
CREATE TABLE IF NOT EXISTS public.login_failures (
    id SERIAL PRIMARY KEY,
    key VARCHAR(300) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_login_failures_key_created ON public.login_failures (key, created_at);
COMMIT;
