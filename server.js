const express = require('express');
const cors = require('cors');
const sharp = require('sharp');
const nodemailer = require('nodemailer');

const app = express();

app.use(cors());
app.use(express.json());

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'msc.mateus.santos@gmail.com',
    pass: 'tjna lagh zwhb cyhd'
  },
});

app.post('/send-email', (req, res) => {
  const { subject, message, to } = req.body;

  const mailOptions = {
    from: 'msc.mateus.santos@gmail.com',
    to: to,
    subject: subject,
    text: message,
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      return res.status(500).json({ error: error.toString() });
    }
    res.status(200).json({ message: 'Email sent successfully!', info: info });
  });
});

const processImage = async (imagePath, outputImagePath, fields, width, height) => {
  const image = sharp(imagePath);

  const svgText = `
    <svg width="${width}" height="${height}">
      ${fields
        .map(({ text, x, y, fontSize, checkbox }) => {
          const size = fontSize || 52; 

          if (checkbox) {
            return `<rect x="${x}" y="${y}" width="18" height="18" fill="black" stroke="black"/>`;
          }
          return `<text x="${x}" y="${y}" font-size="${size}" fill="black" font-family="Times New Roman">${text}</text>`;
        })
        .join('')}
    </svg>
  `;

  const svgBuffer = Buffer.from(svgText);

  await image.composite([{ input: svgBuffer, top: 0, left: 0 }]).toFile(outputImagePath);
};

app.post('/gen-page-1', async (req, res) => {
  const { fields } = req.body;

  try {
    const imagePath = './pdf1.jpg';
    const outputImagePath = './output1.jpg';
    await processImage(imagePath, outputImagePath, fields, 2484, 3511);

    res.status(200).json({ message: 'Image updated successfully!', path: outputImagePath });
  } catch (error) {
    console.error('Error processing image:', error);
    res.status(500).json({ error: error.toString() });
  }
});

app.post('/gen-page-2', async (req, res) => {
  const { fields } = req.body;

  try {
    const imagePath = './pdf2.jpg';
    const outputImagePath = './output2.jpg';
    await processImage(imagePath, outputImagePath, fields, 2484, 3511);

    res.status(200).json({ message: 'Image updated successfully!', path: outputImagePath });
  } catch (error) {
    console.error('Error processing image:', error);
    res.status(500).json({ error: error.toString() });
  }
});

app.post('/gen-page-3', async (req, res) => {
  const { fields } = req.body;

  try {
    const imagePath = './pdf3.jpg';
    const outputImagePath = './output3.jpg';
    await processImage(imagePath, outputImagePath, fields, 2484, 3511);

    res.status(200).json({ message: 'Image updated successfully!', path: outputImagePath });
  } catch (error) {
    console.error('Error processing image:', error);
    res.status(500).json({ error: error.toString() });
  }
});

app.post('/gen-page-4', async (req, res) => {
  const { fields } = req.body;

  try {
    const imagePath = './pdf4.jpg';
    const outputImagePath = './output4.jpg';
    await processImage(imagePath, outputImagePath, fields, 2479, 3509);

    res.status(200).json({ message: 'Image updated successfully!', path: outputImagePath });
  } catch (error) {
    console.error('Error processing image:', error);
    res.status(500).json({ error: error.toString() });
  }
});

const port = 3000;
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
