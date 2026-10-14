/// <reference types="@figma/plugin-typings" />
import { applyFigmaJob } from './engine';
figma.showUI(__html__,{width:380,height:540});
let executing=false;
figma.ui.onmessage=async(message:Record<string,any>)=>{
  if(message.type==='bind') {
    if(typeof message.marker!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(message.marker))return;
    figma.root.setSharedPluginData('jetree','bridge',message.marker);
    figma.ui.postMessage({type:'bound'});
  }
  if(message.type==='apply'&&!executing) {
    executing=true;
    try {
      const outcome=await applyFigmaJob(figma,message.job,message.marker);
      figma.ui.postMessage({type:'outcome',jobId:message.job.id,...outcome,preview:outcome.preview?Array.from(outcome.preview):undefined});
    } finally {executing=false;}
  }
};
