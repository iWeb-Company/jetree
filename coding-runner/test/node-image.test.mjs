import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
test('registry throttling falls back to the identical digest and all failures stop the build',{skip:process.platform==='win32'},async t=>{
 const root=await mkdtemp(path.join(tmpdir(),'jetree-registry-test-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const docker=path.join(root,'docker');
 await writeFile(docker,'#!/bin/sh\ncase "$2" in public.ecr.aws/*) echo "429 Too Many Requests"; exit 1;; docker.io/*) echo "pulled pinned image"; exit 0;; *) exit 2;; esac\n',{mode:0o700});
 const script=path.resolve('scripts/resolve-node-image.mjs');
 const run=()=>spawnSync(process.execPath,[script],{env:{...process.env,PATH:root},encoding:'utf8'});
 const result=run();assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/^NODE_IMAGE=docker.io\/library\/node@sha256:[a-f0-9]{64}\n$/);assert.ok(!result.stdout.includes('429'));
 await writeFile(docker,'#!/bin/sh\nexit 1\n',{mode:0o700});
 const failed=run();assert.notEqual(failed.status,0);assert.equal(failed.stdout,'');
});
