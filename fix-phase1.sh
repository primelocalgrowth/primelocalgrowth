#!/bin/bash

echo "🔧 Applying Phase 1 Critical Fixes..."

# 1. Strengthen CTA copy in local-domination.html
sed -i 's/"Get Started/"Start Moving Up on Google/g' public/local-domination.html

# 2. Add better form messaging
sed -i 's/Enter your info and we'll send/Let Adam audit your Google presence and show you/g' index.html

# 3. Replace generic language with proof-driven
sed -i 's/Learn why our clients are seeing results/See how a Dallas barbershop went from invisible to 8 Google reviews in 30 days/g' index.html

# 4. Strengthen "We handle everything" → "Adam handles"
sed -i 's/You stay focused on your work\. We make sure customers can find it\./Adam keeps your Google listing optimized while you focus on running the business\. No account managers\. No calls\./g' index.html

# 5. Add phase1-fixes.js script to all pages
for file in index.html public/local-domination.html public/premium.html public/roi-calculator.html; do
  if grep -q "</body>" "$file"; then
    # Check if script already added
    if ! grep -q "phase1-fixes.js" "$file"; then
      sed -i '/<\/body>/i\  <script src="/phase1-fixes.js"><\/script>' "$file"
    fi
  fi
done

echo "✅ Phase 1 fixes applied!"
echo "Changed:"
echo "  - Strengthened CTA copy"
echo "  - Replaced generic language"
echo "  - Added form handling script"
echo "  - Added accessibility features"
