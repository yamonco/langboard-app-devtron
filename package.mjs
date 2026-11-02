import { parseArgs } from 'node:util';
import { packagePanelTemplate } from '@langboard/app-server/packaging';
import { configuration, declaration } from './server.mjs';

const { values, positionals } = parseArgs({ allowPositionals: true, options: {
  'workflow-cards': { type: 'boolean', default: false },
  'publish-signals': { type: 'boolean', default: false },
} });
if (positionals.length > 1) throw new Error('Only one output path is supported');
const profile = { workflowCards: values['workflow-cards'], publishSignals: values['publish-signals'], interactions: values.interactions || false };
if ((profile.workflowCards || profile.publishSignals) && !process.env.PUBLIC_URL) throw new Error('Set PUBLIC_URL to the separately deployed app service before packaging optional capabilities');
const config = configuration({ PUBLIC_URL: process.env.PUBLIC_URL || 'https://package.example.invalid', HOST_ORIGIN: 'https://host.example.invalid' });
console.log(await packagePanelTemplate({ declaration: declaration(config, profile), output: positionals[0], pythonSdk: 'vendor/langboard_sdk-0.2.37-py3-none-any.whl' }));
