import test from 'node:test';
import assert from 'node:assert/strict';
import { assertRedistributableMedia } from '../packages/desktop/media-license.js';
test('desktop media audit rejects explicitly nonredistributable or uninspected binaries',()=>{
  assert.throws(()=>assertRedistributableMedia('ffmpeg',{buildConfiguration:'--enable-gpl --enable-nonfree',licenseOutput:'GPL'}),/nonredistributable/);
  assert.throws(()=>assertRedistributableMedia('ffmpeg',{buildConfiguration:'configuration',licenseOutput:'This version of ffmpeg has nonfree parts compiled in. Therefore it is not legally redistributable.'}),/nonredistributable/);
  assert.throws(()=>assertRedistributableMedia('ffprobe',{}),/missing/);
  assert.doesNotThrow(()=>assertRedistributableMedia('ffmpeg',{buildConfiguration:'--enable-gpl',licenseOutput:'GNU General Public License version 3'}));
});
