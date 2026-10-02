import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { AGENTS, DEPARTMENTS, JOB_AGENT, PIPELINE, SKILLS, TOOLS, agentIdForJob } from '@/server/org/model';
import { JOB_TYPES } from '@/domain/jobs';
import { classifyFailure, RETRYABLE_CLASSES } from '@/server/org/runs';
import { StudioError } from '@/domain/errors';

/** The organisation is code; these tests keep it consistent so the registry sync never persists a dangling
 *  reference and every job the worker can run has an agent with the tools that job calls. */

describe('the studio organisation', () => {
  it('has an Executive Office and eight departments with existing directors', () => {
    expect(DEPARTMENTS.map((d) => d.id)).toEqual(['EXECUTIVE', 'STORY', 'CASTING', 'WORLD', 'PREPRODUCTION', 'VIDEO', 'SOUND', 'POST', 'QA']);
    for (const d of DEPARTMENTS) expect(AGENTS.some((a) => a.id === d.directorId), `${d.id} director`).toBe(true);
  });
  it('every agent lists only registered tools and skills, in a known department, with unique ids', () => {
    const ids = new Set<string>();
    for (const a of AGENTS) {
      expect(ids.has(a.id), `duplicate agent ${a.id}`).toBe(false); ids.add(a.id);
      expect(DEPARTMENTS.some((d) => d.id === a.department)).toBe(true);
      for (const t of a.tools) expect(TOOLS.some((x) => x.id === t), `${a.id} → ${t}`).toBe(true);
      for (const s of a.skills) expect(SKILLS.some((x) => x.id === s), `${a.id} → ${s}`).toBe(true);
      expect(a.systemInstructions.length).toBeGreaterThan(20);
      expect(a.model.length).toBeGreaterThan(2);
    }
  });
  it('every job type is executed by exactly one agent', () => {
    for (const t of JOB_TYPES) {
      const owners = AGENTS.filter((a) => a.jobTypes.includes(t));
      expect(owners.length <= 1, `${t} owned by ${owners.map((a) => a.id).join(', ')}`).toBe(true);
      expect(JOB_AGENT[t], `${t} has an agent`).toBeTruthy();
      expect(AGENTS.some((a) => a.id === JOB_AGENT[t])).toBe(true);
    }
    expect(agentIdForJob({ type: 'PLAN_SHOTS', payload: { performanceOnly: true } })).toBe('singing-performance');
    expect(agentIdForJob({ type: 'PLAN_SHOTS', payload: {} })).toBe('film-director');
    expect(agentIdForJob({ type: 'GENERATE_TAKE', payload: {} })).toBe('minimax-video-specialist');
  });
  it('the executing agents hold the tools their handlers call', () => {
    const needs: Record<string, string[]> = {
      GENERATE_TAKE: ['video.minimax_generate', 'speech.synthesize', 'speech.transcribe', 'media.probe', 'media.qa_take'],
      DIALOGUE_AUDIO: ['speech.synthesize', 'speech.transcribe'],
      VOICE_BUILD: ['speech.synthesize', 'speech.clone_voice', 'speech.transcribe'],
      GENERATE_SONG: ['music.generate', 'audio.separate_stems', 'speech.transcribe', 'lyrics.align'],
      ASSEMBLE: ['media.assemble', 'media.align_lag', 'media.validate_export'],
      EXPORT: ['media.assemble', 'media.align_lag', 'media.validate_export'],
      SHOT_FRAMES: ['image.generate', 'image.edit_with_references'],
      CHARACTER_APPEARANCE: ['image.generate', 'image.edit_with_references'],
      LOCATION_PLATES: ['image.generate', 'image.edit_with_references'],
      PRODUCE: ['jobs.enqueue'], CREATE_CHARACTER: ['jobs.enqueue'], DESIGN_CHARACTER: ['story.structured_answer'],
      DEVELOP_STORY: ['story.structured_answer'], WRITE_SCRIPT: ['story.structured_answer'], PLAN_SHOTS: ['story.structured_answer'], AUTO_IDEA: ['story.structured_answer'],
      MEDIA_PROBE: ['media.probe'],
    };
    for (const [job, tools] of Object.entries(needs)) {
      const a = AGENTS.find((x) => x.id === JOB_AGENT[job as keyof typeof JOB_AGENT])!;
      for (const t of tools) expect(a.tools, `${a.id} needs ${t} for ${job}`).toContain(t);
    }
    expect(AGENTS.find((a) => a.id === 'singing-performance')!.tools).toEqual(expect.arrayContaining(['story.structured_answer', 'speech.transcribe', 'lyrics.align']));
  });
  it('the pipeline is a DAG whose stages belong to the departments that own them', () => {
    const ids = PIPELINE.map((s) => s.id);
    for (const s of PIPELINE) {
      for (const d of s.dependsOn) expect(ids.indexOf(d), `${s.id} depends on later ${d}`).toBeLessThan(ids.indexOf(s.id));
      const dept = DEPARTMENTS.find((x) => x.id === s.department)!;
      expect(dept.stages, `${dept.id} owns ${s.id}`).toContain(s.id);
      // a stage's jobs run in a department that owns the stage (Cast & world is shared by Casting and World)
      for (const t of s.jobTypes) expect(DEPARTMENTS.find((d) => d.id === AGENTS.find((a) => a.id === JOB_AGENT[t])!.department)!.stages, `${t} runs in a department owning ${s.id}`).toContain(s.id);
    }
    expect(PIPELINE.filter((s) => s.approval === 'HUMAN').map((s) => s.id)).toEqual(['STORY', 'EDIT']);
  });
  it('every validated skill has its SKILL.md in Agent Skills format; hosted MiniMax skills are marked unavailable', () => {
    for (const s of SKILLS) {
      const file = path.resolve(process.cwd(), 'skills', path.basename(s.path), 'SKILL.md');
      expect(fs.existsSync(file), `${s.id}: ${file}`).toBe(true);
      const text = fs.readFileSync(file, 'utf8');
      expect(text.startsWith('---\n')).toBe(true);
      expect(text).toMatch(new RegExp(`^name: ${s.id}$`, 'm'));
      expect(text).toMatch(/^description: .{20,}$/m);
      for (const t of s.requiredTools) expect(TOOLS.some((x) => x.id === t)).toBe(true);
      if (s.source.includes('MiniMax-AI/skills')) expect(s.status).toBe('UNAVAILABLE');
    }
  });
});

describe('failure classification', () => {
  it('maps errors to the directive’s classes and allows blind retries only for transient ones', () => {
    expect(classifyFailure(new StudioError('INVALID', 'Shot not found'))).toBe('INVALID_INPUT');
    expect(classifyFailure(new StudioError('UNAVAILABLE', 'ComfyUI is not reachable'))).toBe('INFRASTRUCTURE');
    expect(classifyFailure(new StudioError('PROVIDER', 'MiniMax answered 502'))).toBe('PROVIDER');
    expect(classifyFailure(new Error('CUDA out of memory'))).toBe('RESOURCE_EXHAUSTION');
    expect(classifyFailure(new Error('the shot has characters but no portrait to hold their identity'))).toBe('MISSING_REFERENCE');
    expect(classifyFailure(new Error('The export failed validation: not decodable'))).toBe('OUTPUT_CORRUPTION');
    expect(classifyFailure(Object.assign(new Error('x'), { failureClass: 'LIP_SYNC_FAILURE' }))).toBe('LIP_SYNC_FAILURE');
    expect(classifyFailure(Object.assign(new Error('cancelled'), { name: 'Cancelled' }))).toBe('CANCELLED');
    expect(RETRYABLE_CLASSES).toEqual(['INFRASTRUCTURE', 'PROVIDER', 'RESOURCE_EXHAUSTION']);
    expect(RETRYABLE_CLASSES).not.toContain('MISSING_REFERENCE');
  });
});
