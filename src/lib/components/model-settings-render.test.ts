import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import StageModelSettings from './StageModelSettings.svelte';
import ModelPicker from './ModelPicker.svelte';
import ModelBrowser from './ModelBrowser.svelte';
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
    expect(body).toContain('Edit multiple stages');
    expect(body).not.toContain('Select all stages');
    expect(body).toContain('Browse configurations');
    expect(body).toContain('Import JSON');
    expect(body).not.toContain('Choose different models');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('searches by exact ID outside the active browse view', () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const model = {
      id: 'example/model',
      name: 'Example Model',
      pricing: { prompt: '0.000001', completion: '0.000001' }
    };
    const { body } = render(ModelBrowser, {
      props: {
        catalogue: [model],
        selected: [],
        onselect: vi.fn(),
        refresh: vi.fn(),
        view: 'free',
        search: ' EXAMPLE/MODEL '
      }
    });
    expect(body).toContain('Example Model');
    expect(body).toContain('1 model in search results');
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
    expect(body).toContain('Panel members (2 of 8)');
    expect(body).toContain('Shared Fusion thinking effort');
    expect(body).toContain('Provider default');
  });
});
