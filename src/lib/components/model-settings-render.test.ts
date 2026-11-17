import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import StageModelSettings from './StageModelSettings.svelte';
import ModelPicker from './ModelPicker.svelte';
import { newProject } from '$lib/domain/project';
import { defaultFusion } from '$lib/domain/model-settings';

afterEach(() => vi.unstubAllGlobals());
describe('model settings rendering without inference', () => {
  it('renders the visible stage overview, manual editing and configuration tools with no model calls', () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const p = newProject();
    const { body } = render(StageModelSettings, {
      props: {
        p,
        change: vi.fn(),
        catalogue: [],
        loaded: false,
        loading: false,
        status: '',
        refresh: vi.fn()
      }
    });
    expect(body).toContain('Models by analysis stage');
    for (const title of [
      'Explore drivers',
      'Assess drivers',
      'Develop hypotheses',
      'Build scenario combinations'
    ])
      expect(body).toContain(title);
    expect(body).toContain('Select all stages');
    expect(body).toContain('Browse configurations');
    expect(body).toContain('Import JSON');
    expect(body).not.toContain('Choose different models');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('renders a saved custom Fusion panel and its analyst without claiming the default panel ran', () => {
    const { body } = render(ModelPicker, {
      props: {
        catalogue: [],
        selected: ['example/a'],
        mode: 'fusion',
        fusion: {
          ...defaultFusion(),
          type: 'custom',
          models: ['example/a', 'example/b'],
          analyst: 'example/analyst',
          effort: 'provider-default'
        },
        onmodels: vi.fn(),
        onmode: vi.fn(),
        oneffort: vi.fn(),
        onfusion: vi.fn(),
        refresh: vi.fn()
      }
    });
    expect(body).toContain('example/a');
    expect(body).toContain('example/b');
    expect(body).toContain('example/analyst');
    expect(body).toContain('2 of 8');
    expect(body).toContain('Shared Fusion thinking effort');
    expect(body).toContain('Provider default');
  });
});
