const bodyparser = require('body-parser');
const path = require('path');
const fs = require('fs');
const express = require('express');
const sharp = require('sharp');

const app = express();

app.param('image', (req, res, next, image) => {
  if (!image.match(/\.(png|jpg)$/i)) {
    return res
      .status(req.method == 'POST' ? 403 : 404)
      .end();
  }

  req.image = image;
  req.localpath = path.join(
    __dirname,
    'uploads',
    req.image,
  );

  return next();
});

app.post(
  '/uploads/:image',
  bodyparser.raw({
    limit: '10mb',
    type: 'image/*',
  }),
  (req, res) => {
    const fd = fs.createWriteStream(req.localpath, {
      flags: 'w+',
      encoding: 'binary',
    });

    fd.end(req.body);

    fd.on('close', () => {
      res.send({ status: 'ok', size: req.body.length });
    });
  },
);

app.head('/uploads/:image', (req, res) => {
  fs.access(req.localpath, fs.constants.R_OK, (err) => {
    res.status(err ? 404 : 200).end();
  });
});

app.get('/uploads/:image', (req, res) => {
  const fd = fs.createReadStream(req.localpath);

  fd.on('error', (e) => {
    res.status(e.code == 'ENOENT' ? 404 : 500).end();
  });

  res.setHeader(
    'Content-Type',
    `image/${path.extname(req.image).substr(1)}`,
  );

  fd.pipe(res);
});

app.get(/\/thumbnail\.(jpg|png)/, (req, res) => {
  const format = req.params[0] == 'png' ? 'png' : 'jpeg';
  const width = +req.query.width || 300;
  const height = +req.query.height || 200;
  const border = +req.query.border || 5;
  const bgcolor = req.query.bgcolor || '#fcfcfc';
  const fgcolor = req.query.fgcolor || '#ddd';
  const textcolor = req.query.textcolor || '#aaa';
  const textsize = +req.query.textsize || 24;
  const image = sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0 },
    },
  });

  const thumbnail = Buffer.from(
    `<svg width="${width}" height="${height}">
    <rect
        x="0" y="0"
        width="${width}" height="${height}"
        fill="${fgcolor}" />
    <rect
        x="${border}" y="${border}"
        width="${width - border * 2}" height="${height
      - border * 2}"
        fill="${bgcolor}" />
    <line
        x1="${border * 2}" y1="${border * 2}"
        x2="${width - border * 2}" y2="${height
      - border * 2}"
        stroke-width="${border}" stroke="${fgcolor}" />
    <line
        x1="${width - border * 2}" y1="${border * 2}"
        x2="${border * 2}" y2="${height - border * 2}"
        stroke-width="${border}" stroke="${fgcolor}" />
    <rect
        x="${border}" y="${(height - textsize) / 2}"
        width="${width - border * 2}" height="${textsize}"
        fill="${bgcolor}" />
    <text
        x="${width / 2}" y="${height / 2}" dy="8"
        font-family="Helvetica" font-size="${textsize}"
        fill="${textcolor}" text-anchor="middle">${width} x ${height}</text>
</svg>`,
  );

  image
    .composite([
      {
        input: thumbnail,
      },
    ])
    [format]()
    .pipe(res);
});

app.listen(3000, () => {
  console.log('ready');
});
