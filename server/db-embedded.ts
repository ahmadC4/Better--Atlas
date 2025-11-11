// WARNING: Hardcoding credentials is insecure. Prefer environment variables.
// If you still need to embed, put your full Postgres connection string here.
// Example: "postgresql://user:pass@host:5432/dbname?sslmode=require"

// Self-hosted Postgres (Docker) on 168.231.73.218
// Using the container defaults you shared: user=n8n, password=n8npass, db=n8n
// TLS disabled (no sslmode param) because your Docker Postgres likely doesn't serve TLS
export const EMBEDDED_DATABASE_URL = "postgresql://atlas:atlas_pass@168.231.73.218:5433/atlas_db";
