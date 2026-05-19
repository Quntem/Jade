# Jade Agent

Minimal Jade server agent.

## Enroll

```bash
JADE_CONTROL_URL=https://jade.example.com \
JADE_ENROLLMENT_TOKEN=jade_enroll_xxx \
bun run --cwd apps/jade-agent start
```

## Run With Existing Credentials

```bash
JADE_CONTROL_URL=https://jade.example.com \
bun run --cwd apps/jade-agent start
```

Credentials are stored at `~/.jade/agent.json` by default. Override with
`JADE_AGENT_CONFIG=/path/to/agent.json`.

The agent also owns its WireGuard keypair locally using `wireguard-tools.js`.
It reports only the public key to Jade and stores dry-run VPN configs under
`~/.jade/vpn` by default. Override the dry-run config directory with
`JADE_VPN_CONFIG_DIR=/path/to/dir`.

By default delivered VPN configs are dry-run only. To apply the WireGuard
config on Linux, run the agent with:

```bash
JADE_VPN_APPLY=true \
JADE_WIREGUARD_INTERFACE=jade0 \
bun run --cwd apps/jade-agent start
```

Live apply uses `wireguard-tools.js` for the WireGuard device config and Linux
`ip` commands for the interface address/routes, so it must run with permission
to manage networking.
