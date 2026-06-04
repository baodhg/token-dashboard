#!/bin/sh
set -e

# Wait for the database to accept connections. Needed for the bundled-db profile
# (the db container may still be starting); a no-op when DATABASE_URL points at a
# host/remote DB that is already up. `pg` ships in node_modules.
echo "Waiting for database..."
until node -e "const {Client}=require('pg');const c=new Client({connectionString:process.env.DATABASE_URL});c.connect().then(()=>c.end()).then(()=>process.exit(0)).catch(()=>process.exit(1));" 2>/dev/null; do
  echo "  database not ready yet, retrying in 2s..."
  sleep 2
done
echo "Database is ready."

# Apply pending migrations (creates the schema on a fresh database; no-op otherwise).
echo "Running prisma migrate deploy..."
npx prisma migrate deploy

# Start the application
echo "Starting the application..."
node server.js
