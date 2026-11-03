const fs=require('node:fs');

function readBounded(file,limit) {
  const descriptor=fs.openSync(file,'r');
  try {
    const info=fs.fstatSync(descriptor);
    if (!info.isFile() || info.size>limit) throw new Error('Metadata input exceeds its file limit.');
    let total=0;const chunks=[];
    while (total<=limit) {
      const chunk=Buffer.allocUnsafe(Math.min(65536,limit+1-total));
      const size=fs.readSync(descriptor,chunk,0,chunk.length,null);
      if (!size) return Buffer.concat(chunks,total).toString('utf8');
      total+=size;
      if (total>limit) throw new Error('Metadata input exceeds its file limit.');
      chunks.push(chunk.subarray(0,size));
    }
  } finally {fs.closeSync(descriptor);}
}
module.exports={readBounded};
