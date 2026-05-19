# Jade VPN Hub

Dry-run hub runtime for Jade VPN.

The hub pulls desired VPN state from Resource Manager and renders local files
for inspection using `wireguard-tools.js`. It does not apply WireGuard, create
network namespaces, or change routes yet.

## Run

```bash
JADE_RESOURCE_MANAGER_URL=https://jade.example.com \
JADE_VPN_HUB_ID=hub_id \
JADE_VPN_HUB_TOKEN=jade_vpn_hub_xxx \
bun run --cwd apps/vpn-hub start
```

Rendered files are written to `~/.jade/vpn-hub` by default. Override with
`JADE_VPN_HUB_OUTPUT_DIR=/path/to/output`.

The hub creates a local WireGuard private key at
`$JADE_VPN_HUB_OUTPUT_DIR/hub.privatekey` and never sends it to Resource
Manager.

Useful optional settings:

- `JADE_VPN_HUB_SYNC_INTERVAL_MS=30000`
- `JADE_VPN_HUB_ONCE=true`
