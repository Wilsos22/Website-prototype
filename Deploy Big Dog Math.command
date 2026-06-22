#!/bin/bash
# Double-click this file to commit + push (which auto-deploys to Vercel).
# It asks what you changed, then does add → commit → push for you.

cd "$(dirname "$0")" || { echo "Could not find the project folder."; read -r; exit 1; }

# Clear any stale git lock left by a crashed/closed git process.
rm -f .git/index.lock .git/HEAD.lock

echo ""
echo "  Big Dog Math — Deploy"
echo "  ---------------------"
echo "  What did you change? (type a short note, then press Enter)"
printf "  > "
read -r msg
[ -z "$msg" ] && msg="update"

echo ""
git add -A
git commit -m "$msg"
echo ""

if git push; then
  echo ""
  echo "  ✅ Pushed! Vercel will deploy in a minute or two."
else
  echo ""
  echo "  ⚠️  Push didn't go through — read the message above."
fi

echo ""
echo "  Press Enter to close."
read -r _
