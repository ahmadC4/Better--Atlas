CREATE TABLE IF NOT EXISTS sessions (
    sid varchar PRIMARY KEY,
    sess jsonb NOT NULL,
    expire timestamp NOT NULL
);

CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON sessions (expire);
