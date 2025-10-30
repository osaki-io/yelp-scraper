#!/bin/bash
set -e

# Get tokens
GITHUB_TOKEN=$(security find-internet-password -s "github.com" -a "osaki-io" -w)
APIFY_TOKEN=$(cat ~/.apify/auth.json | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
REPO_NAME=$(basename $(pwd))
ACTOR_NAME=$(grep '"name"' apify.json | head -1 | cut -d'"' -f4)

echo "📦 Deploying $ACTOR_NAME to Apify..."

# 1. Git setup
[ ! -d .git ] && git init
git add .
git commit -m "Deploy: $(date +%Y-%m-%d-%H%M)" || true

# 2. Create GitHub repo (ignore if exists)
curl -s -X POST https://api.github.com/user/repos \
  -H "Authorization: token $GITHUB_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"name\": \"$REPO_NAME\", \"private\": false}" > /dev/null 2>&1 || true

# 3. Push to GitHub
git remote add origin https://$GITHUB_TOKEN@github.com/osaki-io/$REPO_NAME.git 2>/dev/null || true
git push -u origin main --force

# 4. Check if actor exists
ACTOR_ID=$(curl -s "https://api.apify.com/v2/acts?token=$APIFY_TOKEN&my=true" | \
  python3 -c "import sys, json; acts = json.load(sys.stdin)['data']['items']; matches = [a['id'] for a in acts if a['name'] == '$ACTOR_NAME']; print(matches[0] if matches else '')")

# 5. Create or update actor
if [ -z "$ACTOR_ID" ]; then
  echo "Creating new actor..."
  ACTOR_TITLE=$(grep title .actor/actor.json | cut -d'"' -f4)
  ACTOR_ID=$(curl -s -X POST "https://api.apify.com/v2/acts?token=$APIFY_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"name\": \"$ACTOR_NAME\", \"title\": \"$ACTOR_TITLE\", \"versions\": [{\"versionNumber\": \"0.1\", \"sourceType\": \"GIT_REPO\", \"gitRepoUrl\": \"https://github.com/osaki-io/$REPO_NAME\", \"buildTag\": \"latest\"}]}" | \
    python3 -c "import sys, json; print(json.load(sys.stdin)['data']['id'])")
fi

# 6. Trigger build
echo "Building actor $ACTOR_ID..."
BUILD_RESPONSE=$(curl -s -X POST "https://api.apify.com/v2/acts/$ACTOR_ID/builds?token=$APIFY_TOKEN&tag=latest&waitForFinish=120")

echo "$BUILD_RESPONSE" | python3 -c "import sys, json; build = json.load(sys.stdin)['data']; print(f\"✅ Build {build['status']}: {build.get('id', 'N/A')}\")"

echo "🎉 Deployment complete: https://console.apify.com/actors/$ACTOR_ID"
