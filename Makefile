
# Variables
TSX = npx tsx
PRISMA = npx prisma
SYNC_SCRIPT = scripts/sync_all.ts

# Default goal
all: sync dev

# Check for .env file using Node.js for cross-platform compatibility
check-env:
	@node -e "if (!require('fs').existsSync('.env')) { console.error('⚠️  Error: .env file not found. Database connection will fail.'); process.exit(1); }"

# Install dependencies
install:
	npm install

# Generate Prisma Client
generate:
	$(PRISMA) generate

# Initialize/Setup the project
setup: install generate

# Synchronize data from all sources (Claude, Cline, Codex, Antigravity)
sync: check-env
	@echo "🔄 Synchronizing all AI token data..."
	$(TSX) $(SYNC_SCRIPT)

# Clear entire DB sync state and data, then perform a fresh sync
re-sync: check-env
	@echo "🧨 Resetting and re-synchronizing all data..."
	$(TSX) scripts/clear_db.ts
	$(TSX) $(SYNC_SCRIPT)

# Start development server
dev:
	npm run dev

# Main command: Sync all data and then start the server
run: sync dev

# Build for production
build: generate
	npm run build

# Clean temporary files (be careful)
clean:
	rm -rf .next
	rm -f scripts/*.js
	@echo "🧹 Cleaned build artifacts."

.PHONY: all check-env install generate setup sync dev run build clean
