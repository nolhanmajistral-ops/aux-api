mport express from 'express';
import { tmpdir } from 'os';
import { join } from 'path';
import { writeFileSync, createReadStream, unlinkSync } from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import multer from 'multer';

// ffmpeg binaire
ffmpeg.setFfmpegPath(ffmpegPath);

// Multer: on garde les fichiers en mémoire
const storage = multer.memoryStorage();
const upload = multer({ storage });

const app = express();
const port = process.env.PORT || 10000;

// Petit healthcheck
app.get('/', (_req, res) => {
  res.send('OK — POST /mux avec image (jpg/png) + audio (mp3) -> mp4 vertical');
});

// Endpoint principal : attend 2 fichiers: image + audio
app.post(
  '/mux',
  upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'audio', maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      // Validation
      if (!req.files || !req.files.image || !req.files.audio) {
        return res
          .status(400)
          .json({ error: 'missing fields: need image and audio' });
      }

      const imageBuf = req.files.image[0].buffer;
      const audioBuf = req.files.audio[0].buffer;

      // Fichiers temporaires
      const base = Date.now();
      const imgPath = join(tmpdir(), `img_${base}.jpg`);
      const audPath = join(tmpdir(), `aud_${base}.mp3`);
      const outPath = join(tmpdir(), `out_${base}.mp4`);

      writeFileSync(imgPath, imageBuf);
      writeFileSync(audPath, audioBuf);

      // FFmpeg: image fixe + audio -> MP4 vertical 1080x1920
      await new Promise((resolve, reject) => {
        ffmpeg()
          .input(imgPath)
          .inputOptions(['-loop 1']) // image unique bouclée
          .addInput(audPath)
          .videoCodec('libx264')
          .size('1080x1920')
          .fps(30)
          .audioCodec('aac')
          .outputOptions([
            '-shortest',     // s’arrête quand l’audio finit
            '-pix_fmt yuv420p',
          ])
          .on('end', resolve)
          .on('error', reject)
          .save(outPath);
      });

      // Stream du MP4 au client
      res.setHeader('Content-Type', 'video/mp4');
      const stream = createReadStream(outPath);
      stream.pipe(res);

      // Nettoyage
      stream.on('close', () => {
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
