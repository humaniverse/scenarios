import { z } from 'zod';
import {
  aiModelStages,
  assignConfiguration,
  configurationSchema,
  resetStageModels,
  resolveModelConfiguration,
  type ModelConfiguration,
  type ModelPreferences
} from './model-settings';

export const MAX_CONFIGURATION_BYTES = 256 * 1024;
const metadata = {
  format: z.literal('scenario-designer-models'),
  schemaVersion: z.literal(1),
  id: z.string().min(1).max(120),
  revision: z.number().int().positive(),
  name: z.string().min(1).max(160),
  description: z.string().max(4000),
  author: z.string().max(160).optional(),
  sourceUrl: z
    .url()
    .refine((value) => ['https:', 'http:'].includes(new URL(value).protocol))
    .optional(),
  reviewedAt: z.iso.date().optional()
};
export const portableConfigurationSchema = z.discriminatedUnion('kind', [
  z.object({ ...metadata, kind: z.literal('panel'), configuration: configurationSchema }).strict(),
  z
    .object({
      ...metadata,
      kind: z.literal('stage-setup'),
      defaults: configurationSchema,
      stages: z.partialRecord(
        z.enum(['1', '2', '4', '5', '6']),
        z.union([z.literal('inherit'), configurationSchema])
      )
    })
    .strict()
]);
export type PortableConfiguration = z.infer<typeof portableConfigurationSchema>;
export function parseConfiguration(text: string): PortableConfiguration {
  if (new TextEncoder().encode(text).length > MAX_CONFIGURATION_BYTES)
    throw new Error('Configuration files must be 256 KiB or smaller.');
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('This file is not valid JSON.');
  }
  const parsed = portableConfigurationSchema.safeParse(raw);
  if (!parsed.success)
    throw new Error(
      'Unsupported or invalid model configuration. Use schema version 1; include only model settings, with no credentials or exercise data.'
    );
  return parsed.data;
}
export function exportConfiguration(
  p: ModelPreferences,
  kind: 'panel' | 'stage-setup',
  scope = 'default'
): PortableConfiguration {
  const meta = {
    format: 'scenario-designer-models' as const,
    schemaVersion: 1 as const,
    id: `personal-${kind}`,
    revision: 1,
    name: kind === 'panel' ? 'My model panel' : 'My stage setup',
    description: 'Exported from Scenario Designer.'
  };
  // Parse is an allowlist boundary: never spread an exercise into a portable file.
  return portableConfigurationSchema.parse(
    kind === 'panel'
      ? { ...meta, kind, configuration: resolveModelConfiguration(p, scope) }
      : {
          ...meta,
          kind,
          defaults: resolveModelConfiguration(p),
          stages: Object.fromEntries(
            aiModelStages.map((stage) => {
              const key = String(stage);
              // Preserve partial inheritance rather than pretending it was a live link to this library entry.
              const custom = [
                p.overrides,
                p.modelModeOverrides,
                p.stageReasoningEfforts ?? {},
                p.stageEffortInheritance ?? {},
                p.fusionOverrides ?? {}
              ].some(
                (values) =>
                  Object.hasOwn(values, key) || (key === '6' && Object.hasOwn(values, '7'))
              );
              return [key, custom ? resolveModelConfiguration(p, key) : 'inherit'];
            })
          )
        }
  );
}
export function configurationForTarget(
  file: PortableConfiguration,
  scope: string
): ModelConfiguration | 'inherit' | undefined {
  return file.kind === 'panel'
    ? file.configuration
    : scope === 'default'
      ? file.defaults
      : file.stages[scope as keyof typeof file.stages];
}
export function applyPortableConfiguration(
  p: ModelPreferences,
  file: PortableConfiguration,
  targets: string[],
  writer?: string
) {
  // Prepare every target first so a bad writing choice cannot partially mutate an exercise.
  const prepared = [...new Set(targets)].map((scope) => {
    if (scope !== 'default' && !aiModelStages.map(String).includes(scope))
      throw new Error('Unknown configuration target.');
    const config = configurationForTarget(file, scope);
    if (config === undefined || config === 'inherit') return { scope, config };
    const next = configurationSchema.parse(config);
    if (scope === '6' && next.mode === 'individual' && file.kind === 'panel') {
      if (next.models.length > 1 && (!writer || !next.models.includes(writer)))
        throw new Error('Choose a writing model from this panel.');
      next.writer = next.models.length === 1 ? next.models[0] : writer!;
    }
    return { scope, config: next };
  });
  for (const { scope, config } of prepared) {
    if (config === undefined) continue;
    if (config === 'inherit') resetStageModels(p, scope);
    else assignConfiguration(p, scope, config);
    (p.configurationProvenance ??= {})[scope] = {
      id: file.id,
      revision: file.revision,
      name: file.name,
      appliedAt: new Date().toISOString()
    };
  }
}
