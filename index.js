const express = require('express');
const multer = require('multer');
const { join } = require('path');
const { writeFileSync, createReadStream, unlinkSync } = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');

ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();
const port = process.env.PORT || 10000;

// stockage mémoire (n8n enverra les fichiers en multipart)
const upload = multer({ storage: multer.memoryStorage() });

// ping
app.get('/', (_req, res) => {
  res.send('OK - POST /mux with fields image (jpg/png) and audio (mp3)');
});

// POST /mux avec 2 fichiers: image & audio
app.post('/mux', upload.fields([{ name: 'image' }, { name: 'audio' }]), async (req, res) => {
  try {
    if (!req.files || !req.files.image || !req.files.audio) {
      return res.status(400).json({ error: 'missing fields: need image and audio' });
    }

    // buffers
    const imageBuf = req.files.image[0].buffer;
    const audioBuf = req.files.audio[0].buffer;

    // fichiers temporaires
    const tmpDir = '/tmp';
    const stamp = Date.now();
    const imgPath = join(tmpDir, `img_${stamp}.jpg`);
    const audPath = join(tmpDir, `aud_${stamp}.mp3`);
    const outPath = join(tmpDir, `out_${stamp}.mp4`);

    writeFileSync(imgPath, imageBuf);
    writeFileSync(audPath, audioBuf);

    // créer la vidéo 1080x1920, 30 fps, arrêt sur fin d'audio
    await new Promise((resolve, reject) => {
      ffmpeg()
        .addInput(imgPath)
        .loop(300)                      // image fixe
        .addInput(audPath)
        .videoCodec('libx264')
        .size('1080x1920')
        .fps(30)
        .audioCodec('aac')
        .outputOptions([
          '-shortest',                  // s’arrête quand l’audio finit
          '-pix_fmt yuv420p'
        ])
        .on('end', resolve)
        .on('error', reject)
        .save(outPath);
    });

    res.setHeader('Content-Type', 'video/mp4');
    const stream = createReadStream(outPath);
    stream.pipe(res);

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
