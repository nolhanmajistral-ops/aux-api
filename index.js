import express from 'express';
import Busboy from 'busboy';
import { tmpdir } from 'os';
import { join } from 'path';
import { createWriteStream, readFileSync, unlinkSync } from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';

ffmpeg.setFfmpegPath(ffmpegPath);
const app = express();

app.get('/', (req, res) => {
  res.send('✅ API prête : POST /mux avec image + audio pour générer une vidéo MP4');
});

app.post('/mux', (req, res) => {
  const bb = Busboy({ headers: req.headers });
  const tmp = tmpdir();
  const files = {};
  let durationSec = null;

  const done = new Promise((resolve, reject) => {
    bb.on('file', (name, file, info) => {
      const { filename } = info;
      const saveTo = join(tmp, `${Date.now()}-${filename}`);
      file.pipe(createWriteStream(saveTo)).on('finish', () => {
        files[name] = saveTo;
      });
    });
    bb.on('field', (n, v) => { if (n === 'durationSec') durationSec = parseFloat(v); });
    bb.on('error', reject);
    bb.on('finish', resolve);
  });

  req.pipe(bb);
  done.then(async () => {
    if (!files.image || !files.audio) {
      res.status(400).json({ error: 'Champs manquants : image et audio requis' });
      return;
    }
    try {
      const outPath = join(tmp, `out-${Date.now()}.mp4`);
      await new Promise((resolve, reject) => {
        let cmd = ffmpeg()
          .addInput(files.image).loop(1)
          .addInput(files.audio)
          .videoCodec('libx264')
          .audioCodec('aac')
          .outputOptions(['-pix_fmt yuv420p'])
