#!/bin/bash

SHARED_DEV_ALB=internal-tir-dev-shared-alb-124795801.eu-central-1.elb.amazonaws.com

if [ -z "$SHARED_DEV_ALB" ]; then
    echo "❌ SHARED_DEV_ALB is not set. Please set it to the shared development ALB URL."
    exit 1
fi  

# Test VPN connectivity script using developer-certs/client-template.ovpn
echo "Testing VPN connectivity using client-template.ovpn..."
echo "VPN Config: $(ls -la developer-certs/client-template.ovpn 2>/dev/null || echo 'client-template.ovpn not found')"

sudo openvpn --config developer-certs/client-template.ovpn --daemon

# Test shared ALB (placeholder URL)
echo "Testing shared development ALB..."
if curl --connect-timeout 10 $SHARED_DEV_ALB 2>/dev/null; then
    echo " "
    echo "✅ Shared ALB accessible"
else
    echo "❌ Shared ALB not accessible - VPN required"
fi

sudo pkill openvpn

echo "VPN connectivity test completed"