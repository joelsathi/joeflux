let state;

function shader(gl,type,source){
  const value=gl.createShader(type);gl.shaderSource(value,source);gl.compileShader(value);
  if(!gl.getShaderParameter(value,gl.COMPILE_STATUS))throw new Error(`WebGL motion blur shader: ${gl.getShaderInfoLog(value)}`);
  return value;
}

function createAccumulator(){
  const canvas=document.createElement('canvas');
  const gl=canvas.getContext('webgl2',{alpha:false,antialias:false,preserveDrawingBuffer:true});
  if(!gl)throw new Error('WebGL2 is required for GPU motion blur.');
  const program=gl.createProgram();
  gl.attachShader(program,shader(gl,gl.VERTEX_SHADER,`#version 300 es
in vec2 aPosition;
out vec2 vUv;
void main(){vUv=aPosition*.5+.5;gl_Position=vec4(aPosition,0.,1.);}`));
  gl.attachShader(program,shader(gl,gl.FRAGMENT_SHADER,`#version 300 es
precision highp float;
uniform sampler2D uFrame;
uniform float uWeight;
in vec2 vUv;
out vec4 outColor;
void main(){outColor=texture(uFrame,vec2(vUv.x,1.-vUv.y))*uWeight;}`));
  gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(`WebGL motion blur program: ${gl.getProgramInfoLog(program)}`);
  gl.useProgram(program);
  const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
  const location=gl.getAttribLocation(program,'aPosition');gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,2,gl.FLOAT,false,0,0);
  const texture=gl.createTexture();gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);
  for(const key of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,key,gl.LINEAR);
  for(const key of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,key,gl.CLAMP_TO_EDGE);
  gl.uniform1i(gl.getUniformLocation(program,'uFrame'),0);
  return {canvas,gl,program,texture};
}

export async function accumulateFramesWebgl(encodedFrames){
  if(!Array.isArray(encodedFrames)||encodedFrames.length<2)throw new Error('GPU motion blur needs at least two subframes.');
  const bitmaps=await Promise.all(encodedFrames.map(async encoded=>createImageBitmap(await (await fetch(`data:image/png;base64,${encoded}`)).blob())));
  try{
    const width=bitmaps[0].width,height=bitmaps[0].height;
    if(bitmaps.some(bitmap=>bitmap.width!==width||bitmap.height!==height))throw new Error('Motion blur subframes have different sizes.');
    state??=createAccumulator();
    const {canvas,gl,program,texture}=state;
    if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
    gl.viewport(0,0,width,height);gl.useProgram(program);
    gl.clearColor(0,0,0,1);gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE);
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.uniform1f(gl.getUniformLocation(program,'uWeight'),1/bitmaps.length);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
    for(const bitmap of bitmaps){gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,bitmap);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);}
    gl.disable(gl.BLEND);
    const error=gl.getError();if(error!==gl.NO_ERROR)throw new Error(`WebGL motion blur failed (${error}).`);
    return canvas.toDataURL('image/png').split(',')[1];
  }finally{for(const bitmap of bitmaps)bitmap.close();}
}
