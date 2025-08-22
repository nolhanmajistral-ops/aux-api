import express from 'express';
import { tmpdir } from 'os';
import { join } from 'path';
import { writeFileSync, createReadStream, unlinkSync } from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import multer from 'multer';

ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();
const port = process.env.PORT || 10000;

// stockage mémoire pour recevoir image/audio en form-data
const upload = multer({ storage: multer.memoryStorage() });

app.get('/', (_req, res) => {
  res.send('OK - POST /mux with fields image (jpg/png) and audio (mp3)');
});

app.post(
  '/mux',
  upload.fields([{ name: 'image', maxCount: 1 }, { name: 'audio', maxCount: 1 }]),
  async (req, res) => {
    try {
      if (!req.files?.image?.[0] || !req.files?.audio?.[0]) {
        return res.status(400).json({ error: 'missing fields: need image and audio' });
      }

      const imageBuf = req.files.image[0].buffer;
      const audioBuf = req.files.audio[0].buffer;

      // fichiers temporaires
      const imgPath = join(tmpdir(), `img_${Date.now()}.jpg`);
      const audPath = join(tmpdir(), `aud_${Date.now()}.mp3`);
      const outPath = join(tmpdir(), `out_${Date.now()}.mp4`);

      writeFileSync(imgPath, imageBuf);
      writeFileSync(audPath, audioBuf);

      // ffmpeg: image fixe + audio -> mp4 vertical 1080x1920
      await new Promise((resolve, reject) => {
        ffmpeg()
          .input(imgPath)
          .loop(30) // image fixe
          .videoCodec('libx264')
          .size('1080x1920')
          .fps(30)
          .input(audPath)
          .audioCodec('aac')
          .outputOptions([
            '-shortest',      // s'arrête quand l'audio finit
            '-pix_fmt', 'yuv420p'
          ])
          .on('end', resolve)
          .on('error', reject)
          .save(outPath);
      });

      // renvoie la vidéo au client puis nettoie
      res.setHeader('Content-Type', 'video/mp4');
      createReadStream(outPath).pipe(res).on('close', () => {
        try { unlinkSync(imgPath); } catch {}
        try { unlinkSync(audPath); } catch {}
        try { unlinkSync(outPath); } catch {}
      });
    } catch (err) {
      console.error('Mux error:', err);
      res.status(500).json({ error: 'ffmpeg failed', detail: String(err) });
    }
  }
);

app.listen(port, () => {
  console.log(`Mux API running on port ${port}`);
});
