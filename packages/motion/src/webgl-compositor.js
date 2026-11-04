const contexts=new WeakMap();
let lutPromise;
const vertex=`#version 300 es
in vec2 aPosition;
out vec2 vUv;
void main(){vUv=aPosition*.5+.5;gl_Position=vec4(aPosition,0.,1.);}`;
const fragment=`#version 300 es
precision highp float;
precision highp sampler3D;
uniform sampler2D uSource;
uniform sampler3D uLut;
uniform vec2 uPixel;
uniform float uDepth;
uniform float uLight;
uniform bool uUseLut;
in vec2 vUv;
out vec4 outColor;
void main(){
  float distanceFromFocus=length((vUv-vec2(.5,.5))*vec2(1.,.8));
  float radius=uDepth*smoothstep(.12,.62,distanceFromFocus)*8.;
  vec3 color=texture(uSource,vUv).rgb*4.;
  color+=texture(uSource,vUv+uPixel*radius*vec2(1.,0.)).rgb;
  color+=texture(uSource,vUv+uPixel*radius*vec2(-1.,0.)).rgb;
  color+=texture(uSource,vUv+uPixel*radius*vec2(0.,1.)).rgb;
  color+=texture(uSource,vUv+uPixel*radius*vec2(0.,-1.)).rgb;
  color+=texture(uSource,vUv+uPixel*radius*vec2(.7,.7)).rgb;
  color+=texture(uSource,vUv+uPixel*radius*vec2(-.7,-.7)).rgb;
  color/=10.;
  float bloom=exp(-pow(distanceFromFocus*3.,2.))*uLight*.12;
  color+=vec3(.64,.48,.82)*bloom;
  if(uUseLut)color=texture(uLut,clamp(color,0.,1.)).rgb;
  outColor=vec4(color,1.);
}`;

function compile(gl,type,source){
  const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);
  if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(`WebGL shader: ${gl.getShaderInfoLog(shader)}`);
  return shader;
}
function createContext(canvas){
  const surface=document.createElement('canvas');
  const gl=surface.getContext('webgl2',{alpha:false,antialias:false,preserveDrawingBuffer:true});
  if(!gl)throw new Error('WebGL2 is required for this compositor look.');
  const program=gl.createProgram();gl.attachShader(program,compile(gl,gl.VERTEX_SHADER,vertex));gl.attachShader(program,compile(gl,gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(`WebGL program: ${gl.getProgramInfoLog(program)}`);
  gl.useProgram(program);
  const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
  const position=gl.getAttribLocation(program,'aPosition');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
  const sourceTexture=gl.createTexture();gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,sourceTexture);
  for(const key of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,key,gl.LINEAR);
  for(const key of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,key,gl.CLAMP_TO_EDGE);
  gl.uniform1i(gl.getUniformLocation(program,'uSource'),0);
  const state={surface,gl,program,sourceTexture,lutTexture:null};contexts.set(canvas,state);return state;
}
async function loadCube(){
  if(!lutPromise)lutPromise=fetch('/vendor/looks/studio-cinematic.cube').then(async response=>{
    if(!response.ok)throw new Error('Could not load cinematic LUT.');
    const lines=(await response.text()).split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
    const size=Number(lines.find(line=>line.startsWith('LUT_3D_SIZE'))?.split(/\s+/)[1]);
    const values=lines.filter(line=>/^[\d.+-]/.test(line)).flatMap(line=>line.split(/\s+/).map(Number));
    if(!Number.isInteger(size)||size<2||values.length!==size**3*3||values.some(value=>!Number.isFinite(value)))throw new Error('Cinematic LUT is malformed.');
    const data=new Uint8Array(size**3*4);
    for(let i=0;i<size**3;i++){for(let channel=0;channel<3;channel++)data[i*4+channel]=Math.round(Math.max(0,Math.min(1,values[i*3+channel]))*255);data[i*4+3]=255;}
    return {size,data};
  });
  return lutPromise;
}

export async function applyWebglLook(canvas,config){
  if(!config||config.look==='neutral'&&!(config.depthOfField||config.light))return;
  const state=contexts.get(canvas)??createContext(canvas),{gl,surface,program}=state;
  surface.width=canvas.width;surface.height=canvas.height;
  gl.viewport(0,0,surface.width,surface.height);gl.useProgram(program);
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,state.sourceTexture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,canvas);
  {const error=gl.getError();if(error!==gl.NO_ERROR)throw new Error(`WebGL source upload failed (${error}).`);}
  const useLut=config.look==='cinematic';
  if(useLut&&!state.lutTexture){
    const {size,data}=await loadCube();state.lutTexture=gl.createTexture();gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_3D,state.lutTexture);
    gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    for(const key of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T,gl.TEXTURE_WRAP_R])gl.texParameteri(gl.TEXTURE_3D,key,gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
    gl.texImage3D(gl.TEXTURE_3D,0,gl.RGBA8,size,size,size,0,gl.RGBA,gl.UNSIGNED_BYTE,data);
    {const error=gl.getError();if(error!==gl.NO_ERROR)throw new Error(`WebGL LUT upload failed (${error}).`);}
  }
  if(useLut){gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_3D,state.lutTexture);}
  gl.uniform1i(gl.getUniformLocation(program,'uLut'),1);
  gl.uniform1i(gl.getUniformLocation(program,'uUseLut'),useLut?1:0);
  gl.uniform2f(gl.getUniformLocation(program,'uPixel'),1/canvas.width,1/canvas.height);
  gl.uniform1f(gl.getUniformLocation(program,'uDepth'),config.depthOfField??0);
  gl.uniform1f(gl.getUniformLocation(program,'uLight'),config.light??0);
  gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
  const error=gl.getError();if(error!==gl.NO_ERROR)throw new Error(`WebGL compositor failed (${error}).`);
  const context=canvas.getContext('2d');
  context.save();
  context.setTransform(1,0,0,1,0,0);
  context.clearRect(0,0,canvas.width,canvas.height);
  context.drawImage(surface,0,0);
  context.restore();
}
