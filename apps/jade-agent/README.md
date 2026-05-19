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
