import {
  FUSION_MODEL,
  fusionLabel,
  fusionSchema,
  type ModelConfiguration
} from '$lib/domain/model-settings';
import { supportedEfforts, type Model } from './models';

/** Validation is shared by setup, imports, request preview and dispatch. No network calls. */
export function configurationIssues(
  config: ModelConfiguration,
  catalogue: Model[],
  includeWriter = false
): string[] {
  const issues: string[] = [];
  const byId = new Map(catalogue.map((model) => [model.id, model]));
  const ids =
    config.mode === 'fusion'
      ? [
          FUSION_MODEL,
          ...(config.fusion.type === 'custom' ? config.fusion.models : []),
          ...(config.fusion.analyst ? [config.fusion.analyst] : [])
        ]
      : [...config.models, ...(includeWriter ? [config.writer] : [])];
  if (!ids.length) issues.push('Choose at least one model.');
  if (
    config.mode === 'individual' &&
    ids.some((id) => id.replace(/^~/, '').startsWith('openrouter/fusion'))
  )
    issues.push('Use Fusion mode to run Fusion.');
  if (new Set(config.models).size !== config.models.length)
    issues.push('Choose each model only once.');
  for (const id of new Set(ids)) {
    const model = byId.get(id);
    if (!model) {
      issues.push(`${id} is not available for this connection.`);
      continue;
    }
    const endpoint = id === FUSION_MODEL ? '/api/v1/responses' : '/api/v1/chat/completions';
    if (model.endpoints && !model.endpoints.includes(endpoint))
      issues.push(`${id} does not support the required request endpoint.`);
    if (model.architecture && !model.architecture.output_modalities.includes('text'))
      issues.push(`${id} cannot produce text.`);
    const effort = config.mode === 'fusion' ? config.fusion.effort : config.efforts[id];
    if (
      id !== FUSION_MODEL &&
      effort &&
      effort !== 'provider-default' &&
      !supportedEfforts(model).includes(effort)
    )
      issues.push(
        `${id} does not advertise ${effort} thinking effort. Choose a supported effort${config.mode === 'fusion' ? ' or Provider default' : ''}.`
      );
  }
  if (config.mode === 'fusion' && !fusionSchema.safeParse(config.fusion).success)
    issues.push(
      'Fusion needs 1–8 distinct individual members and a supported preset/analyst configuration.'
    );
  return [...new Set(issues)];
}

export function configurationSummary(
  config: ModelConfiguration,
  name: (id: string) => string = (id) => id
): string {
  return config.mode === 'fusion'
    ? `${fusionLabel(config.fusion)}${config.fusion.type === 'custom' ? `: ${config.fusion.models.map(name).join(', ')}` : ''} · ${config.fusion.effort === 'provider-default' ? 'provider-default' : config.fusion.effort} effort${config.fusion.analyst ? ` · analyst ${name(config.fusion.analyst)}` : ' · provider-selected analyst'}`
    : config.models
        .map((id) => `${name(id)}${config.efforts[id] ? ` (${config.efforts[id]})` : ''}`)
        .join(', ');
}
