@AGENTS.md

# BrainBrew

Read [`docs/CORE_SPEC.md`](docs/CORE_SPEC.md) before making any architectural decision — it's the constitution of this app (product vision, the five categories and why they're designed the way they are, engine registry, content pipeline, scheduler, scoring, anti-cheat, incident policy, data model, tech stack, build order). It is short enough to read in full; do that rather than guessing.

## The one-line summary if you only read this far

Daily five-puzzle pack, identical for every user in the world, one BrewScore, compared globally/by-country/with-friends. Solo founder, deliberately simple scope, not chasing a big hit. "AI is creative, the platform is deterministic" — AI generates puzzle *content* within fixed, human-designed puzzle *engines*; it never invents new mechanics, and nothing about scoring/ranking/validation is ever non-deterministic once a puzzle is approved and stored.

## Current phase

**Phase 0 — local prototype.** Home screen, five hardcoded puzzle engines (simplest possible versions), results screen, basic BrewScore. No backend, no accounts, no AI generation, no leaderboard yet. Goal: prove the five-category rhythm (Observation → Pattern → Logic → Language Logic → Attention Speed) is actually fun to play once a day. Full future build order is in Section 18 of the Core Spec — don't build ahead of it.

## Quick facts

- Frontend: React Native + Expo, **SDK 57** (check current versioned docs before writing Expo-specific code — the SDK has changed significantly since older training data, per `AGENTS.md`)
- Backend (later phases): Supabase
- Never paywall the core daily pack — monetization is additive only
- Never claim cognitive/brain-training benefits in copy or marketing (see Core Spec §1 for why — this is a real legal/scientific landmine, not a style preference)
