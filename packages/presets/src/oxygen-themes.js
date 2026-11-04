/**
 * Adapted from WSO2 Oxygen UI, copyright 2025–2026 WSO2 LLC, Apache-2.0.
 * Pinned originals and license: references/oxygen/; see themes/README.md.
 * Canvas tokens only: no runtime MUI dependency or remote fonts.
 */
const font='"Harness Inter", system-ui, sans-serif';
const radial=(x,y,stops)=>({x,y,stops});
const rgba=(rgb,alpha)=>`rgba(${rgb}, ${alpha})`;

function acrylicLayers(mode,purple){
 const dark=mode==='dark';
 const first=purple?(dark?'85, 103, 213':'100, 108, 255'):'255, 116, 0';
 const second=purple?'113, 85, 213':(dark?'132, 40, 0':'74, 41, 165');
 return [
  radial(.65,.3,[[.1,rgba(first,purple?(dark?.2:.12):(dark?.13:.1))],[dark?.6:.4,rgba(first,0)]]),
  radial(.15,.5,[[.01,rgba(second,purple?(dark?.25:.15):(dark?.18:.1))],[.4,rgba(second,0)],[.7,rgba(second,0)]]),
  radial(.5,.5,[[0,dark?'rgba(0, 0, 0, .6)':'rgba(255, 255, 255, .6)'],[1,dark?'#000000':'#f5f5f5']]),
 ];
}

export const OXYGEN_THEMES={};
for(const mode of ['light','dark']){
 const dark=mode==='dark';
 for(const family of ['orange','purple']){
  const purple=family==='purple',id=`oxygen-acrylic-${family}-${mode}`;
  OXYGEN_THEMES[id]={id,label:`Oxygen · Acrylic ${purple?'Purple':'Orange'} · ${mode}`,mode,font,
   background:dark?'#000000':'#f5f5f5',surface:dark?'#000000c5':'#ffffffc5',
   text:dark?'#efefef':'#40404B',muted:dark?'#D0D3E2':'#40404B',
   accent:purple?'#646cff':(dark?'#F87643':'#fa7b3f'),border:dark?'#ffffff16':'#00000012',particle:purple?'#646cff':'#F87643',
   backgroundBlend:dark?'screen':'source-over',backgroundLayers:acrylicLayers(mode,purple)};
 }
 for(const family of ['indigo','gray']){
  const id=`oxygen-pale-${family}-${mode}`,indigo=family==='indigo';
  OXYGEN_THEMES[id]={id,label:`Oxygen · Pale ${indigo?'Indigo':'Gray'} · ${mode}`,mode,font,
   background:dark?'#121212':'#F5F5F5',surface:dark?'#1E1E1E':'#FFFFFF',text:dark?'#FFFFFF':'#212121',muted:dark?'#B0B0B0':'#757575',
   accent:indigo?(dark?'#7785dd':'#5567d5'):(dark?'#E0E0E0':'#212121'),border:dark?'#424242':'#E0E0E0',particle:dark?'#B0B0B0':'#757575',backgroundLayers:[]};
 }
 const id=`oxygen-wso2-${mode}`;
 OXYGEN_THEMES[id]={id,label:`Oxygen · Default · ${mode}`,mode,font,
  background:dark?'#0f172a':'#ffffff',surface:dark?'#00000026':'#ffffffc5',text:dark?'#FFFFFF':'#181818',muted:dark?'#FFFFFF':'#181818',
  accent:'#FF7300',border:dark?'#ffffff26':'#00000012',particle:'#5CD1FF',backgroundBlend:dark?'screen':'source-over',
  backgroundLayers:dark?[
   radial(.5,.25,[[0,'#233248'],[.4,'rgba(153, 170, 205, 0)']]),
   radial(5,.9,[[0,'#3b4e69'],[.2,'rgba(153, 170, 205, 0)']]),
   radial(1,1.25,[[0,'#3b4e69'],[.2,'rgba(153, 170, 205, 0)']]),
   {color:'#060812'},
  ]:[
   radial(.65,.3,[[.05,'rgba(30, 64, 175, .08)'],[.6,'rgba(0, 0, 0, 0)']]),
   radial(.15,.5,[[.01,'rgba(255, 255, 255, .08)'],[.4,'rgba(0, 0, 0, 0)'],[.7,'rgba(0, 0, 0, 0)']]),
   {color:'#ffffff'},
  ]};
}
