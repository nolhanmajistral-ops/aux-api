import express from "express";
import Busboy from "busboy";
import { createWriteStream, readFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";

ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();

app.get("/", (req, res) => {
  res.send("OK - POST /mux (multipart: fields image + audio) -> MP4");
});

app.post("/mux", (req, res) => {
  const bb = Busboy({ headers: req.headers });
  const tmp = tmpdir();
  const files = {};
  let durationSec = null;

  const done = new Promise((resolve, reject) => {
    bb.on("file", (name, file, info) => {
      const filename = info.filename || "file";
      const saveTo = join(tmp, Date.now() + "-" + filename);
      file.pipe(createWriteStream(saveTo)).on("finish", () => {
        files[name] = saveTo;
      });
    });
    bb.on("field", (name, val) => {
      if (name === "durationSec") durationSec = parseFloat(val);
    });
    bb.on("error", reject);
    bb.on("finish", resolve);
  });

  req.pipe(bb);

  done
    .then(async () => {
      if (!files.image || !files.audio) {
        res.status(400).send("missing fields: need image and audio");
        return;
      }

      const outPath = join(tmp, "out-" + Date.now() + ".mp4");

      await new Promise((resolve, reject) => {
        let cmd = ffmpeg()
          .addInput(files.image)
          .loop(1)
          .addInput(files.audio)
          .videoCodec("libx264")
          .audioCodec("aac")
          // IMPORTANT: only plain ASCII single quotes here:
          .outputOptions("-pix_fmt yuv420p", "-shortest")
          .output(outPath);

        if (durationSec && !isNaN(durationSec)) {
          cmd = cmd.duration(durationSec);
        }

        cmd.on("end", resolve).on("error", reject).run();
      });

      const data = readFileSync(outPath);
      res.setHeader("Content-Type", "video/mp4");
      res.end(data);

      try { unlinkSync(outPath); } catch {}
      try { unlinkSync(files.image); } catch {}
      try { unlinkSync(files.audio); } catch {}
    })
    .catch((e) => {
      res.status(500).send("error: " + (e.message || String(e)));
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Mux API running on port " + PORT);
});
