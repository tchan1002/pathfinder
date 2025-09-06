#!/bin/bash

# Robust build script with retry logic for database operations
set -e

echo "🔧 Starting build process..."

# Function to retry database operations
retry_db_operation() {
    local max_attempts=3
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        echo "🔄 Attempt $attempt of $max_attempts: $1"
        
        if eval "$1"; then
            echo "✅ Success: $1"
            return 0
        else
            echo "❌ Failed: $1 (attempt $attempt/$max_attempts)"
            if [ $attempt -lt $max_attempts ]; then
                echo "⏳ Waiting 10 seconds before retry..."
                sleep 10
            fi
            attempt=$((attempt + 1))
        fi
    done
    
    echo "💥 All attempts failed for: $1"
    return 1
}

# Generate Prisma client
echo "📦 Generating Prisma client..."
npx prisma generate

# Deploy migrations with retry logic
echo "🗄️ Deploying database migrations..."
retry_db_operation "npx prisma migrate deploy"

# Build Next.js application
echo "🏗️ Building Next.js application..."
npx next build --turbopack

echo "✅ Build completed successfully!"
