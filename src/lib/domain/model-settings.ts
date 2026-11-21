import { z } from 'zod';
import recommendations from '../config/model-recommendations.json';

export const FUSION_MODEL = 'openrouter/fusion';
export const defaultModels = ['~anthropic/claude-sonnet-latest'];
export const suggestedModels = recommendations.models;
export const modelModeSchema = z.enum(['individual', 'fusion']);
export type ModelMode = z.infer<typeof modelModeSchema>;
export const effortSchema = z.enum(['max', 'xhigh', 'high', 'medium', 'low', 'minimal', 'none']);
export type ReasoningEffort = z.infer<typeof effortSchema>;
export const effortPreferenceSchema = z.union([effortSchema, z.literal('provider-default')]);
export type EffortPreference = z.infer<typeof effortPreferenceSchema>;
export const modelIdSchema = z
  .string()
  .min(3)
  .max(180)
  .regex(/^~?[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.:-]+$/);
export const isRouterModel = (id: string) => id.replace(/^~/, '').startsWith('openrouter/');
const distinctModels = z
  .array(modelIdSchema)
  .min(1)
  .max(32)
  .refine((models) => new Set(models).size === models.length, 'Choose each model only once.');
export const fusionSchema = z
  .object({
    type: z.enum(['preset', 'custom']),
    preset: z.enum(['quality', 'general-high', 'general-budget', 'general-fast']),
    models: distinctModels.refine(
      (models) => models.length <= 8 && models.every((id) => !isRouterModel(id)),
      'Fusion needs 1–8 individual models, with no routers.'
    ),
    analyst: modelIdSchema
      .refine((id) => !isRouterModel(id), 'Choose an individual analyst model.')
      .optional(),
    effort: z.union([effortSchema, z.literal('provider-default')])
  })
  .strict();
export type FusionConfiguration = z.infer<typeof fusionSchema>;
export const defaultFusion = (): FusionConfiguration => ({
  type: 'preset',
  preset: 'quality',
  models: ['~anthropic/claude-opus-latest', '~openai/gpt-sol-latest', '~google/gemini-pro-latest'],
  effort: 'high'
});
export const copyFusion = (f: FusionConfiguration): FusionConfiguration => ({
  ...f,
  models: [...f.models]
});
export const configurationSchema = z
  .object({
    mode: modelModeSchema,
    models: distinctModels.refine(
      (ids) => !ids.some((id) => id.startsWith('openrouter/fusion')),
      'Use Fusion mode for Fusion.'
    ),
    writer: modelIdSchema.refine(
      (id) => !id.replace(/^~/, '').startsWith('openrouter/fusion'),
      'Use Fusion mode instead of a Fusion writer.'
    ),
    efforts: z.record(modelIdSchema, effortPreferenceSchema),
    fusion: fusionSchema
  })
  .strict();
export type ModelConfiguration = z.infer<typeof configurationSchema>;
export const configurationProvenanceSchema = z
  .object({
    id: z.string().max(120),
    revision: z.number().int().positive(),
    name: z.string().max(160),
    appliedAt: z.string().datetime()
  })
  .strict();
export const fusionPresets = [
  { id: 'quality', name: 'Quality · OpenRouter default' },
  { id: 'general-high', name: 'Quality · general-high preset' },
  { id: 'general-budget', name: 'Budget · general-budget' },
  { id: 'general-fast', name: 'Fast · general-fast' }
] as const;
export function fusionLabel(fusion: FusionConfiguration) {
  return fusion.type === 'custom'
    ? `Custom Fusion · ${fusion.models.length} ${fusion.models.length === 1 ? 'member' : 'members'}`
    : fusion.preset === 'quality' || fusion.preset === 'general-high'
      ? 'Fusion · Quality'
      : fusion.preset === 'general-budget'
        ? 'Fusion · Budget'
        : 'Fusion · Fast';
}
export function fusionPlugin(fusion: FusionConfiguration) {
  return {
    id: 'fusion',
    ...(fusion.type === 'custom'
      ? { analysis_models: [...fusion.models] }
      : fusion.preset !== 'quality'
        ? { preset: fusion.preset }
        : {}),
    ...(fusion.analyst ? { model: fusion.analyst } : {}),
    ...(fusion.effort !== 'provider-default' ? { reasoning: { effort: fusion.effort } } : {})
  };
}
const scopes = (scope: string) => (scope === '6' || scope === '7' ? ['6', '7'] : [scope]);
const scoped = <T>(values: Record<string, T> | undefined, scope: string): T | undefined =>
  scopes(scope)
    .map((key) => values?.[key])
    .find((value) => value !== undefined);
export const effortLabels: Record<ReasoningEffort, string> = {
  max: 'Maximum',
  xhigh: 'Very high',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  minimal: 'Minimal',
  none: 'Off'
};
const names: Record<string, string> = {
  '~anthropic/claude-sonnet-latest': 'Claude Sonnet Latest',
  'mistralai/mistral-large-4-0': 'Mistral Large 4',
  '~moonshotai/kimi-latest': 'MoonshotAI: Kimi Latest',
  '~anthropic/claude-opus-latest': 'Claude Opus Latest',
  '~openai/gpt-sol-latest': 'GPT Sol Latest',
  '~google/gemini-pro-latest': 'Gemini Pro Latest',
  'meta/muse-wonder': 'Muse Wonder',
  [FUSION_MODEL]: 'OpenRouter Fusion',
  'openrouter/free': 'Free Models Router'
};
export const displayModelName = (id: string, catalogueName?: string) =>
  names[id] ?? catalogueName ?? id.split('/').slice(1).join('/').replace(/-/g, ' ');
export const modelName = (id: string) => displayModelName(id);
export function selectionMode(
  p: { modelMode?: ModelMode; modelModeOverrides?: Record<string, ModelMode> },
  scope = 'default'
): ModelMode {
  return (
    (scope === 'default' ? undefined : scoped(p.modelModeOverrides, scope)) ??
    p.modelMode ??
    'individual'
  );
}

export interface ModelPreferences {
  models: string[];
  overrides: Record<string, string[]>;
  writer: string;
  modelMode: ModelMode;
  modelModeOverrides: Record<string, ModelMode>;
  reasoningEfforts?: Record<string, EffortPreference>;
  stageReasoningEfforts?: Record<string, Record<string, EffortPreference>>;
  stageEffortInheritance?: Record<string, boolean>;
  fusion?: FusionConfiguration;
  fusionOverrides?: Record<string, FusionConfiguration>;
  configurationProvenance?: Record<string, z.infer<typeof configurationProvenanceSchema>>;
}
export const aiModelStages = [1, 2, 4, 5, 6];
export const hasStageModels = (p: ModelPreferences, scope: string) =>
  scopes(scope).some(
    (key) =>
      Object.hasOwn(p.overrides, key) ||
      Object.hasOwn(p.modelModeOverrides, key) ||
      Object.hasOwn(p.fusionOverrides ?? {}, key) ||
      Object.hasOwn(p.stageEffortInheritance ?? {}, key) ||
      Object.hasOwn(p.stageReasoningEfforts ?? {}, key)
  );

// Writing produces one proposal at a time; old multi-model overrides retain their first writer.
export function stageModels(p: ModelPreferences, scope: string): string[] {
  if (scope === '6' || scope === '7') return [scoped(p.overrides, scope)?.[0] ?? p.writer];
  return [...(scoped(p.overrides, scope) ?? p.models)];
}
export function resolveModelConfiguration(
  p: ModelPreferences,
  scope = 'default'
): ModelConfiguration {
  return {
    mode: selectionMode(p, scope),
    models: scope === 'default' ? [...p.models] : stageModels(p, scope),
    writer: (scope === 'default' ? undefined : scoped(p.overrides, scope)?.[0]) ?? p.writer,
    efforts: {
      ...(scope === 'default' || scoped(p.stageEffortInheritance, scope) !== false
        ? p.reasoningEfforts
        : {}),
      ...(scope === 'default' ? {} : scoped(p.stageReasoningEfforts, scope))
    },
    fusion: copyFusion(
      (scope === 'default' ? undefined : scoped(p.fusionOverrides, scope)) ??
        p.fusion ??
        defaultFusion()
    )
  };
}
export function assignConfiguration(
  p: ModelPreferences,
  scope: string,
  config: ModelConfiguration
) {
  if (scope !== 'default' && scope !== '7' && !aiModelStages.map(String).includes(scope))
    throw new Error('Unknown model stage.');
  if (scope === 'default') {
    p.models = [...config.models];
    p.writer = config.writer;
    p.modelMode = config.mode;
    p.reasoningEfforts = { ...config.efforts };
    p.fusion = copyFusion(config.fusion);
  } else {
    if ((scope === '6' || scope === '7') && config.mode === 'individual' && !config.writer)
      throw new Error('Choose one writing model.');
    const key = scope === '7' ? '6' : scope;
    p.overrides[key] = key === '6' ? [config.writer] : [...config.models];
    p.modelModeOverrides[key] = config.mode;
    (p.stageReasoningEfforts ??= {})[key] = { ...config.efforts };
    // Copying pins even an absent preference; direct edits retain per-model inheritance.
    (p.stageEffortInheritance ??= {})[key] = false;
    (p.fusionOverrides ??= {})[key] = copyFusion(config.fusion);
  }
}
export function customizeStageModels(p: ModelPreferences, scope: string) {
  if (!Object.hasOwn(p.overrides, scope)) p.overrides[scope] = stageModels(p, scope);
  if (!Object.hasOwn(p.modelModeOverrides, scope))
    p.modelModeOverrides[scope] = selectionMode(p, scope);
}
export function resetStageModels(p: ModelPreferences, scope: string) {
  for (const key of scopes(scope)) {
    delete p.overrides[key];
    delete p.modelModeOverrides[key];
    delete p.stageReasoningEfforts?.[key];
    delete p.stageEffortInheritance?.[key];
    delete p.fusionOverrides?.[key];
    delete p.configurationProvenance?.[key];
  }
}
export function requestModels(p: ModelPreferences, stage: number, single = false): string[] {
  const config = resolveModelConfiguration(p, String(stage));
  return config.mode === 'fusion' ? [FUSION_MODEL] : single ? [config.writer] : config.models;
}
