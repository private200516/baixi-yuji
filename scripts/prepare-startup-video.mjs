import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// This is intentionally a constrained remuxer for the supplied, approved NH film.
// It is not a general MP4 transcoder: unfamiliar files or structures fail closed.
const root = new URL('../', import.meta.url);
const sourcePath = new URL('public/brand/nh-launch.mp4', root);
const targetPath = new URL('public/brand/nh-launch-mobile.mp4', root);
const reportPath = new URL('.delivery/mobile-v222/mobile-video-preparation.json', root);
const approvedSourceSha256 = '62616b47c01eb66c1576ab3d9eb0d4a78d932f44f09cf1dc749961c8bb97d453';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const source = await readFile(sourcePath);
assert.equal(sha256(source), approvedSourceSha256, 'Source differs from the approved NH film; refusing to remux');

const containers = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts', 'dinf', 'udta']);
const permittedChildren = {
  moov: new Set(['mvhd', 'trak', 'udta']), trak: new Set(['tkhd', 'edts', 'mdia']), edts: new Set(['elst']),
  mdia: new Set(['mdhd', 'hdlr', 'minf']), minf: new Set(['vmhd', 'dinf', 'stbl']), dinf: new Set(['dref']),
  stbl: new Set(['stsd', 'stts', 'stss', 'ctts', 'stsc', 'stsz', 'stco', 'co64']), udta: new Set(['meta']),
};
function boxes(bytes, start = 0, end = bytes.length, parent = null) {
  const result = []; let offset = start;
  while (offset < end) {
    assert.ok(offset + 8 <= end, 'Truncated box header');
    const size = bytes.readUInt32BE(offset), type = bytes.toString('ascii', offset + 4, offset + 8);
    assert.ok(size >= 8 && offset + size <= end, 'Only complete ordinary 32-bit boxes are supported');
    if (parent) assert.ok(permittedChildren[parent]?.has(type), `Unsupported ${parent}/${type} box`);
    const box = { type, offset, size };
    if (containers.has(type)) box.children = boxes(bytes, offset + 8, offset + size, type);
    result.push(box); offset += size;
  }
  assert.equal(offset, end); return result;
}
function one(parent, type) {
  const found = parent.children.filter(box => box.type === type);
  assert.equal(found.length, 1, `Expected exactly one ${parent.type}/${type}`); return found[0];
}
function inspect(bytes, top) {
  assert.equal(top.filter(box => box.type === 'mdat').length, 1);
  assert.equal(top.filter(box => box.type === 'moov').length, 1);
  const moov = top.find(box => box.type === 'moov'), mdat = top.find(box => box.type === 'mdat');
  const track = one(moov, 'trak'), mdia = one(track, 'mdia'), hdlr = one(mdia, 'hdlr'), mdhd = one(mdia, 'mdhd');
  assert.equal(bytes.toString('ascii', hdlr.offset + 16, hdlr.offset + 20), 'vide', 'Expected one video track with no audio');
  assert.equal(bytes.readUInt32BE(mdhd.offset + 8), 0, 'Only mdhd version 0 is supported');
  const timescale = bytes.readUInt32BE(mdhd.offset + 20), durationUnits = bytes.readUInt32BE(mdhd.offset + 24);
  const stbl = one(one(mdia, 'minf'), 'stbl'), stsd = one(stbl, 'stsd'), stsz = one(stbl, 'stsz'), stsc = one(stbl, 'stsc'), stts = one(stbl, 'stts');
  assert.equal(bytes.readUInt32BE(stsd.offset + 8), 0); assert.equal(bytes.readUInt32BE(stsd.offset + 12), 1);
  const entries = boxes(bytes, stsd.offset + 16, stsd.offset + stsd.size);
  assert.equal(entries.length, 1); assert.equal(entries[0].type, 'avc1', 'Only the approved avc1 sample entry is supported');
  const entry = entries[0], extensions = boxes(bytes, entry.offset + 86, entry.offset + entry.size);
  assert.ok(extensions.every(box => ['avcC', 'btrt', 'pasp'].includes(box.type)), 'Unknown avc1 extension');
  const avcC = extensions.find(box => box.type === 'avcC'); assert.ok(avcC);
  const codec = `avc1.${bytes.subarray(avcC.offset + 9, avcC.offset + 12).toString('hex')}`;
  assert.equal(bytes.readUInt32BE(stsz.offset + 8), 0); assert.equal(bytes.readUInt32BE(stsz.offset + 12), 0);
  const sampleCount = bytes.readUInt32BE(stsz.offset + 16); assert.equal(sampleCount, 97); assert.equal(stsz.size, 20 + sampleCount * 4);
  const sizes = Array.from({ length: sampleCount }, (_, index) => bytes.readUInt32BE(stsz.offset + 20 + index * 4));
  assert.ok(sizes.every(size => size > 0));
  const tables = stbl.children.filter(box => ['stco', 'co64'].includes(box.type)); assert.equal(tables.length, 1);
  const offsets = tables[0], width = offsets.type === 'co64' ? 8 : 4;
  assert.equal(bytes.readUInt32BE(offsets.offset + 8), 0);
  const chunkCount = bytes.readUInt32BE(offsets.offset + 12); assert.equal(offsets.size, 16 + chunkCount * width);
  const chunks = Array.from({ length: chunkCount }, (_, index) => {
    const position = offsets.offset + 16 + index * width;
    const value = width === 4 ? bytes.readUInt32BE(position) : Number(bytes.readBigUInt64BE(position));
    assert.ok(Number.isSafeInteger(value) && value >= mdat.offset + 8 && value < mdat.offset + mdat.size);
    return { position, width, value };
  });
  assert.equal(bytes.readUInt32BE(stsc.offset + 8), 0);
  const mappingCount = bytes.readUInt32BE(stsc.offset + 12); assert.equal(stsc.size, 16 + mappingCount * 12);
  const mapping = Array.from({ length: mappingCount }, (_, index) => {
    const position = stsc.offset + 16 + index * 12;
    const firstChunk = bytes.readUInt32BE(position), perChunk = bytes.readUInt32BE(position + 4), description = bytes.readUInt32BE(position + 8);
    assert.ok(firstChunk > 0 && firstChunk <= chunkCount && perChunk > 0); assert.equal(description, 1);
    return { firstChunk, perChunk };
  });
  assert.equal(mapping[0].firstChunk, 1); assert.ok(mapping.every((value, index) => !index || value.firstChunk > mapping[index - 1].firstChunk));
  const samples = []; let sampleIndex = 0;
  chunks.forEach((chunk, index) => {
    const spec = mapping.findLast(item => item.firstChunk <= index + 1); let cursor = chunk.value;
    for (let count = 0; count < spec.perChunk; count++) {
      assert.ok(sampleIndex < sizes.length, 'Chunk mapping exceeds sample count');
      const size = sizes[sampleIndex++]; assert.ok(cursor + size <= mdat.offset + mdat.size, 'Sample extends beyond mdat');
      samples.push({ offset: cursor, size, sha256: sha256(bytes.subarray(cursor, cursor + size)) }); cursor += size;
    }
    if (index + 1 < chunks.length) assert.ok(cursor <= chunks[index + 1].value, 'Chunks overlap');
  });
  assert.equal(samples.length, sampleCount);
  assert.equal(bytes.readUInt32BE(stts.offset + 8), 0);
  const timeCount = bytes.readUInt32BE(stts.offset + 12); assert.equal(stts.size, 16 + timeCount * 8);
  let frames = 0, ticks = 0;
  for (let index = 0; index < timeCount; index++) {
    const count = bytes.readUInt32BE(stts.offset + 16 + index * 8), delta = bytes.readUInt32BE(stts.offset + 20 + index * 8);
    frames += count; ticks += count * delta;
  }
  assert.equal(frames, sampleCount); assert.equal(ticks, durationUnits);
  return { moov, mdat, stsd, chunks, samples, media: { codec, width: bytes.readUInt16BE(entry.offset + 32), height: bytes.readUInt16BE(entry.offset + 34),
    durationSeconds: durationUnits / timescale, timescale, sampleCount, framesPerSecond: frames / (durationUnits / timescale), audioTracks: 0 } };
}

const originalTop = boxes(source);
assert.deepEqual(originalTop.map(box => box.type), ['ftyp', 'uuid', 'free', 'mdat', 'moov'], 'Unknown original top-level arrangement');
const original = inspect(source, originalTop);
assert.deepEqual(original.media, { codec: 'avc1.64001f', width: 960, height: 960, durationSeconds: 4.041666666666667, timescale: 12288, sampleCount: 97, framesPerSecond: 24, audioTracks: 0 });
const patchedMoov = Buffer.from(source.subarray(original.moov.offset, original.moov.offset + original.moov.size));
const reorder = [originalTop[0], original.moov, ...originalTop.filter(box => box.type !== 'ftyp' && box.type !== 'moov')];
let position = 0; const planned = reorder.map(box => { const next = { box, position }; position += box.size; return next; });
const newMdatOffset = planned.find(item => item.box.type === 'mdat').position;
const offsetShift = newMdatOffset - original.mdat.offset;
for (const chunk of original.chunks) {
  const adjusted = chunk.value + offsetShift, relative = chunk.position - original.moov.offset;
  assert.ok(Number.isSafeInteger(adjusted) && adjusted > 0);
  if (chunk.width === 4) { assert.ok(adjusted <= 0xffffffff, 'stco would overflow; refusing to change table type'); patchedMoov.writeUInt32BE(adjusted, relative); }
  else patchedMoov.writeBigUInt64BE(BigInt(adjusted), relative);
}
const result = Buffer.concat(reorder.map(box => box.type === 'moov' ? patchedMoov : source.subarray(box.offset, box.offset + box.size)));
assert.equal(result.length, source.length);
const resultTop = boxes(result), mobile = inspect(result, resultTop);
assert.deepEqual(resultTop.map(box => box.type), ['ftyp', 'moov', 'uuid', 'free', 'mdat']);
assert.ok(mobile.moov.offset < mobile.mdat.offset);
assert.deepEqual(mobile.media, original.media);
assert.ok(source.subarray(original.stsd.offset, original.stsd.offset + original.stsd.size).equals(result.subarray(mobile.stsd.offset, mobile.stsd.offset + mobile.stsd.size)), 'Codec/sample description changed');
const oldMdat = source.subarray(original.mdat.offset + 8, original.mdat.offset + original.mdat.size);
const newMdat = result.subarray(mobile.mdat.offset + 8, mobile.mdat.offset + mobile.mdat.size);
assert.ok(oldMdat.equals(newMdat), 'mdat payload changed');
const sampleVerification = original.samples.map((sample, index) => {
  const actual = mobile.samples[index]; assert.equal(actual.offset, sample.offset + offsetShift); assert.equal(actual.size, sample.size); assert.equal(actual.sha256, sample.sha256);
  assert.ok(source.subarray(sample.offset, sample.offset + sample.size).equals(result.subarray(actual.offset, actual.offset + actual.size)));
  return { sample: index + 1, originalOffset: sample.offset, mobileOffset: actual.offset, bytes: sample.size, sha256: sample.sha256 };
});
// Restore only the offset fields and prove that all remaining moov metadata stayed byte-identical.
const restoredMoov = Buffer.from(patchedMoov);
for (const chunk of original.chunks) source.copy(restoredMoov, chunk.position - original.moov.offset, chunk.position, chunk.position + chunk.width);
assert.ok(restoredMoov.equals(source.subarray(original.moov.offset, original.moov.offset + original.moov.size)));
for (const box of originalTop.filter(box => box.type !== 'moov')) {
  const relocated = resultTop.find(candidate => candidate.type === box.type);
  assert.ok(source.subarray(box.offset, box.offset + box.size).equals(result.subarray(relocated.offset, relocated.offset + relocated.size)));
}

// No output is written until structure, every sample, every payload and metadata pass.
await writeFile(targetPath, result);
assert.equal(sha256(await readFile(targetPath)), sha256(result));
assert.equal(sha256(await readFile(sourcePath)), approvedSourceSha256, 'Original media must stay untouched');
await mkdir(new URL('.delivery/mobile-v222/', root), { recursive: true });
const report = { at: new Date().toISOString(), source: fileURLToPath(sourcePath), target: fileURLToPath(targetPath),
  sourceSha256: approvedSourceSha256, mobileSha256: sha256(result), bytes: result.length, sourceUnchanged: true, reencoded: false,
  sourceBoxes: originalTop.map(({ type, offset, size }) => ({ type, offset, size })), mobileBoxes: resultTop.map(({ type, offset, size }) => ({ type, offset, size })),
  fastStart: true, media: mobile.media, offsetShift, chunkOffsetsVerified: mobile.chunks.length,
  mdatPayload: { bytes: oldMdat.length, originalSha256: sha256(oldMdat), mobileSha256: sha256(newMdat), byteIdentical: true },
  metadataUnchangedExceptChunkOffsets: true, samplesVerified: sampleVerification.length, sampleVerification };
await writeFile(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ target: fileURLToPath(targetPath), report: fileURLToPath(reportPath), bytes: result.length, sourceSha256: approvedSourceSha256,
  mobileSha256: sha256(result), fastStart: true, reencoded: false, sourceUnchanged: true, samplesVerified: sampleVerification.length, media: mobile.media }, null, 2));
