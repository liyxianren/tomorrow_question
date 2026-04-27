---
name: tomorrow-question-entry
description: Project entry and document navigation skill for the tomorrow_question repo. Use when the user asks what this project is, which documents are authoritative, how the repository is organized, where to start reading, or which document should guide implementation.
---

# Tomorrow Question Entry

## Overview

Use this skill as the repository entry guide for `tomorrow_question`.
Start with a short Chinese overview of the project goal, current stage, and recommended reading order.
Keep answers architecture-first and documentation-first.

## Default Behavior

- First explain the project in one short paragraph.
- Then state the current phase: requirements and design documents are complete, implementation should follow the task list.
- If the user is asking specifically about frontend delivery, UI redesign, lobby/room/game page restructuring, or productization work, route them to the frontend-specific references before the generic task list.
- Then point to the next most relevant document instead of dumping large amounts of detail.
- Only read the reference files that match the user's question.

## Decision Rules

- Treat `README.md` and `docs/README.md` as human entry documents, not as the only source of truth.
- Current 2.0 economic migration priority is:
  1. `docs/用户原始需求-核心机制.md`
  2. `docs/2026-04-27-经济机制重构会议纪要.md`
  3. `docs/目标经济模型-供需价格机制.md`
  4. `docs/第一阶段-市场与生产机制.md`
  5. `docs/2.0迁移前逻辑推演与计划.md`
- Treat `docs/最终交付确认文档.md` and `docs/第一版本需求确认文档.md` as historical user requirement sources, but do not use them to override the received original core mechanism or the 2026-04-27 post-meeting economic migration docs.
- Current core economic direction: replace the Demo's concrete multi-goods / reference-price model with `原材料 -> 商品`, capacity-driven demand, supply-demand pricing, and `消费:投资:财政 = 5:3:2`.
- For technical implementation guidance during 2.0 migration, start from the phase-1 economy docs above, then inspect current code and tests before touching implementation.
- For frontend productization not involving the economic model, prefer:
  - `docs/前端产品化改造设计.md`
  - `docs/前端产品化开发任务清单.md`
- If documents conflict, explain the priority instead of blending them into a vague answer.
- If asked for a requirements-alignment or demo page, use real running game screenshots/components as the source of truth. Do not hand-write invented game UI; separate real static content from the project and add explanatory notes around it.

## What This Skill Should Not Do

- Do not restate the full game rules unless the user explicitly asks for them.
- Do not invent implementation details that are not confirmed in the documents.
- Do not treat `docs/superpowers/specs/` as a formal development basis.
- Do not replace the detailed design documents; route the user to them.

## Reference Guide

- Read [references/project-brief.md](references/project-brief.md) when the user asks what the project is, what is currently being built, or what the MVP boundary is.
- Read [references/doc-index.md](references/doc-index.md) when the user asks which documents matter, which one is authoritative, what the reading order is, or how to resolve document conflicts.
- Read [references/repo-layout.md](references/repo-layout.md) when the user asks how the repository is organized, where folders belong, where the skill lives, or how to install the skill for Codex discovery.
- Read [references/frontend-productization.md](references/frontend-productization.md) when the user asks about frontend delivery quality, homepage/lobby/room/game redesign, frontend task breakdown, or how the frontend workstream is decoupled from the general project task list.
