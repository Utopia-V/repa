# Repa security notice

Status: Limited current safety guidance. This repository does not currently
publish a supported-version matrix, a security-response SLA, or a dedicated
public vulnerability-reporting address. Inherited OpenCode contacts, scope
exclusions, credentials, and response promises are not Repa policy.

## Runtime boundary

Repa is a local agent system whose enabled capabilities may execute commands,
read or write files, access networks, and invoke external tools. Permission
prompts help control intended actions; they are not an operating-system
security sandbox. Use an appropriately isolated account, container, or virtual
machine when running against untrusted material or when stronger isolation is
required.

## Network server

The retained `repa serve` surface is opt-in. The current server warns when it
starts without authentication. Set `REPA_SERVER_PASSWORD` to require HTTP Basic
Authentication; the username defaults to `repa` and can be changed with
`REPA_SERVER_USERNAME`.

Do not expose the server beyond a trusted local boundary unless authentication
and the surrounding host/network controls have been deliberately configured.

## Reporting

Do not post secrets, private learner or source data, or unredacted exploit
details in a public issue. Use only a private reporting channel explicitly
provided by the current repository owner. If no such channel has been
provided, this repository does not yet define an official reporting route; do
not infer one from OpenCode history.

For current project status and documentation authority, see
[docs/README.md](docs/README.md).
