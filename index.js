import express from 'express';
import Busboy from 'busboy';
import { createWriteStream, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
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
      const filename = info.filename;
      const saveTo = join(tmp, `${Date.now()}-${filename}`);
      file.pipe(createWriteStream(saveTo)).on('finish', () => {
        files[name] = saveTo;
      });
    });
    bb.on('field', (name, val) => {
      if (name === 'duration') durationSec = parseInt(val);
    });
    bb.on('finish', resolve);
    req.pipe(bb);
  });

  done.then(() => {
    if (!files.image || !files.audio) {
      return res.status(400).send('⚠️ Merci d’envoyer "image" et "audio"');
    }

    const outPath = join(tmp, `${Date.now()}-out.mp4`);
    let command = ffmpeg()
      .addInput(files.image)
      .loop(durationSec || 5)
      .addInput(files.audio)
      .outputOptions(['-pix_fmt yuv420p'])
      .output(outPath);

    command.on('end', () => {
      res.download(outPath, 'output.mp4', () => {
        try {
          unlinkSync(files.image);
          unlinkSync(files.audio);
          unlinkSync(outPath);
        } catch {}
      });
    });

    command.on('error', (err) => {
      res.status(500).send('Erreur FFMPEG : ' + err.message);
    });

    command.run();
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 API Mux en ligne sur le port ${PORT}`);
});
