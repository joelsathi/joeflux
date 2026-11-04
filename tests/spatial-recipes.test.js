import test from 'node:test';
import assert from 'node:assert/strict';

test('handoff uses separate sources and exact flat full-screen endpoints',async()=>{
  const {evaluateRecipe}=await import('../packages/presets/src/recipes.js');
  const scene={preset:'screen-handoff',durationFrames:144,params:{outgoingAsset:'before',incomingAsset:'after'}};
  const first=evaluateRecipe(scene,0),last=evaluateRecipe(scene,143),hold=evaluateRecipe(scene,80);
  assert.equal(first.planes[0].assetId,'before');
  assert.equal(first.planes[0].pose.z,0);assert.equal(first.planes[0].pose.radius,0);
  assert.equal(last.planes.at(-1).assetId,'after');assert.equal(last.planes.at(-1).pose.z,0);
  assert.equal(last.planes.at(-1).pose.radius,0);assert.equal(last.captionAlpha,0);
  assert.equal(hold.captionAlpha,1);assert.ok(hold.planes[0].pose.z<-1000);
});
test('product reveal moves continuously through its old 78 percent discontinuity',async()=>{
  const {evaluateRecipe}=await import('../packages/presets/src/recipes.js');
  const scene={preset:'product-reveal',durationFrames:144,params:{asset:'product'}};
  const a=evaluateRecipe(scene,111),b=evaluateRecipe(scene,112);
  assert.ok(Math.abs(a.planes[0].rect.width-b.planes[0].rect.width)<100);
  assert.equal(evaluateRecipe(scene,143).captionAlpha,0);
});
test('media aspect ratio and perspective depth survive plane styling',async()=>{
  const {fitMediaRect,planeTransform}=await import('../packages/motion/src/spatial-stage.js');
  const rect=fitMediaRect({x:0,y:0,width:1100,height:850},1920,1080);
  assert.ok(Math.abs(rect.width/rect.height-16/9)<1e-9);
  assert.match(planeTransform({z:-1550,rotateY:14}),/translate3d\(0px, 0px, -1550px\)/);
  assert.match(planeTransform({rotateY:-14}),/rotateY\(-14deg\)/);
});
test('intro recipes have distinct phases and masks land on the incoming screen',async()=>{
  const {evaluateRecipe}=await import('../packages/presets/src/recipes.js');
  const scene={durationFrames:192,params:{asset:'product',outgoingAsset:'before',incomingAsset:'after'}};
  assert.equal(evaluateRecipe({...scene,preset:'problem-to-product'},0).phase,'problem');
  assert.equal(evaluateRecipe({...scene,preset:'problem-to-product'},120).phase,'benefit');
  assert.equal(evaluateRecipe({...scene,preset:'problem-to-product'},191).planes[0].assetId,'product');
  const mask=evaluateRecipe({...scene,preset:'accent-mask'},191);
  assert.equal(mask.planes.at(-1).assetId,'after');assert.equal(mask.planes.at(-1).clipRight,0);
});
test('supporting cards have independent depth above the handoff screen',async()=>{
 const {evaluateRecipe}=await import('../packages/presets/src/recipes.js');
 const state=evaluateRecipe({preset:'screen-handoff',durationFrames:144,params:{outgoingAsset:'a',incomingAsset:'b'}},80);
 assert.equal(state.cards.length,3);assert.ok(state.cards.every(card=>card.pose.y<-500&&card.pose.z<-1500&&card.pose.opacity===1));
});
test('problem evidence cards have a readable settled hold',async()=>{
 const {evaluateRecipe}=await import('../packages/presets/src/recipes.js');
 const scene={preset:'problem-to-product',durationFrames:192,params:{items:['Context','Insight','Action']}};
 assert.equal(evaluateRecipe(scene,80).cardsAlpha,1);
});
test('slide and mask use the selected outgoing and incoming source times',async()=>{
 const {evaluateRecipe}=await import('../packages/presets/src/recipes.js');
 for(const preset of ['side-slide','accent-mask']){
  const result=evaluateRecipe({preset,durationFrames:24,params:{outgoingAsset:'a',incomingAsset:'b',outgoingSeconds:2.5,incomingSeconds:.75}},12);
  assert.equal(result.planes[0].sourceSeconds,2.5);assert.equal(result.planes[1].sourceSeconds,.75);
 }
});
