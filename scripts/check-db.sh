#!/bin/bash

# Script to check database status and identify blocking transactions
echo "🔍 Checking database status..."

# Check if we can connect to the database
echo "📡 Testing database connection..."
if npx prisma db execute --schema=./prisma/schema.prisma --stdin <<< "SELECT 1;"; then
    echo "✅ Database connection successful"
else
    echo "❌ Database connection failed"
    exit 1
fi

# Check for long-running transactions
echo "🔍 Checking for long-running transactions..."
npx prisma db execute --schema=./prisma/schema.prisma --stdin <<< "
SELECT 
    pid,
    now() - pg_stat_activity.query_start AS duration,
    query,
    state
FROM pg_stat_activity 
WHERE (now() - pg_stat_activity.query_start) > interval '5 minutes'
    AND state != 'idle'
ORDER BY duration DESC;
"

# Check for advisory locks
echo "🔒 Checking for advisory locks..."
npx prisma db execute --schema=./prisma/schema.prisma --stdin <<< "
SELECT 
    locktype,
    database,
    relation,
    page,
    tuple,
    virtualxid,
    transactionid,
    classid,
    objid,
    objsubid,
    virtualtransaction,
    pid,
    mode,
    granted
FROM pg_locks 
WHERE locktype = 'advisory'
ORDER BY pid;
"

echo "✅ Database check completed"
