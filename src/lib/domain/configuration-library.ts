import manifest from '../../../model-configurations/manifest.json';
import { portableConfigurationSchema } from './model-configurations';
const files = import.meta.glob('../../../model-configurations/*.configuration.json', {
  eager: true,
  import: 'default'
});
export const configurationLibrary = manifest.map((filename) => {
  const file = files[`../../../model-configurations/${filename}`];
  return portableConfigurationSchema.parse(file);
});
if (new Set(configurationLibrary.map((file) => file.id)).size !== configurationLibrary.length)
  throw new Error('Configuration library IDs must be unique.');
