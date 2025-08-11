# VPN Docker Setup Guide

## Overview

This guide explains how to run OpenVPN inside Docker containers to enable access to TIR Browser development services that require VPN connectivity.

## Prerequisites

1. **Docker with privileged container support**
2. **VPN configuration file** (`developer-certs/client-template.ovpn`)
3. **Host system with TUN/TAP support**

## Setup Steps

### 1. Verify VPN Configuration

Ensure your VPN configuration file is properly set up (Check README.md):

```bash
# Check if VPN config exists
ls -la developer-certs/client-template.ovpn

# Verify config has certificates embedded
grep -c "BEGIN CERTIFICATE" developer-certs/client-template.ovpn
```

### 2. Test VPN Connection (Host)

First test VPN connection on the host system:

```bash
# Install OpenVPN (if not already installed)
sudo yum install openvpn

# Test VPN connection
sudo openvpn --config developer-certs/client-template.ovpn --daemon

# Test connectivity
./test-vpn.sh

# Stop VPN
sudo pkill openvpn
```

### 3. Run VPN-Enabled Docker Services

#### Option A: VPN Test Service Only

```bash
# Start just the VPN test service
docker-compose up vpn-test

# Check logs
docker logs tir-vpn-test -f
```

#### Option B: Full Application Stack

```bash
# Start all services
docker-compose up -d

# Check VPN test service logs
docker logs tir-vpn-test -f

# Check application logs
docker logs tir-auth -f
```

### 4. Verify VPN Connectivity

```bash
# Check if VPN test service can reach Loki
docker exec tir-vpn-test curl -f $LOKI_REMOTE_URL/ready

# Test from host
curl http://localhost:3000/ready
```

## Docker Configuration Details

### VPN Test Service Configuration

```yaml
vpn-test:
  image: alpine:latest
  privileged: true              # Required for VPN
  cap_add:
    - NET_ADMIN                 # Network administration capability
  devices:
    - /dev/net/tun             # TUN device for VPN
  volumes:
    - ./developer-certs/client-template.ovpn:/etc/openvpn/client.ovpn:ro
```

### Key Requirements

1. **Privileged Mode**: Required for network interface manipulation
2. **NET_ADMIN Capability**: Allows network configuration changes
3. **TUN Device**: Virtual network interface for VPN tunnel
4. **VPN Config Mount**: OpenVPN configuration file

## Troubleshooting

### Common Issues

1. **Permission Denied for /dev/net/tun**
   ```bash
   # Ensure TUN module is loaded
   sudo modprobe tun
   
   # Check if device exists
   ls -la /dev/net/tun
   ```

2. **VPN Connection Fails**
   ```bash
   # Check OpenVPN logs in container
   docker exec tir-vpn-test cat /var/log/openvpn.log
   
   # Verify VPN config
   docker exec tir-vpn-test cat /etc/openvpn/client.ovpn
   ```

3. **DNS Resolution Issues**
   ```bash
   # Test DNS inside container
   docker exec tir-vpn-test nslookup $(echo $LOKI_REMOTE_URL | cut -d'/' -f3 | cut -d':' -f1)
   ```

4. **Container Networking Issues**
   ```bash
   # Check container network
   docker network ls
   docker network inspect tir-browser-network
   ```

### Debug Commands

```bash
# Enter VPN test container
docker exec -it tir-vpn-test sh

# Check network interfaces
ip addr show

# Check routing table
ip route show

# Test connectivity
ping 8.8.8.8
curl -v $LOKI_REMOTE_URL/ready
```

## Security Considerations

1. **Privileged Containers**: Only use for development environments
2. **VPN Credentials**: Keep VPN configuration files secure
3. **Network Isolation**: Use Docker networks to isolate services
4. **Container Updates**: Regularly update base images

## Alternative Approaches

### Host VPN + Container Networking

If privileged containers are not allowed:

```bash
# Run VPN on host
sudo openvpn --config developer-certs/client-template.ovpn --daemon

# Use host networking for containers
docker run --network host your-app
```

### VPN Sidecar Pattern

For production-like setups, consider using a dedicated VPN sidecar container that other containers can share network namespace with.

## Testing Checklist

- [ ] VPN configuration file exists and is valid
- [ ] Docker supports privileged containers
- [ ] TUN device is available (`/dev/net/tun`)
- [ ] VPN test service starts successfully
- [ ] OpenVPN connects without errors
- [ ] Loki endpoint is accessible from container
- [ ] Application can reach development services
- [ ] Logs are properly forwarded to Loki

## Support

For issues with VPN setup:

1. Check container logs: `docker logs tir-vpn-test`
2. Verify VPN config: `developer-certs/client-template.ovpn`
3. Test host VPN connection first
4. Ensure Docker daemon supports privileged containers