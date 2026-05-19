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

By default delivered VPN configs are dry-run only. On Fedora Silverblue and
other NetworkManager-managed Linux hosts, run the agent with:

```bash
JADE_VPN_APPLY=true \
JADE_VPN_APPLY_BACKEND=networkmanager \
JADE_WIREGUARD_INTERFACE=jade0 \
bun run --cwd apps/jade-agent start
```

Live apply uses `wireguard-tools.js` to validate/render the WireGuard config,
then imports it with `nmcli connection import type wireguard file ...`. The
agent process must have permission to manage NetworkManager connections.

To bypass NetworkManager and configure the interface directly with
`wireguard-tools.js`, use:

```bash
JADE_VPN_APPLY=true \
JADE_VPN_APPLY_BACKEND=wireguard-tools.js \
JADE_WIREGUARD_INTERFACE=jade0 \
bun run --cwd apps/jade-agent start
```

The direct backend still uses Linux `ip` commands to assign the interface
address and routes.
