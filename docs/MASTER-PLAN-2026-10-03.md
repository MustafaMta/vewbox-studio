# Master plan — complete redesign and engineering (directive of 2026-10-03)

The producer's "Master Directive — Complete Redesign and Engineering of Vewbox AI Film Studio" (2026-10-03) widens
the scope from the phased rebuild (cleanup, Studio Company, characters, voice) back to the whole platform, design
first. This file is the durable plan; `docs/IMPLEMENTATION-CHECKLIST.md` (rows 18.x) is the record of what is done
and verified. Nothing is reported complete without the real application, real media and evidence.

## What is kept (built and verified in the phased rebuild — no rebuild without a demonstrated reason)

- Phase 0 cleanup, intake switch, empty first start (17.1–17.3).
- Studio Company architecture ORG_VERSION 5: real execution paths, planned roles, tool contracts, computed skills,
  provenance, lease fencing (17.6); Studio Company UI v3 verified in the browser (17.7).
- One canonical front full-body image per character: data model (17.12), cast UI (17.16); pipeline integration in
  progress (image engineer).
- Voice identity v2: design service (17.13), Iraqi A/B (17.15), backend in progress (voice engineer).
- Design system v3 foundation (17.11) — **a candidate, not a given**: the new design research decides what stays.

## Waves

**Wave A — research and audit (parallel, read-mostly)**
1. Design research (internet): Netflix, Disney+, Apple TV, IMDb, Spotify, Apple Music, YouTube Music, Adobe,
   DaVinci Resolve, Figma, Linear, Awwwards, Godly, Mobbin, Behance, Dribbble, Apple HIG, Material 3, WCAG 2.2 →
   `docs/research/DESIGN-RESEARCH-2026-10.md` (principles per page type, not screenshots).
2. Codebase audit (frontend + backend): dead/duplicated/abandoned code, fake UI behaviour, unused dependencies,
   oversized components, measured bottlenecks → `docs/AUDIT-CODEBASE.md` with verified evidence per item.
3. FLUX vs Qwen: licences and current versions (FLUX.2 klein 4B, other FLUX.2/FLUX.1 variants, Qwen-Image,
   Qwen-Image-Edit), then a controlled GPU A/B (Cartoon/Anime/Realistic, text and reference) → `docs/research/FLUX-VS-QWEN.md`.
4. MiniMax pipeline and long-form continuity review: H3 capabilities as installed, first-frame/reference/guide
   conditioning, continuation from the previous tail, assembly trimming, world/location identity, World Bible design →
   `docs/research/MINIMAX-CONTINUITY.md`.
In flight: canonical-image pipeline integration; voice identity v2 backend.

**Wave B — design system and redesign**
5. Product designer: design system v4 from the research (or v3 confirmed with evidence), page specs for Shows, show
   detail, Shorts, short detail, Music Videos, music video detail, Characters, cast profile, Locations, Studio
   Company, Production, Screening Room, Settings, creation flows and dialogs; EN/AR, desktop/tablet/phone.
6. Frontend engineers (split by page groups, shared kit first) implement the redesign.
7. Independent design-review agent inspects the rendered UI (desktop, tablet, phone, EN, AR) → fixes → re-review.

**Wave C — platform engineering (parallel with B where files do not overlap)**
8. Code cleanup from the audit (verified removals only).
9. World Bible: structured, versioned (characters, canonical images, voices, relationships, locations with canonical
   environment references, architecture/layout, props, wardrobe, timeline, lighting, weather, scene state, rules).
10. MiniMax shot preparation, first shot, continuation from the previous tail, assembly trimming, reference
    re-application — per the review.
11. Auto Idea research workflow — resume branch `deferred/auto-idea-research` (contract `docs/CONTRACTS-AUTO-IDEA.md`
    there), TikTok → Instagram → Facebook → YouTube with permitted access only.
12. Authoritative audio timeline review (dialogue, music, lead/backing vocals, ambience, foley, SFX, model audio).
13. First-attempt reliability: preflight completeness, failure classes, measured rates.

**Wave D — acceptance (real productions, reviewed media)**
1 Cartoon, 2 Anime, 3 Realistic character (one canonical image each); 4 English dialogue with persistent voices;
5 Iraqi Arabic dialogue; 6 multi-shot continuous action; 7 a scene returning to an established location; 8 a
complete Short; 9 a complete Music Video; 10 a 5–10 minute episode with recurring characters and stable locations.
Plus browser acceptance of every page and flow, negative tests (cancellation, interrupted jobs, worker restart,
invalid uploads, provider failure, recovery). Independent QA and technical review throughout.

**Wave E — final review and delivery**
Architecture/security/performance/code-quality review, reproducible Docker builds (incl. the :4300 web container),
restart and recovery drills, documentation, reliability and performance measurements, limitations, startup steps.

## Constraints that do not change

MiniMax is the only video engine. No hidden fallbacks. External skills are read-only knowledge. Secrets stay out of
the repo and logs. Licences verified before adoption. Iraqi dialect authenticity is decided by native listeners, never
by ASR. One character = one canonical front full-body image + one persistent voice identity; shot-specific references
are internal production assets, never extra identities. Draft → Approved → Locked enforced on the server.
