import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);

test('desktop allowlist includes runtime knowledge, optional interview source and their licenses',()=>{
  const {ignore}=require('../forge.config.cjs').packagerConfig;
  for (const file of ['LICENSE','library/knowledge/seed.js','vendor/mattpocock-skills/LICENSE','vendor/mattpocock-skills/NOTICE.md','vendor/mattpocock-skills/grilling/SKILL.md','packages/plugins/index.d.ts']) assert.equal(ignore(`/${file}`),false,file);
  for (const file of ['projects/personal/project.json','.runtime/history.json','vendor/unreviewed/index.js']) assert.equal(ignore(`/${file}`),true,file);
});
