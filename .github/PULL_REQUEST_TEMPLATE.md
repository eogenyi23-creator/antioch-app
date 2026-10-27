## Summary

<!-- What does this PR do? One or two sentences. -->

## Changes

<!-- Bullet list of the main changes. -->

-

## Motivation

<!-- Why is this change needed? Link to the issue if there is one. Closes #... -->

## Testing

<!-- How was this tested? What should a reviewer check? -->

- [ ] Unit tests added or updated
- [ ] Integration tests added or updated (if touching Stellar or payment flows)
- [ ] Tested locally against testnet
- [ ] `npm run lint` passes
- [ ] `npm run typecheck` passes
- [ ] `npm test` passes
- [ ] `npm run build` passes

## Security checklist

<!-- Tick any that apply. Leave blank if irrelevant. -->

- [ ] No private keys are logged or stored
- [ ] Amount inputs use `toStroops` / integer math (no floats)
- [ ] New payment endpoint has an idempotency key
- [ ] Zod schema validates the request body
- [ ] Admin / approver action is written to the audit log

## Notes for reviewers

<!-- Anything else the reviewer should know: trade-offs, open questions, follow-up issues. -->
