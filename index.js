import express from 'express';
import multer from 'multer';
import { tmpdir } from 'os';
import { join } from 'path';
import { writeFileSync, createReadStream, unlinkSync } from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';

ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();
const port = process.env.PORT || 10000;

// multer en mémoire
const upload = multer({ storage: multer.memoryStorage() });

// Page d'accueil pour test
app.get('/', (_req, res) => {
  res.send('OK – POST /mux avec fields image (jpg/png) et audio (mp3)');
});

// Endpoint principal : attend 2 fichiers: image & audio
app.post('/mux', upload.fields([{ name: 'image' }, { name: 'audio' }]), async (req, res) => {
  try {
    // Debug: si tu veux voir ce que tu reçois, dé-commente:
    // return res.json({ files: Object.keys(req.files || {}), body: req.body });

    if (!req.files || !req.files.image || !req.files.audio) {
      return res.status(400).json({ error: 'missing fields: need image and audio' });
    }

    const imageBuf = req.files.image[0].buffer;
    const audioBuf = req.files.audio[0].buffer;

    // Ecrire en fichiers temporaires
    const imgPath = join(tmpdir(), `img_${Date.now()}.jpg`);
    const audPath = join(tmpdir(), `aud_${Date.now()}.mp3`);
    const outPath = join(tmpdir(), `out_${Date.now()}.mp4`);

    writeFileSync(imgPath, imageBuf);
    writeFileSync(audPath, audioBuf);

    // Mux avec ffmpeg (image fixe + audio → mp4 vertical 1080x1920)
    await new Promise((resolve, reject) => {
      ffmpeg()
        .addInput(imgPath)
        .addInput(audPath)
        .loop(30)                     // boucle l'image (remplacé par -loop 1)
        .inputOptions(['-loop 1'])    // image fixe
        .videoCodec('libx264')
        .size('1080x1920')
        .fps(30)
        .audioCodec('aac')
        .outputOptions([
          '-shortest',                // s’arrête quand l’audio finit
          '-pix_fmt yuv420p'
        ])
        .on('end', resolve)
        .on('error', reject)
        .save(outPath);
    });

    // Stream la video au client
    res.setHeader('Content-Type', 'video/mp4');
    const stream = createReadStream(outPath);
    stream.pipe(res);

    // Nettoyage à la fin de l’envoi
    stream.on('close', () => {
      try { unlinkSync(imgPath); } catch {}
      try { unlinkSync(audPath); } catch {}
      try { unlinkSync(outPath); } catch {}
    });

  } catch (err) {
    console.error('Mux error:', err);
    res.status(500).json({ error: 'ffmpeg failed', detail: String(err) });
  }
});

app.listen(port, () => {
  console.log(`Mux API running on port ${port}`);
});
