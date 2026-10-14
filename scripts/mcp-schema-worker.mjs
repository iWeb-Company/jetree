import {parentPort,workerData} from 'node:worker_threads';
import Ajv from 'ajv';
import Ajv2020 from 'ajv/dist/2020.js';
try {
  const SchemaValidator=String(workerData.schema.$schema||'').includes('draft-07')?Ajv:Ajv2020;
  const validator=new SchemaValidator({strict:false,validateFormats:false,allErrors:false,ownProperties:true,code:{optimize:false}}).compile(workerData.schema);
  parentPort.postMessage(validator(workerData.value)===true);
} catch { parentPort.postMessage(false); }
