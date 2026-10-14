/// <reference types="@figma/plugin-typings" />
import { parseFigmaCommands, type FigmaCommand, type FigmaProps } from '../src/lib/figma-contract';

type Outcome = { status: 'applied' | 'failed' | 'uncertain'; result: { nodes: { id: string; name: string; type: string }[]; appliedCount: number; detail: string }; preview?: Uint8Array };
const permitted = ['FRAME','TEXT','RECTANGLE','COMPONENT','INSTANCE','GROUP','ELLIPSE','VECTOR','LINE','POLYGON','STAR'];
function requireScene(node: BaseNode | null): SceneNode {
  if (!node || node.removed || !permitted.includes(node.type)) throw new Error('La capa no existe o no admite esta operación.');
  if ('locked' in node && node.locked) throw new Error('La capa está bloqueada.');
  return node as SceneNode;
}
function checkProps(node: SceneNode, props: FigmaProps) {
  for (const key of Object.keys(props)) {
    const required = key === 'fill' ? 'fills' : key === 'padding' ? 'paddingLeft' : key === 'width' || key === 'height' ? 'resize' : key;
    if (!(required in node)) throw new Error(`La capa ${node.id} no admite ${key}.`);
  }
}
async function fonts(api: PluginAPI, node: SceneNode, props?: FigmaProps) {
  if (node.type !== 'TEXT' || (props?.characters === undefined && props?.fontSize === undefined)) return;
  const names = node.fontName === api.mixed ? node.getRangeAllFontNames(0,node.characters.length) : [node.fontName];
  for (const name of names) await api.loadFontAsync(name);
}
function assign(node: SceneNode, props: FigmaProps) {
  if (props.width !== undefined || props.height !== undefined) (node as RectangleNode).resize(props.width ?? node.width, props.height ?? node.height);
  if (props.fill !== undefined) (node as RectangleNode).fills = [{ type:'SOLID',color:{ r:parseInt(props.fill.slice(1,3),16)/255,g:parseInt(props.fill.slice(3,5),16)/255,b:parseInt(props.fill.slice(5,7),16)/255 } }];
  if (props.padding !== undefined) { const frame = node as FrameNode; frame.paddingLeft=props.padding;frame.paddingRight=props.padding;frame.paddingTop=props.padding;frame.paddingBottom=props.padding; }
  for (const [key,value] of Object.entries(props)) if (!['width','height','fill','padding'].includes(key)) (node as unknown as Record<string,unknown>)[key] = value;
}
export async function applyFigmaJob(api: PluginAPI, job: { id: string; commands: unknown; summary: string }, marker: string): Promise<Outcome> {
  let count=0; const nodes: SceneNode[]=[]; let mutated=false;
  const empty = (status: Outcome['status'],detail:string):Outcome=>({status,result:{nodes:[],appliedCount:0,detail}});
  if (api.root.getSharedPluginData('jetree','bridge') !== marker) return empty('failed','La vinculación pertenece a otro archivo o fue reemplazada.');
  const ledgerKey='job_'+job.id;
  const previous=api.root.getPluginData(ledgerKey);
  if (previous) {
    try { const saved=JSON.parse(previous); if (saved.status==='applied'||saved.status==='failed') return saved as Outcome; }
    catch { /* A partial ledger must never trigger a replay. */ }
    return empty('uncertain','Este cambio ya comenzó en el archivo. Revisalo; no se repetirá.');
  }
  const refs=new Map<string,SceneNode>();
  const lookup=async (id:string) => id.startsWith('$') ? refs.get(id)||null : api.getNodeByIdAsync(id);
  const parent=async(id?:string)=>{
    const node=id?await lookup(id):api.currentPage;
    if (!node || node.removed || !['PAGE','FRAME','COMPONENT','GROUP'].includes(node.type) || !('appendChild' in node)) throw new Error('Contenedor inválido.');
    if ('locked' in node && node.locked) throw new Error('El contenedor está bloqueado.');
    return node as PageNode|FrameNode|ComponentNode|GroupNode;
  };
  try {
    const commands=parseFigmaCommands(job.commands);
    const deadline=Date.now()+60000;
    // Verify all existing targets and fonts before the first canvas mutation.
    for(const command of commands) {
      if (command.nodeId && !command.nodeId.startsWith('$')) {
        const node=requireScene(await lookup(command.nodeId));
        if (command.expected?.name !== undefined && node.name !== command.expected.name) throw new Error('La capa cambió desde que se preparó el borrador.');
        if (command.expected?.characters !== undefined && (node.type!=='TEXT'||node.characters!==command.expected.characters)) throw new Error('El texto cambió desde que se preparó el borrador.');
        if (command.props) {checkProps(node,command.props);await fonts(api,node,command.props);}
      }
      if(command.parentId&&!command.parentId.startsWith('$')) await parent(command.parentId);
      if(command.componentId&&!command.componentId.startsWith('$')) {const component=await lookup(command.componentId);if(component?.type!=='COMPONENT')throw new Error('El componente no existe.');}
      if(command.op==='create_text') await api.loadFontAsync({family:'Inter',style:'Regular'});
      if(Date.now()>deadline)throw new Error('La preparación excedió el tiempo permitido.');
    }
    api.root.setPluginData(ledgerKey,JSON.stringify({status:'running'}));
    api.commitUndo();
    for(const command of commands) {
      if(Date.now()>deadline)throw new Error('La edición excedió el tiempo permitido.');
      let node:SceneNode;
      if(command.op.startsWith('create_')) {
        const container=await parent(command.parentId);
        const component=command.op==='create_instance'?await lookup(command.componentId!):null;
        if(command.op==='create_instance'&&component?.type!=='COMPONENT')throw new Error('Componente inválido.');
        mutated=true;
        node=command.op==='create_frame'?api.createFrame():command.op==='create_text'?api.createText():command.op==='create_rectangle'?api.createRectangle():command.op==='create_component'?api.createComponent():(component as ComponentNode).createInstance();
        if(node.type==='TEXT')node.fontName={family:'Inter',style:'Regular'};
        container.appendChild(node);
      } else {
        node=requireScene(await lookup(command.nodeId!));
        if(command.expected?.name!==undefined&&node.name!==command.expected.name)throw new Error('La capa cambió durante la ejecución.');
        if(command.expected?.characters!==undefined&&(node.type!=='TEXT'||node.characters!==command.expected.characters))throw new Error('El texto cambió durante la ejecución.');
        if(command.op==='delete_node'){mutated=true;node.remove();count++;continue;}
        if(command.op==='move_node') {
          const container=await parent(command.parentId);
          let ancestor:BaseNode|null=container;
          while(ancestor){if(ancestor.id===node.id)throw new Error('No se puede mover una capa dentro de sí misma.');ancestor=ancestor.parent;}
          mutated=true;container.appendChild(node);
        }
        if(command.op==='duplicate_node'){mutated=true;node=node.clone();if(command.parentId)(await parent(command.parentId)).appendChild(node);}
      }
      if(command.props){checkProps(node,command.props);await fonts(api,node,command.props);mutated=true;assign(node,command.props);}
      if(command.ref)refs.set(command.ref,node);
      nodes.push(node);count++;
    }
    api.commitUndo();
    const live=nodes.filter(node=>!node.removed);
    const result:Outcome={status:'applied',result:{nodes:live.map(node=>({id:node.id,name:node.name,type:node.type})),appliedCount:count,detail:'Cambios aplicados. Podés usar Deshacer en Figma.'}};
    // Persist the outcome before export/network delivery. Retries only report it.
    api.root.setPluginData(ledgerKey,JSON.stringify(result));
    const preview=live.find(node=>node.type==='FRAME'||node.type==='COMPONENT')||live[0];
    if(preview&&preview.width>0&&preview.height/preview.width<8) {
      try {const bytes=await preview.exportAsync({format:'PNG',constraint:{type:'WIDTH',value:512}});if(bytes.length<=1000000)result.preview=bytes;}catch{/* The canvas result remains successful if export fails. */}
    }
    if(live.length)api.viewport.scrollAndZoomIntoView(live.slice(0,10));
    return result;
  } catch(error) {
    if(mutated)api.commitUndo();
    const outcome:Outcome={status:mutated?'uncertain':'failed',result:{nodes:nodes.filter(node=>!node.removed).map(node=>({id:node.id,name:node.name,type:node.type})),appliedCount:count,detail:error instanceof Error?error.message.slice(0,500):'No se pudo completar el cambio.'}};
    api.root.setPluginData(ledgerKey,JSON.stringify(outcome));return outcome;
  }
}
