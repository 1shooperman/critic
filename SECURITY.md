# Security Policy

## Supported Versions

Only the latest release on the `main` branch receives security fixes.

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Please report them privately via GitHub's built-in security advisory feature:

1. Go to the [Security tab](https://github.com/1shooperman/critic/security) of this repository.
2. Click **"Report a vulnerability"**.
3. Fill in the details and submit.

You will receive a response within **72 hours** acknowledging receipt. We aim to triage and release a fix within **14 days** for high-severity issues, and **30 days** for lower-severity ones. We will keep you informed of progress throughout.

## Scope

Issues in scope include:

- Prompt or input injection that leads to unintended LLM behavior or data exfiltration
- Exposure of API keys or environment variables through responses or logs
- Dependency vulnerabilities with a realistic attack path against this service
- Container escape or privilege escalation in the Docker image

Out of scope:

- Vulnerabilities that require physical access to the host
- Issues in upstream LLM provider infrastructure (report those to Anthropic, OpenAI, or Google directly)
- Theoretical vulnerabilities with no practical exploit path

## Dependency Management

Dependencies are monitored automatically via Dependabot (weekly, grouped by ecosystem). Security patches from upstream packages are merged promptly.

## API Key Handling

This service reads API keys from environment variables at startup and passes them directly to the respective LangChain provider clients. Keys are never logged, returned in responses, or stored on disk. When deploying, use secrets management (Docker secrets, a vault, or your orchestrator's secret injection) rather than committing a populated `.env` file.
