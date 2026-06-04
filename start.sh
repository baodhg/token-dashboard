#!/bin/sh

# Run migrations
echo "Running prisma migrate deploy..."
npx prisma migrate deploy

# Start the application
echo "Starting the application..."
node server.js
