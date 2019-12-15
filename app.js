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

app.param('greyscale', (req, res, next, greyscale) => {
  if (greyscale != 'bw') return next('route');

  req.greyscale = true;

  return next();
});

app.param('width', (req, res, next, width) => {
  req.width = +width;

  return next();
});

app.param('height', (req, res, next, height) => {
  req.height = +height;

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

function downloadImage(req, res) {
  fs.access(req.localpath, fs.constants.R_OK, (err) => {
    if (err) return res.status(404).end();

    const image = sharp(req.localpath);
    const width = +req.query.width;
    const height = +req.query.height;
    const blur = +req.query.blur;
    const sharpen = +req.query.sharpen;
    const greyscale = ['y', 'yes', '1', 'on'].includes(
      req.query.greyscale,
    );
    const flip = ['y', 'yes', '1', 'on'].includes(
      req.query.flip,
    );
    const flop = ['y', 'yes', '1', 'on'].includes(
      req.query.flop,
    );

    if (width > 0 && height > 0) {
      image.resize({ fit: 'fill' });
    }

    if (width > 0 || height > 0) {
      image.resize(width || null, height || null);
    }

    if (flip) image.flip();
    if (flop) image.flop();
    if (blur > 0) image.blur(blur);
    if (sharpen > 0) image.sharpen(sharpen);
    if (greyscale) image.greyscale();

    res.setHeader(
      'Content-Type',
      `image/${path.extname(req.image).substr(1)}`,
    );

    image.pipe(res);
  });
}

app.get('/uploads/:image', downloadImage);

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
