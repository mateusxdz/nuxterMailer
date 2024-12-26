require('dotenv').config();
const express = require('express');
const cors = require('cors');
const sharp = require('sharp');
const nodemailer = require('nodemailer');
const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

app.post('/sulprev/send-email', (req, res) => {
  const { subject, to } = req.body;

  const emailBodyPath = path.resolve(__dirname, 'corpoDoEmail.txt');

  fs.readFile(emailBodyPath, 'utf8', (err, emailBody) => {
    if (err) {
      console.error('Error reading corpoDoEmail.txt:', err);
      return res.status(500).json({ error: 'Error reading email body file.' });
    }

    const pdfFiles = [
      path.resolve(__dirname, 'output3pages.pdf'),
    ];

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: to,
      subject: subject,
      text: emailBody,
      attachments: pdfFiles.map((filePath) => ({
        filename: path.basename(filePath),
        path: filePath,
      })),
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error('Error sending email:', error);
        return res.status(500).json({ error: error.toString() });
      }
      res.status(200).json({ message: 'Email sent successfully!', info: info });
    });
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
          return `<text x="${x}" y="${y}" font-size="${size}" fill="black" font-family="Arial">${text}</text>`;
        })
        .join('')}
    </svg>
  `;

  const svgBuffer = Buffer.from(svgText);

  await image.composite([{ input: svgBuffer, top: 0, left: 0 }]).toFile(outputImagePath);
};

const convertImagesToPdf = async (imagePaths, outputPdfPath) => {
  const pdfDoc = await PDFDocument.create();

  for (const imagePath of imagePaths) {
    const imageBytes = await sharp(imagePath).toBuffer();
    const image = await pdfDoc.embedJpg(imageBytes);

    const page = pdfDoc.addPage();
    const { width, height } = page.getSize();
    const imageWidth = width;
    const imageHeight = (image.height / image.width) * width;

    page.drawImage(image, {
      x: 0,
      y: height - imageHeight,
      width: imageWidth,
      height: imageHeight,
    });
  }

  const pdfBytes = await pdfDoc.save();
  await fs.promises.writeFile(outputPdfPath, pdfBytes);
};

app.post('/sulprev/generate-pdf', async (req, res) => {
  try {
    const imagePaths1 = ['./output1.jpg', './output2.jpg', './pdf3.jpg'];
    const outputPdfPath1 = './output3pages.pdf';
    await convertImagesToPdf(imagePaths1, outputPdfPath1);

    const imagePaths2 = ['./output4.jpg'];
    const outputPdfPath2 = './output1page.pdf';
    await convertImagesToPdf(imagePaths2, outputPdfPath2);

    res.status(200).json({
      message: 'PDFs generated successfully!',
      pdf3Pages: outputPdfPath1,
      pdf1Page: outputPdfPath2,
    });
  } catch (error) {
    console.error('Error generating PDFs:', error);
    res.status(500).json({ error: error.toString() });
  }
});

app.post('/sulprev/gen-page-1', async (req, res) => {
  const { fields } = req.body;

  try {
    const imagePath = path.resolve(__dirname, './pdf1.jpg');
    const outputImagePath = path.resolve(__dirname, './output1.jpg');
    await processImage(imagePath, outputImagePath, fields, 2484, 3511);

    res.status(200).json({ message: 'Image updated successfully!', path: outputImagePath });
  } catch (error) {
    console.error('Error processing image:', error);
    res.status(500).json({ error: error.toString() });
  }
});

app.post('/sulprev/gen-page-2', async (req, res) => {
  const { fields } = req.body;

  try {
    const imagePath = path.resolve(__dirname, './pdf2.jpg');
    const outputImagePath = path.resolve(__dirname, './output2.jpg');
    await processImage(imagePath, outputImagePath, fields, 2484, 3511);

    res.status(200).json({ message: 'Image updated successfully!', path: outputImagePath });
  } catch (error) {
    console.error('Error processing image:', error);
    res.status(500).json({ error: error.toString() });
  }
});

app.post('/sulprev/gen-page-3', async (req, res) => {
  const { fields } = req.body;

  try {
    const imagePath = path.resolve(__dirname, './pdf3.jpg');
    const outputImagePath = path.resolve(__dirname, './output3.jpg');
    await processImage(imagePath, outputImagePath, fields, 2484, 3511);

    res.status(200).json({ message: 'Image updated successfully!', path: outputImagePath });
  } catch (error) {
    console.error('Error processing image:', error);
    res.status(500).json({ error: error.toString() });
  }
});

app.post('/sulprev/gen-page-4', async (req, res) => {
  const { fields } = req.body;

  try {
    const imagePath = path.resolve(__dirname, './pdf4.jpg');
    const outputImagePath = path.resolve(__dirname, './output4.jpg');
    await processImage(imagePath, outputImagePath, fields, 2479, 3509);

    res.status(200).json({ message: 'Image updated successfully!', path: outputImagePath });
  } catch (error) {
    console.error('Error processing image:', error);
    res.status(500).json({ error: error.toString() });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});