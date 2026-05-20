#!/bin/bash
# Test Stripe Webhook - Simulates a checkout.session.completed event
# Usage: bash TEST-STRIPE-WEBHOOK.sh

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}=== Stripe Webhook Test ===${NC}\n"

# You'll need to set STRIPE_WEBHOOK_SECRET in your environment
if [ -z "$STRIPE_WEBHOOK_SECRET" ]; then
    echo -e "${RED}Error: STRIPE_WEBHOOK_SECRET not set${NC}"
    echo "Export it from Vercel Dashboard → Settings → Environment Variables"
    exit 1
fi

# Test data - Starter plan ($297/mo)
TIMESTAMP=$(date +%s)
PAYLOAD=$(cat <<'EOF'
{"type": "checkout.session.completed", "data": {"object": {"id": "cs_test_12345", "customer_email": "stripe-test@primelocalgrowth.com", "customer_details": {"email": "stripe-test@primelocalgrowth.com", "name": "Stripe Test"}, "amount_total": 29700, "metadata": {"product": "starter"}, "payment_status": "paid"}}}
EOF
)

echo -e "${YELLOW}Test Parameters:${NC}"
echo "Product: Starter ($297/mo)"
echo "Customer: stripe-test@primelocalgrowth.com"
echo "Endpoint: https://primelocalgrowth.com/api/stripe-webhook"
echo ""

# Generate signature
# Note: This requires openssl - if you're on Windows, you may need WSL or Git Bash
SIGNED_CONTENT="${TIMESTAMP}.${PAYLOAD}"
SIGNATURE=$(echo -n "$SIGNED_CONTENT" | openssl dgst -sha256 -hmac "$STRIPE_WEBHOOK_SECRET" -r | awk '{print $1}')

if [ -z "$SIGNATURE" ]; then
    echo -e "${RED}Error: Could not generate signature (openssl required)${NC}"
    echo "On Windows, use WSL or Git Bash to run this script"
    exit 1
fi

STRIPE_SIGNATURE="t=${TIMESTAMP},v1=${SIGNATURE}"

echo -e "${YELLOW}Sending webhook...${NC}\n"

# Send the webhook
RESPONSE=$(curl -X POST https://primelocalgrowth.com/api/stripe-webhook \
  -H "stripe-signature: $STRIPE_SIGNATURE" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" \
  -w "\n%{http_code}" \
  2>/dev/null)

# Parse response
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -n -1)

echo -e "${YELLOW}Response:${NC}"
echo "HTTP Status: $HTTP_CODE"
echo "Body: $BODY"
echo ""

if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✓ Webhook accepted${NC}"
    echo ""
    echo -e "${YELLOW}Expected emails:${NC}"
    echo "  1. Welcome email → stripe-test@primelocalgrowth.com"
    echo "  2. Onboarding checklist → stripe-test@primelocalgrowth.com"
    echo "  3. Admin notification → adam@primelocalgrowth.com"
    echo ""
    echo -e "${YELLOW}Check your inbox in 30 seconds...${NC}"
else
    echo -e "${RED}✗ Webhook rejected${NC}"
fi
