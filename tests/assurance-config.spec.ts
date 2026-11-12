import {Ajv} from 'ajv';
import {expect,it} from 'vitest';
import {instanceConfigJsonSchema,parsePluginConfig} from '../src/config/schema.js';
it('admits the same opt-in acceptance configuration in the host JSON schema and runtime parser',()=>{
 const config={features:{assurance:true},assurance:{lens:true,workcell:true,dockerHost:'unix:///tmp/docker.sock'},acceptancePolicies:[{projectId:'project',issueId:'parent',mode:'human-approval',allowWaiver:true,observeHandoffs:true,checks:[{kind:'lens',suite:'browser.json',issueId:'child'}]}]};
 expect(new Ajv({strict:false}).compile(instanceConfigJsonSchema)(config)).toBe(true);
 expect(parsePluginConfig(config).acceptancePolicies[0]?.checks[0]?.issueId).toBe('child');
});
