import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';

// Mirrors may throttle anonymous runners independently. Every candidate uses
// the same immutable manifest digest; no tag or version fallback is allowed.
const digest=readFileSync(new URL('../Dockerfile',import.meta.url),'utf8').match(/^ARG NODE_IMAGE=[^@\r\n]+@(sha256:[a-f0-9]{64})\r?$/m)?.[1];
const runnerDigest=readFileSync(new URL('../coding-runner/Dockerfile',import.meta.url),'utf8').match(/^ARG NODE_IMAGE=[^@\r\n]+@(sha256:[a-f0-9]{64})\r?$/m)?.[1];
if(!digest||runnerDigest!==digest)throw new Error('Pinned Node digests must match');
for(const repository of ['public.ecr.aws/docker/library/node','docker.io/library/node']){
 const image=repository+'@'+digest;
 try{
  execFileSync('docker',['pull',image],{timeout:180000,stdio:['ignore',2,2]});
  console.log('NODE_IMAGE='+image);process.exit(0);
 }catch{console.error('Pinned Node image unavailable from '+repository+'; trying next registry.');}
}
throw new Error('All registries failed for the pinned Node image');
