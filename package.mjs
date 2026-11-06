import { parseArgs } from 'node:util';
import { packagePanelTemplate } from '@langboard/app-server/packaging';
import { configuration, declaration } from './server.mjs';

const { values, positionals } = parseArgs({ allowPositionals: true, options: {
  'workflow-cards': { type: 'boolean', default: false },
  'publish-signals': { type: 'boolean', default: false },
} });
if (positionals.length > 1) throw new Error('Only one output path is supported');
const profile = { workflowCards: values['workflow-cards'], publishSignals: values['publish-signals'] };
if (profile.workflowCards && !process.env.PUBLIC_URL) throw new Error('Set PUBLIC_URL to the separately deployed app service before packaging optional capabilities');
const config = configuration({ PUBLIC_URL: process.env.PUBLIC_URL || 'https://package.example.invalid', HOST_ORIGIN: 'https://host.example.invalid' });
const manifest = declaration(config, profile);
// Host-served packages need no tenant-specific external data origin.
if (!process.env.PUBLIC_URL && manifest.trust) manifest.trust.data_origins = [];
console.log(await packagePanelTemplate({ declaration: manifest, output: positionals[0], pythonSdk: 'vendor/langboard_sdk-0.2.37-py3-none-any.whl' }));
