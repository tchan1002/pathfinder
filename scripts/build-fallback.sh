#!/bin/bash

# Fallback build script that skips migrations if database is unavailable
set -e

echo "🔧 Starting fallback build process..."

# Generate Prisma client
echo "📦 Generating Prisma client..."
npx prisma generate

# Try to deploy migrations, but don't fail if database is unavailable
echo "🗄️ Attempting to deploy database migrations..."
if npx prisma migrate deploy; then
    echo "✅ Migrations deployed successfully"
else
    echo "⚠️ Migration deployment failed, continuing with build..."
    echo "💡 This is expected if the database is temporarily unavailable"
fi

# Build Next.js application
echo "🏗️ Building Next.js application..."
npx next build --turbopack

echo "✅ Fallback build completed successfully!"
