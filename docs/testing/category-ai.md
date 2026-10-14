# Category AI verification

Runtime model: `@cf/cloudflare/clef-flash`. Inputs contain only merchant (160 characters maximum), description (255 maximum), and fixed allowed category descriptions. No account, balance, key, member or group identifiers are sent. No prompts or responses are logged. One call per logical new save; linked pairs reuse the result. A 2.5-second deadline/error falls back to Uncategorised and never prevents a valid financial save. A timeout does not cancel a request already accepted by the remote binding.

## Locked synthetic policy

Calibration used 50 invented cases and an earlier combined food taxonomy. Its 28-case heldout subset accepted 24, correct 22 (91.7%), so that policy was rejected. Calibration fixtures/report are retained for transparency; they do not validate the final taxonomy.

The initial fresh 30-case heldout used the then-current runtime criteria, separating Groceries and Eating out, plus Transport, Housing, Utilities, Shopping, Health, Entertainment, Income, Other and Uncategorised. Acceptance policy was locked before those cases: top probability ≥ 0.75, margin ≥ 0.20, generic/empty/only-instruction text abstention. The response must contain all allowed finite probabilities, the selected option must be the top option, and Uncategorised is never automatically assigned as a non-null category.

Fresh result: 21 accepted, 21 correct, 70% coverage, 24 inference calls and 6 policy abstentions. Total successful live evaluation calls across calibration/probe/fresh was 75. This is observed precision on a small synthetic dataset, not a guarantee about real purchases. The runtime timeout may reduce automatic coverage below the observed synthetic coverage. Embedded instruction-injection cases were included; generic Amazon/PayPal/reference/transfer inputs abstain. No threshold retuning followed the fresh test.

## Supermarket criterion correction

A user-reported bare `lidl` description exposed taxonomy ambiguity. The released criteria returned Shopping at 0.402 versus Groceries at 0.2291 in 675ms and correctly abstained. A controlled comparison changed only the category descriptions: Groceries explicitly includes supermarkets/grocery retailers, while Shopping specifies non-food retail purchases. The same input then selected Groceries at 0.8136 with a 0.748 margin in 1180ms. The 0.75 probability, 0.20 margin and 2.5-second deadline remain unchanged; no merchant dictionary or lower confidence gate was added.

The revised criteria were locked before a fresh 22-case suite covering bare supermarket names, all categories, non-food supermarket context, ambiguous/generic and injection text. Eighteen accepted predictions were correct. Two further explicit non-food supermarket challenges requested during review (`Aldi cordless drill` and `Tesco school uniform`) both correctly selected Shopping. Combined result: 24 cases, 21 inference calls, 20 accepted/20 correct, 83.3% observed coverage, inference latency 299–1108ms. This remains a small synthetic sample, not a guarantee or runtime latency promise. Total live evaluation calls including the earlier 75, two controlled Lidl probes and this suite: 98. Charity donation abstained; three generic/injection cases were rejected before inference. The prior reports do not validate the revised criteria, and saved Uncategorised records are not silently changed.

## Reproduction

The script loads the actual runtime criteria and acceptance functions, avoiding a second taxonomy definition. An optional third argument selects a fixture path relative to the repository root. Earlier reports retain their own criteria; running their fixtures now tests the current criteria. Fixtures contain invented merchants/descriptions only. Provide `CF_ACCOUNT_ID` and `CF_API_TOKEN` (Account → Workers AI → Read); never commit credentials.

```sh
node scripts/evaluate-category-ai.mjs /private/tmp/category-ai-evaluation.json
```

This defaults to the current 24-case supermarket suite (21 inference calls, three policy abstentions), concurrency 4, no retries. It records elapsed inference latency for a new run; the original report did not measure latency. The six offline tests use mocked inference and verify allowed-score validation, bounded minimal inputs, timeout/errors, precedence, custom categories/default mapping, archived predictions and single-call paired save with outage fallback. Baseline Vitest disables categories and AI explicitly, so financial tests do not invoke remote inference.

AI always predicts the evaluated default slugs. Custom category choices/rules/defaults win; additional custom categories do not disable automatic defaults. An archived predicted default falls back to Uncategorised. Current bank adapters persist no normalized provider category hints, so they fall through to AI without inventing provider fields or storing raw payloads. Saved records are never automatically recategorised.

Official references: [model](https://developers.cloudflare.com/workers-ai/models/clef-flash/), [pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/), [data usage](https://developers.cloudflare.com/workers-ai/platform/data-usage/). Workers AI does not use input/output for training without explicit consent; minimal-input policy still applies.
