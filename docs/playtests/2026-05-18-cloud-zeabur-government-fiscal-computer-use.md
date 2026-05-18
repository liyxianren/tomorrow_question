# 2026-05-18 Zeabur cloud Computer Use pass: government fiscal and policy coverage

## Scope

- Target: https://tomorrowtest.zeabur.app/
- Room: `2BSXCQ`
- Game: `b99ecf84007e479395c61eb94650c879`
- Player country: Britain
- Method: Computer Use controlling Google Chrome as a real player.
- Status: partial pass, completed through round 6 decision entry and round 6 decision submission; full 1-15 pass is not complete in this note.

## High-Level Result

- No confirmed P0 blocker through the completed portion.
- Government decision content was not skipped in the covered rounds.
- The government fiscal display has a consistent serious presentation bug: real fiscal and policy quota are merged in several panels.
- Factory add and industry-upgrade mechanics are visible and at least partially verified as real next-round effects.
- Cloud still shows a wrong local-development error message during sale submission/opening even though retry succeeds.

## Round Log

| Round | Player actions | Next-round / settlement verification | Notes |
| --- | --- | --- | --- |
| R1 | Factory: add handcraft. Government: implemented Stock Market. Research: Jenny Spinning Machine. Sale: domestic max. | R2 factory capacity increased; government admin cap rose. | Trade/sale showed `后端服务不可用，请确认本地 API 已启动。` on cloud, but retry advanced. |
| R2 | Factory: add handcraft. Government: selected market subsidy, price control, higher commercial tax. Military: diplomacy with Americas. Sale: domestic max. | R3 Americas was marked established; sale price and domestic capacity reflected government policies. | Government policy effects are real, not only UI preview. |
| R3 | Factory: add handcraft. Government: implemented Parliament. Military checked. Sale: domestic max. | R4 handcraft capacity increased; Parliament unlocked petition policy in later government panel. | Fiscal display showed actual 61 but panel total 69 due policy quota. |
| R4 | Factory: new mechanized factory. Government: implemented Patent System. Military: recruited army. Research: Lathe. Sale: domestic max. | R5 mechanized capacity became 2 and army count became 1. | Patent unlocked Private Research in R5. |
| R5 | Factory: industry upgrade handcraft -> mechanized. Government: activated Private Research. Military checked. Sale: domestic max. | R6 factory/government settlement reflected changed split; R6 started with higher factory/government pools. | Industry upgrade immediately changed handcraft 11 -> 10 and mechanized 2 -> 3 in the factory panel. |
| R6 | Factory: add mechanized. Government: implemented Constitution. Military checked. | Decision submitted and advanced to sale. | Government fiscal line again showed actual 127 but displayed 135/135 with policy quota +8. |

## Bugs / Issues

### CLOUD-GOV-001 - P1 - Government fiscal display incorrectly includes policy quota

Observed repeatedly:

- R1/R2 factory and government panels showed values like `实际财政 25/25 · 政策额度 +8` while the headline government fiscal used the combined value.
- R3 side/map displayed government fiscal `61`, but modal summary displayed `政府财政 69/69 实际财政 61/61 · 政策额度 +8`.
- R5 side/map displayed government fiscal `114`, but government/factory modal displayed `122/122`.
- R6 side/map displayed government fiscal `127`, but modal displayed `135/135`.

Player-facing impact:

- Players will read `10 + 8` or `18` as real government fiscal, even though the policy quota is not actual treasury.
- This also makes military/government/factory budget lines inconsistent with the map sidebar.

Expected:

- Government fiscal should display only the real government treasury.
- If policy quota remains a separate concept internally, it should not be added into the visible government fiscal total.
- Since the current product decision is "不要市场额度了，都放到政府政策里面", the visible model should avoid presenting `实际财政 + 政策额度` as spendable fiscal.

### CLOUD-GOV-002 - P2 - Fiscal bug appears across multiple decision panels

The same merged fiscal display appears in:

- Factory modal shared header.
- Government modal headline and shared header.
- Market preview shared header.
- Military modal header.
- Research modal header.

This is likely a shared UI/selector issue, not one isolated page.

### CLOUD-NET-001 - P1 - Cloud sale flow displays local API error text

Observed repeatedly during sale flow:

`后端服务不可用，请确认本地 API 已启动。`

Player-facing impact:

- On Zeabur cloud this reads as a fatal deployment/local-server problem.
- In the observed cases, retrying submit advanced successfully, so it is not currently a confirmed hard blocker.

Expected:

- Cloud should show a retry/sync message, not "local API not started".
- If this is a transient sync delay, the UI should say the cloud request is retrying or the game is syncing.

### CLOUD-I18N-001 - P3 - Raw i18n/accessibility key still appears

Home page accessibility tree still exposed:

`home.heroActions.ariaLabel`

Impact is low for normal visual play, but it indicates incomplete i18n coverage.

## Verified Working Behaviors

- Ready waiting modal appears before entering game and no longer says "这不是 bug".
- R1 handcraft factory increase applied in R2.
- R2 government market policies changed sale price/capacity in sale phase.
- R2 Americas diplomacy applied in R3.
- R3 Parliament unlocked later policy options such as public petition.
- R4 new mechanized factory applied in R5.
- R5 industry upgrade immediately converted one handcraft capacity to mechanized capacity in the current round.
- R5 Patent System unlocked Private Research.

## Remaining Coverage Needed

- Continue R6 sale through R15.
- Continue entering government every round; cover remaining policies where possible.
- Verify R6 Constitution actually lowers ideology on R7.
- Verify R6 mechanized factory add increases mechanized capacity on R7.
- Continue research until Lathe and Watt Steam Engine unlock steam industry, then test steam factory add/upgrade.
- If possible, test Africa/Middle East diplomacy and overseas market sale.
