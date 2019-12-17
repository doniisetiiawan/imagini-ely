const bodyparser = require('body-parser');
const path = require('path');
const express = require('express');
const sharp = require('sharp');
const mysql = require('mysql');
const settings = require('./settings');

const app = express();
const db = mysql.createConnection(settings.db);

app.db = db;

db.connect((err) => {
  if (err) throw err;

  console.log('db: ready');

  db.query(
    `CREATE TABLE IF NOT EXISTS images
    (
        id INT(11) UNSIGNED NOT NULL AUTO_INCREMENT,
        date_created TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        date_used TIMESTAMP NULL DEFAULT NULL,
        name VARCHAR(126) NOT NULL,
        size INT(11) UNSIGNED NOT NULL,
        data LONGBLOB NOT NULL,

        PRIMARY KEY (id),
        UNIQUE KEY name (name)
    )
    ENGINE=InnoDB DEFAULT CHARSET=utf8`,
  );

  setInterval(() => {
    db.query(
      'DELETE FROM images '
        + 'WHERE (date_created < UTC_TIMESTAMP - INTERVAL 1 WEEK AND date_used IS NULL) '
        + '   OR (date_used < UTC_TIMESTAMP - INTERVAL 1 MONTH)',
    );
  }, 3600 * 1000);

  app.param('image', (req, res, next, image) => {
    if (!image.match(/\.(png|jpg)$/i)) {
      return res.status(403).end();
    }

    db.query(
      'SELECT * FROM images WHERE name = ?',
      [image],
      (err, images) => {
        if (err || !images.length) {
          return res.status(404).end();
        }

        req.image = images[0];

        return next();
      },
    );
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
    '/uploads/:name',
    bodyparser.raw({
      limit: '10mb',
      type: 'image/*',
    }),
    (req, res) => {
      db.query(
        'INSERT INTO images SET ?',
        {
          name: req.params.name,
          size: req.body.length,
          data: req.body,
        },
        (err) => {
          if (err) {
            return res.send({
              status: 'error',
              code: err.code,
            });
          }

          res.send({ status: 'ok', size: req.body.length });
        },
      );
    },
  );

  app.head('/uploads/:image', (req, res) => res.status(200).end());

  app.delete('/uploads/:image', (req, res) => {
    db.query(
      'DELETE FROM images WHERE id = ?',
      [req.image.id],
      (err) => res.status(err ? 500 : 200).end(),
    );
  });

  function downloadImage(req, res) {
    if (Object.keys(req.query).length === 0) {
      db.query(
        'UPDATE images '
          + 'SET date_used = UTC_TIMESTAMP '
          + 'WHERE id = ?',
        [req.image.id],
      );

      res.setHeader(
        'Content-Type',
        `image/${path.extname(req.image.name).substr(1)}`,
      );

      return res.end(req.image.data);
    }

    const image = sharp(req.image.data);
    const width = +req.query.width;
    const height = +req.query.height;
    const blur = +req.query.blur;
    const sharpen = +req.query.sharpen;
    const greyscale = [
      'y',
      'yes',
      'true',
      '1',
      'on',
    ].includes(req.query.greyscale);
    const flip = ['y', 'yes', 'true', '1', 'on'].includes(
      req.query.flip,
    );
    const flop = ['y', 'yes', 'true', '1', 'on'].includes(
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

    db.query(
      'UPDATE images '
        + 'SET date_used = UTC_TIMESTAMP '
        + 'WHERE id = ?',
      [req.image.id],
    );

    res.setHeader(
      'Content-Type',
      `image/${path.extname(req.image.name).substr(1)}`,
    );

    image.pipe(res);
  }

  app.get('/uploads/:image', downloadImage);

  app.get('/stats', (req, res) => {
    db.query(
      'SELECT COUNT(*) total'
        + ', SUM(size) size'
        + ', MAX(date_used) last_used '
        + 'FROM images',
      (err, rows) => {
        if (err) {
          return res.status(500).end();
        }

        rows[0].uptime = process.uptime();

        return res.send(rows[0]);
      },
    );
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
    console.log('app: ready');
  });
});

module.exports = app;
