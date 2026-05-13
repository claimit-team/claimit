## What changed

<!-- Brief description of the change. 1-2 sentences. -->

## Why

<!-- What problem does this solve? Link to ticket. -->

Ticket: <!-- e.g., [1.7] or N/A -->

## How to test

<!-- Steps for reviewer to verify. -->

1.
2.
3.

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Refactor
- [ ] Documentation
- [ ] Tooling / CI / config
- [ ] Interface change ⚠️ (schema, types, Pub/Sub event, API contract)

## Interface change checklist

<!-- Skip if not an interface change. -->

- [ ] PR title prefixed with `[INTERFACE-CHANGE]`
- [ ] TypeScript types + Pydantic models updated together
- [ ] Migration impact described above
- [ ] Posted in #claimit for 24h review

## Branch target

- [ ] Target branch is `dev` (default for feature work)
- [ ] OR: target branch is `main` (only for promoting dev → main as stable snapshot)

## Checklist

- [ ] Pre-commit hooks pass locally
- [ ] CI passes
- [ ] Self-reviewed the diff
- [ ] If UI change: tested at 375px width
- [ ] If new dependency: justified above
