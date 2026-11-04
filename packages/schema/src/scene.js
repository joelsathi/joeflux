import {z} from 'zod';
export const EASINGS=['smootherstep','easeInOut','easeIn','easeOut','linear','gentle','snappy','spring'];
export const SCREEN_SHADOWS=['none','soft','deep','floating'],SCREEN_FRAMES=['none','browser-light','browser-dark','window'],LIGHTING_STYLES=['none','spotlight','glow','floor'];
const unit=z.number().min(0).max(1),degrees=z.number().min(-35).max(35),shift=z.number().min(-.5).max(.5);

export const Pose=z.strictObject({x:z.number(),y:z.number(),z:z.number(),rotateX:z.number(),rotateY:z.number(),rotateZ:z.number(),radius:z.number().min(0)}).partial()
 .describe('3D offset of the screen: translate in px of the 1920-wide design space, rotate in degrees, corner radius in px.');
export const Shot=z.strictObject({
 areaId:z.string().min(1).optional().describe('Stable identity of this contiguous area visit; repeated visits use different ids.'),
 at:unit.describe('When the camera arrives: fraction of the scene, 0 = first frame, 1 = last.'),
 focus:z.tuple([unit,unit]).optional().describe('Center of the framed area on the recording, normalized x/y. Omit for the full view.'),
 zoom:z.number().min(1).max(4).optional().describe('Magnification. 1 (default) = full recording, 2 = half its width.'),
 pose:Pose.optional(),
 ease:z.enum(EASINGS).optional().describe('Easing of the move into this shot; defaults to camera.ease.'),
});
export const Camera=z.strictObject({
 shots:z.array(Shot).min(1).refine(shots=>shots.every((shot,i)=>!i||shot.at>=shots[i-1].at),'shots must be in time order'),
 ease:z.enum(EASINGS).optional().describe('Default easing between shots (smootherstep). gentle is a soft sine, snappy a quick quartic, spring settles with a slight overshoot.'),
 flow:z.boolean().optional().describe('true keeps the camera moving through shots it passes on the way (velocity-continuous, never overshooting) instead of easing to a stop at each; easing then shapes only single moves between holds. Holds still pause.'),
 drift:z.number().min(0).max(1).optional().describe('Gentle orbit layered over the whole path: 0 (default) none, 1 = about 6° of sway with a slight push back. Zero at the first and last frame.'),
 move:z.strictObject({preset:z.string(),strength:z.number().optional()}).optional().describe('The ready-made move that produced these shots, if any; cleared when shots are edited directly.'),
}).describe('Camera path over the recording. Two consecutive shots with the same framing hold it.');
export const Screen=z.strictObject({
 asset:z.string().min(1).describe('Asset name from project.json assets.'),
 presentation:z.enum(['fullscreen','studio']).optional().describe('fullscreen (default) fills the frame; studio floats the screen over the backdrop.'),
 backdrop:z.enum(['theme','paper','slate']).optional().describe('Background behind the screen; theme (default) uses the scene theme.'),
 fit:z.enum(['contain','cover']).optional().describe('How the recording fills the screen (contain).'),
 size:z.number().min(.7).max(1.6).optional().describe('Screen scale (1).'),
 tilt:z.tuple([degrees,degrees,degrees]).optional().describe('Screen rotation X/Y/Z in degrees ([0,0,0]).'),
 padding:z.number().min(0).max(.3).optional().describe('Floating (studio) screens: fraction of the frame kept clear on each side (0.13). Larger = smaller screen.'),
 offset:z.tuple([shift,shift]).optional().describe('Floating (studio) screens: shift as a fraction of the frame, [x, y] ([0,0]); positive moves right/down.'),
 radius:z.number().min(0).max(64).optional().describe('Corner radius in px of the 1920-wide design space (22 for floating screens; fullscreen follows the camera pose).'),
 shadow:z.enum(SCREEN_SHADOWS).optional().describe('Shadow under the screen: none, soft (floating default), deep, or floating (lifted high off the backdrop).'),
 frame:z.enum(SCREEN_FRAMES).optional().describe('Device chrome around the recording: none (default), browser-light or browser-dark (title bar with a URL pill), or window (macOS-style title bar).'),
 frameTitle:z.string().max(120).optional().describe('Text in the frame bar: the URL for a browser frame, the title for a window.'),
 lighting:z.strictObject({
  style:z.enum(LIGHTING_STYLES).describe('spotlight = soft light behind the screen, glow = accent-tinted halo, floor = floor gradient with a soft reflection under the screen.'),
  intensity:unit.optional().describe('Strength 0–1 (0.6).'),
 }).optional().describe('Backdrop lighting that follows the screen position (none by default).'),
});
export const MotionBlur=z.strictObject({
 enabled:z.boolean().optional().describe('Defaults to true. Set false to disable blur while retaining samples and shutter.'),
 samples:z.int().min(2).max(16).optional().describe('Sub-frames averaged per output frame (8).'),
 shutter:z.number().min(.1).max(1).optional().describe('Fraction of a frame the shutter stays open (0.5).'),
 accumulator:z.enum(['ffmpeg','webgl']).optional().describe('Use FFmpeg or WebGL2 to accumulate rendered subframes.'),
}).describe('Motion blur at export by averaging sub-frames; preview stays sharp. Works on any scene.');
export const ScreenCaption=z.strictObject({
 text:z.string().min(1).max(120).refine(text=>Boolean(text.trim()),'caption text must not be blank'),
 placement:z.enum(['top','bottom']).optional(),
 animation:z.enum(['line-wipe','scale-pop','word-stagger','caption-over-screen']).optional(),
}).describe('Readable caption over a screen with a frame-driven entry, settled reading hold and exit. caption-over-screen (default) uses glass; other motions use a solid caption plate.');
export const ArtworkLayer=z.strictObject({
 type:z.enum(['svg','lottie']),
 asset:z.string().min(1).describe('Declared SVG or Bodymovin JSON asset.'),
 x:unit,y:unit,width:unit,height:unit,
 startFrame:z.int().min(0).optional(),
 endFrame:z.int().min(1).optional(),
 speed:z.number().min(.1).max(4).optional(),
 opacity:unit.optional(),
}).describe('Artwork positioned in normalized stage coordinates. Lottie seeks by source frame.');
export const Compositor=z.strictObject({
 look:z.enum(['neutral','cinematic']).optional(),
 depthOfField:unit.optional().describe('Radial soft focus toward the frame edges; not optical depth.'),
 light:unit.optional(),
}).describe('WebGL2 look pass over the base canvas (background and built-in copy) with a 3D LUT, radial soft focus and soft center light. Screen media, frames, captions and artwork layers are composited after it and are not graded.');
export const ScreenScene=z.looseObject({
 id:z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
 kind:z.literal('screen'),
 durationFrames:z.int().min(2),
 screen:Screen,
 camera:Camera,
 motionBlur:MotionBlur.optional(),
 caption:ScreenCaption.optional(),
 layers:z.array(ArtworkLayer).max(12).optional(),
 compositor:Compositor.optional(),
});
export const sceneJsonSchema=()=>z.toJSONSchema(ScreenScene);
export function screenSceneErrors(scene){
 const result=ScreenScene.safeParse(scene);
 return result.success?[]:result.error.issues.map(issue=>`${issue.path.join('.')||'scene'}: ${issue.message}`);
}
