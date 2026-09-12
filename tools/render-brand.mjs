import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
// Supply the installed sharp module path only when re-rendering brand assets.
const sharp=require(process.argv[2]||'sharp'),svg=readFileSync('image/titan-mark.svg');
for(const size of [192,512])await sharp(svg).resize(size,size).png().toFile(`image/logo-${size}.png`);
const png=await sharp(svg).resize(48,48).png().toBuffer(),header=Buffer.alloc(22);
header.writeUInt16LE(1,2);header.writeUInt16LE(1,4);header[6]=48;header[7]=48;header.writeUInt16LE(1,10);header.writeUInt16LE(32,12);header.writeUInt32LE(png.length,14);header.writeUInt32LE(22,18);
writeFileSync('favicon.ico',Buffer.concat([header,png]));
