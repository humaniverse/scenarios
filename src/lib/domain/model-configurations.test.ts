import { describe, expect, it } from 'vitest';
import { newProject, parseProject } from './project';
import {
  assignConfiguration,
  defaultFusion,
  requestModels,
  resetStageModels,
  resolveModelConfiguration
} from './model-settings';
import {
  applyPortableConfiguration,
  configurationForTarget,
  exportConfiguration,
  parseConfiguration
} from './model-configurations';
import { configurationLibrary } from './configuration-library';
import { configurationIssues } from '$lib/ai/model-configuration';
import type { Model } from '$lib/ai/models';

const direct = (id: string): Model => ({
  id,
  name: id,
  pricing: { prompt: '0', completion: '0' },
  reasoning: { supported_efforts: ['high', 'medium', 'low'] }
});

describe('resolved stage configuration and backwards compatibility', () => {
  it('retains partial inheritance, independent stage effort, dormant Fusion choices and the separate writer', () => {
    const p = newProject();
    p.writer = 'example/writer';
    p.stageReasoningEfforts['2'] = { [p.models[0]]: 'low' };
    p.modelModeOverrides['5'] = 'fusion';
    p.fusionOverrides['5'] = {
      ...defaultFusion(),
      type: 'custom',
      models: ['example/a'],
      effort: 'provider-default'
    };
    expect(resolveModelConfiguration(p, '2').efforts[p.models[0]]).toBe('low');
    expect(resolveModelConfiguration(p, '1').efforts[p.models[0]]).toBe('medium');
    p.models = ['example/b'];
    p.modelMode = 'fusion';
    expect(resolveModelConfiguration(p, '2').models).toEqual(['example/b']);
    expect(resolveModelConfiguration(p, '2').mode).toBe('fusion');
    expect(p.overrides['2']).toBeUndefined();
    expect(requestModels(p, 6)).toEqual(['openrouter/fusion']);
    p.modelMode = 'individual';
    expect(requestModels(p, 6)).toEqual(['example/writer']);
    expect(resolveModelConfiguration(p, '5').fusion.models).toEqual(['example/a']);
    const restored = parseProject(JSON.parse(JSON.stringify(p)));
    expect(resolveModelConfiguration(restored, '5')).toEqual(resolveModelConfiguration(p, '5'));
    expect(restored.writer).toBe('example/writer');
  });
  it('resets all modern and legacy writing overrides without changing shared preferences', () => {
    const p = newProject();
    p.overrides['7'] = ['example/old-writer'];
    p.modelModeOverrides['7'] = 'fusion';
    p.fusionOverrides['7'] = { ...defaultFusion(), preset: 'general-fast' };
    p.stageReasoningEfforts['7'] = { 'example/old-writer': 'low' };
    expect(resolveModelConfiguration(p, '6').fusion.preset).toBe('general-fast');
    resetStageModels(p, '6');
    expect(requestModels(p, 7)).toEqual([p.writer]);
    expect(p.fusionOverrides).toEqual({});
    expect(p.stageReasoningEfforts).toEqual({});
    expect(p.reasoningEfforts[p.models[0]]).toBe('medium');
  });
  it('pins an absent copied effort while preserving direct edits that inherit', () => {
    const p = newProject();
    const config = {
      ...resolveModelConfiguration(p),
      models: ['example/a'],
      writer: 'example/a',
      efforts: {}
    };
    assignConfiguration(p, '2', config);
    p.reasoningEfforts['example/a'] = 'low';
    expect(resolveModelConfiguration(p, '2').efforts['example/a']).toBeUndefined();
    p.stageReasoningEfforts['1'] = {};
    expect(resolveModelConfiguration(p, '1').efforts['example/a']).toBe('low');
    expect(parseProject(JSON.parse(JSON.stringify(p))).stageEffortInheritance['2']).toBe(false);
    resetStageModels(p, '2');
    expect(resolveModelConfiguration(p, '2').efforts['example/a']).toBe('low');
  });
  it('copies applied settings instead of retaining a mutable reference', () => {
    const p = newProject();
    const config = resolveModelConfiguration(p);
    assignConfiguration(p, '2', config);
    config.models.push('example/new');
    config.fusion.models.push('example/new');
    config.efforts[p.models[0]] = 'low';
    expect(p.overrides['2']).toHaveLength(1);
    expect(p.fusionOverrides['2'].models).toHaveLength(3);
    expect(p.stageReasoningEfforts['2'][p.models[0]]).toBe('medium');
  });
});

describe('portable model configurations', () => {
  it('round-trips both formats while excluding exercise content, budgets, runs and credentials', () => {
    const p = newProject();
    p.question = 'PRIVATE QUESTION';
    p.researchNotes = 'PRIVATE NOTES';
    Object.assign(p, { apiKey: 'SECRET' });
    p.overrides['2'] = ['example/a'];
    p.fusion = { ...defaultFusion(), preset: 'general-fast' };
    for (const kind of ['panel', 'stage-setup'] as const) {
      const file = exportConfiguration(p, kind);
      const text = JSON.stringify(file);
      expect(text).not.toMatch(/PRIVATE|SECRET|apiKey|budget|researchNotes|runs/);
      expect(parseConfiguration(text)).toEqual(file);
    }
    const setup = exportConfiguration(p, 'stage-setup');
    expect(configurationForTarget(setup, '1')).toBe('inherit');
    expect(configurationForTarget(setup, '2')).toMatchObject({ models: ['example/a'] });
  });
  it('validates every shipped library entry and its format', () => {
    expect(configurationLibrary).toHaveLength(5);
    expect(new Set(configurationLibrary.map((c) => c.id)).size).toBe(5);
    for (const c of configurationLibrary) expect(parseConfiguration(JSON.stringify(c))).toEqual(c);
  });
  it('fails atomically when a multi-model panel lacks an explicit writing choice', () => {
    const p = newProject();
    const before = JSON.stringify(p);
    const panel = configurationLibrary.find((c) => c.id === 'developer-breadth')!;
    expect(() => applyPortableConfiguration(p, panel, ['1', '6'])).toThrow('writing model');
    expect(JSON.stringify(p)).toBe(before);
    if (panel.kind !== 'panel') throw new Error('Panel fixture missing');
    applyPortableConfiguration(p, panel, ['1', '6'], panel.configuration.models[1]);
    expect(requestModels(p, 6)).toEqual([panel.configuration.models[1]]);
    expect(p.overrides['1']).toEqual(panel.configuration.models);
    expect(p.overrides['2']).toBeUndefined();
    expect(p.configurationProvenance['6'].id).toBe(panel.id);
  });
  it('accepts partial stage setups and applies explicit inheritance only to selected targets', () => {
    const p = newProject();
    p.overrides['1'] = ['example/retained'];
    p.overrides['2'] = ['example/reset'];
    const file = parseConfiguration(
      JSON.stringify({
        format: 'scenario-designer-models',
        schemaVersion: 1,
        id: 'partial',
        revision: 1,
        name: 'Partial setup',
        description: '',
        kind: 'stage-setup',
        defaults: resolveModelConfiguration(newProject()),
        stages: { '2': 'inherit' }
      })
    );
    applyPortableConfiguration(p, file, ['2']);
    expect(p.overrides['1']).toEqual(['example/retained']);
    expect(p.overrides['2']).toBeUndefined();
    expect(configurationForTarget(file, '5')).toBeUndefined();
  });
  it('rejects malformed, oversized, unsupported, credential-bearing and recursive configurations', () => {
    const valid = configurationLibrary[0];
    expect(() => parseConfiguration('{')).toThrow('valid JSON');
    expect(() => parseConfiguration(' '.repeat(256 * 1024 + 1))).toThrow('256 KiB');
    for (const replacement of [
      { schemaVersion: 2 },
      { apiKey: 'secret' },
      { sourceUrl: 'javascript:alert(1)' }
    ])
      expect(() => parseConfiguration(JSON.stringify({ ...valid, ...replacement }))).toThrow();
    if (valid.kind !== 'panel') throw new Error('Panel fixture missing');
    const recursive = {
      ...valid,
      configuration: {
        ...valid.configuration,
        fusion: { ...valid.configuration.fusion, type: 'custom', models: ['~openrouter/fusion'] }
      }
    };
    expect(() => parseConfiguration(JSON.stringify(recursive))).toThrow();
    expect(() =>
      parseConfiguration(
        JSON.stringify({
          ...valid,
          configuration: { ...valid.configuration, efforts: {}, apiKey: 'secret' }
        })
      )
    ).toThrow();
  });
  it('reports unsupported effort and unavailable members without substituting them', () => {
    const p = newProject();
    const c = resolveModelConfiguration(p);
    c.mode = 'fusion';
    c.fusion = { ...defaultFusion(), type: 'custom', models: ['example/a', 'example/missing'] };
    const before = JSON.stringify(c);
    const model = direct('example/a');
    model.reasoning = { supported_efforts: ['low'] };
    const errors = configurationIssues(c, [direct('openrouter/fusion'), model]);
    expect(errors.join(' ')).toContain('example/missing');
    expect(errors.join(' ')).toContain('high thinking effort');
    expect(JSON.stringify(c)).toBe(before);
  });
});
