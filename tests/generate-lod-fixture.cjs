// Deterministic synthetic terrain for manual LOD navigation checks.
// Usage: node tests/generate-lod-fixture.cjs <output.las>
const fs = require('node:fs');
const destination = process.argv[2];
if (!destination) throw new Error('Supply an output LAS path');
const width = 1000, height = 600, count = width * height;
const bytes = Buffer.alloc(227 + count * 20);
bytes.write('LASF'); bytes[24] = 1; bytes[25] = 2;
bytes.writeUInt16LE(227, 94); bytes.writeUInt32LE(227, 96);
bytes.writeUInt16LE(20, 105); bytes.writeUInt32LE(count, 107);
for (const offset of [131,139,147]) bytes.writeDoubleLE(0.000001, offset);
for (const [offset,value] of [[179,-15.425],[187,-15.445],[195,28.13],[203,28.118],[211,210],[219,100]]) bytes.writeDoubleLE(value, offset);
for (let i=0;i<count;i++) {
  const x=i%width,y=Math.floor(i/width), offset=227+i*20;
  const z=150+40*Math.sin(x/100)*Math.cos(y/100);
  bytes.writeInt32LE(Math.round((-15.445+x/(width-1)*0.02)*1e6),offset);
  bytes.writeInt32LE(Math.round((28.118+y/(height-1)*0.012)*1e6),offset+4);
  bytes.writeInt32LE(Math.round(z*1e6),offset+8);
  bytes[offset+15]=2;
}
fs.writeFileSync(destination,bytes,{flag:'wx'});
console.log(`Created ${count} synthetic points at ${destination}`);
