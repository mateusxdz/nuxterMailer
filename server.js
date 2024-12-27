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
  const {
    to
  } = req.body;
  const emailBodyPath = path.resolve(__dirname, 'modelo_email.txt');
  fs.readFile(emailBodyPath, 'utf8', (err, emailBodyContent) => {
    if (err) {
      console.error('Error reading modelo_email.txt:', err);
      return res.status(500).json({
        error: 'Error reading email body file.'
      });
    }
    let emailData;
    try {
      emailData = JSON.parse(emailBodyContent);
    } catch (parseErr) {
      console.error('Error parsing modelo_email.txt:', parseErr);
      return res.status(500).json({
        error: 'Error parsing email body file.'
      });
    }
    const {
      subject,
      text
    } = emailData;
    const pdfFiles = [path.resolve(__dirname, 'form1.pdf'), path.resolve(__dirname, 'form2.pdf'),];
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: to,
      subject: subject,
      text: text,
      attachments: pdfFiles.map((filePath) => ({
        filename: path.basename(filePath),
        path: filePath,
      })),
    };
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error('Error sending email:', error);
        return res.status(500).json({
          error: error.toString()
        });
      }
      res.status(200).json({
        message: 'Email sent successfully!',
        info: info
      });
    });
  });
});

const ensureDirectoryExistence = (filePath) => {
  const dirname = path.dirname(filePath);
  if (fs.existsSync(dirname)) {
    return true;
  }
  ensureDirectoryExistence(dirname);
  fs.mkdirSync(dirname);
};

const processImage = async (imagePath, outputImagePath, fields, width, height) => {
  ensureDirectoryExistence(outputImagePath);

  const image = sharp(imagePath);

  const svgText = `
    <svg width="${width}" height="${height}">
      ${fields
      .map(({ text, x, y, fontSize, checkbox }) => {
        const size = fontSize || 52;
        const displayText = text ?? '';

        if (checkbox) {
          return `<rect x="${x}" y="${y}" width="18" height="18" fill="black" stroke="black"/>`;
        }
        return `<text x="${x}" y="${y}" font-size="${size}" fill="black" font-family="Arial">${displayText}</text>`;
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
    const imagePaths1 = ['./output_images/output1.jpg', './output_images/output2.jpg', './pdf_images/pdf3.jpg'];
    const outputPdfPath1 = './form1.pdf';
    await convertImagesToPdf(imagePaths1, outputPdfPath1);

    const imagePaths2 = ['./output_images/output4.jpg'];
    const outputPdfPath2 = './form2.pdf';
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
    const imagePath = path.resolve(__dirname, './pdf_images/pdf1.jpg');
    const outputImagePath = path.resolve(__dirname, './output_images/output1.jpg');
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
    const imagePath = path.resolve(__dirname, './pdf_images/pdf2.jpg');
    const outputImagePath = path.resolve(__dirname, './output_images/output2.jpg');
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
    const imagePath = path.resolve(__dirname, './pdf_images/pdf3.jpg');
    const outputImagePath = path.resolve(__dirname, './output_images/output3.jpg');
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
    const imagePath = path.resolve(__dirname, './pdf_images/pdf4.jpg');
    const outputImagePath = path.resolve(__dirname, './output_images/output4.jpg');
    await processImage(imagePath, outputImagePath, fields, 2479, 3509);

    res.status(200).json({ message: 'Image updated successfully!', path: outputImagePath });
  } catch (error) {
    console.error('Error processing image:', error);
    res.status(500).json({ error: error.toString() });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}!`);
});