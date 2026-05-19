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

