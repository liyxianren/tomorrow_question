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

- Treat `README.md` as the human entry document, not as the only source of truth.
- Treat `docs/最终交付确认文档.md` as the highest-priority product basis.
- For technical implementation guidance, prefer this order:
  - `docs/技术方案.md`
  - `docs/数据结构与状态流转设计.md`
  - `docs/接口与事件契约设计.md`
  - `docs/开发任务清单.md`
- For frontend productization guidance, prefer this order:
  - `docs/前端产品化改造设计.md`
  - `docs/前端产品化开发任务清单.md`
- If documents conflict, explain the priority instead of blending them into a vague answer.

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
