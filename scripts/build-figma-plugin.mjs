import { build } from 'esbuild';
import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
const output='public/figma-plugin';
await mkdir(output,{recursive:true});
await build({entryPoints:['figma-plugin/code.ts'],outfile:output+'/code.js',bundle:true,format:'iife',target:'es2020',legalComments:'none'});
await Promise.all(['manifest.json','ui.html'].map(name=>copyFile('figma-plugin/'+name,output+'/'+name)));
// Store-only ZIP with three small files; no archive dependency or shell tool.
function crc32(bytes) { let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return(crc^0xffffffff)>>>0; }
const chunks=[];const directory=[];let offset=0;
for(const name of ['manifest.json','code.js','ui.html']) {
  const bytes=await readFile(output+'/'+name);const filename=Buffer.from(name);const crc=crc32(bytes);
  const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt32LE(crc,14);local.writeUInt32LE(bytes.length,18);local.writeUInt32LE(bytes.length,22);local.writeUInt16LE(filename.length,26);
  const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt32LE(crc,16);central.writeUInt32LE(bytes.length,20);central.writeUInt32LE(bytes.length,24);central.writeUInt16LE(filename.length,28);central.writeUInt32LE(offset,42);
  chunks.push(local,filename,bytes);directory.push(central,filename);offset+=local.length+filename.length+bytes.length;
}
const dir=Buffer.concat(directory);const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(3,8);end.writeUInt16LE(3,10);end.writeUInt32LE(dir.length,12);end.writeUInt32LE(offset,16);
await writeFile(output+'/jetree-figma.zip',Buffer.concat([...chunks,dir,end]));
