import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { chromium, expect } from '@playwright/test';
import { startPreview } from '../packages/preview-server/src/index.js';
import { browserLaunchOptions } from '../packages/renderer/src/index.js';
import { createProjectTools } from '../packages/tools/src/index.js';

test('a contributed control appears in template preview and stays editable after applying', {timeout:60000}, async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'plugin-fields-'));
 await writeFile(path.join(root,'project.json'),JSON.stringify({version:1,name:'Contributed controls',output:{width:640,height:360,fps:24,audio:false},assets:{},scenes:[]}));
 const tools=createProjectTools(root);
 await tools.call('plugin_install',{directory:new URL('../fixtures/plugins/proof-pack/',import.meta.url).pathname});
 const server=await startPreview(root,0), browser=await chromium.launch(browserLaunchOptions());
 try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}}); await page.goto(server.url);
  await page.getByRole('button',{name:'Add a shot',exact:true}).click();
  await page.getByRole('menuitem',{name:/Browse templates/}).click();
  await page.getByRole('button',{name:/Choose Proof reveal template/}).click();
  await page.getByLabel('Accent color',{exact:true}).fill('#ff5500'); await page.getByLabel('Accent color',{exact:true}).blur();
  await page.getByRole('button',{name:'Add shot',exact:true}).last().click();
  await page.waitForFunction(()=>document.querySelector('.stage canvas')?.dataset.renderedScene);
  assert.equal((await tools.call('project_get')).scenes[0].pluginOptions.color,'#ff5500');
  await expect(page.getByRole('dialog')).toBeHidden();
  const inspector = page.getByRole('complementary',{name:'Inspector'});
  await inspector.getByLabel('Accent color',{exact:true}).fill('#abcdef'); await inspector.getByLabel('Accent color',{exact:true}).blur();
  await expect.poll(async () => (await tools.call('project_get')).scenes[0].pluginOptions.color).toBe('#abcdef');
 }finally{await browser.close();await server.close();}
});
