require('dotenv').config();
const express = require('express');
const router = express.Router();
const cors = require('cors');
const sharp = require('sharp');
const axios = require('axios');
const nodemailer = require('nodemailer');
const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const moment = require('moment');

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

const dbClient = new Client({
  host: '46.202.150.172',
  port: 5432,
  user: 'sulprev_user',
  password: 'Labs34673467@',
  database: 'sulprev',
});

app.get('/sulprev/test-db-connection', async (req, res) => {
  const testClient = new Client({
    host: '46.202.150.172',
    port: 5432,
    user: 'sulprev_user',
    password: 'Labs34673467@',
    database: 'sulprev',
  });

  try {
    await testClient.connect();  // Attempt to connect to the DB
    res.status(200).json({
      message: 'Successfully connected to the database!',
    });
  } catch (error) {
    console.error('Error connecting to the database:', error);
    res.status(500).json({
      error: 'Error connecting to the database: ' + error.message,
    });
  } finally {
    await testClient.end();  // Close the connection after the test
  }
});

app.post('/sulprev/process-envelope', async (req, res) => {
  try {
    const { name, email, pdfPath } = req.body;

    if (!name || !email || !pdfPath) {
      return res.status(400).json({ error: 'Missing required fields: name, email, or pdfPath' });
    }

    // Step 1: Create Envelope
    const envelopeId = await createEnvelope();
    console.log(`Envelope created: ${envelopeId}`);

    // Step 2: Add Document to Envelope
    const documentId = await addDocumentToEnvelope(envelopeId, pdfPath);
    console.log(`Document added: ${documentId}`);

    // Step 3: Add Signer to Envelope
    const signerId = await addSignerToEnvelope(envelopeId, name, email);
    console.log(`Signer added: ${signerId}`);

    // Step 4: Add Requirement to Envelope
    await addRequirementToEnvelope(envelopeId, documentId, signerId);
    console.log(`Requirement added`);

    // Step 5: Add Evidence Requirement to Envelope
    await addEvidenceRequirementToEnvelope(envelopeId, documentId, signerId);
    console.log(`Evidence requirement added`);

    // Step 6: Update Envelope Status
    await updateEnvelopeStatus(envelopeId, name);
    console.log(`Envelope status updated`);

    // Step 7: Create Notification
    await createNotification(envelopeId);
    console.log(`Notification created`);

    // Response
    res.status(200).json({
      message: 'Envelope process completed successfully!',
      envelopeId,
      documentId,
      signerId,
    });

  } catch (error) {
    console.error('Error processing envelope:', error);
    res.status(500).json({ error: error.message });
  }
});

function pdfToBase64(pdfPath) {
  try {
    const pdfBuffer = fs.readFileSync(pdfPath);
    return pdfBuffer.toString('base64');
  } catch (error) {
    console.error('Error reading PDF file:', error);
    return null;
  }
}

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
    const timestamp = moment().format('YYYYMMDD_HHmmss');
    const outputPdfPath1 = `./${timestamp}-1.pdf`;
    const outputPdfPath2 = `./${timestamp}-2.pdf`;

    const imagePaths1 = ['./output_images/output1.jpg', './output_images/output2.jpg', './pdf_images/pdf3.jpg'];
    await convertImagesToPdf(imagePaths1, outputPdfPath1);

    const imagePaths2 = ['./output_images/output4.jpg'];
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

const createEnvelope = async () => {
  try {
    const now = new Date();
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + 30); // Set deadline 30 days from today

    const formattedName = now.toISOString().replace(/[:.]/g, '-'); // Format datetime for filename
    const formattedDeadline = deadline.toISOString(); // Convert to ISO format

    const response = await axios.post(
      'https://app.clicksign.com/api/v3/envelopes',
      {
        data: {
          type: 'envelopes',
          attributes: {
            name: formattedName,
            locale: 'pt-BR',
            auto_close: true,
            remind_interval: 3,
            block_after_refusal: true,
            deadline_at: formattedDeadline,
          },
        },
      },
      {
        headers: {
          Authorization: process.env.CLICKSIGN_TOKEN, // Use an environment variable for security
          'Content-Type': 'application/json',
          'User-Agent': 'nuxter/1.0',
        },
      }
    );

    // Extract and return the first "id" field
    const envelopeId = response.data?.data?.id;
    
    if (!envelopeId) {
      throw new Error('Envelope ID not found in response');
    }

    return envelopeId;
  } catch (error) {
    console.error('Error creating envelope:', error.response?.data || error.message);
    throw error;
  }
};

const addDocumentToEnvelope = async (envelopeId, pdfPath) => {
  try {
    const filename = pdfPath.split('/').pop().replace('.pdf', ''); // Extract filename without extension
    const pdfBase64 = pdfToBase64(pdfPath);
    const formattedFilename = `${filename}.pdf`; // Ensure filename ends with .pdf
    const contentBase64 = `data:application/pdf;base64,${pdfBase64}`; // Ensure correct format
    console.log(pdfPath[0]);
    const response = await axios.post(
      `https://app.clicksign.com/api/v3/envelopes/${envelopeId}/documents`,
      {
        data: {
          type: 'documents',
          attributes: {
            filename: formattedFilename,
            content_base64: contentBase64,
            metadata: {
              key: 'value', // Adjust metadata as needed
            },
          },
        },
      },
      {
        headers: {
          Authorization: process.env.CLICKSIGN_TOKEN, // Use an env variable for security
          'Content-Type': 'application/json',
          'User-Agent': 'insomnia/10.3.0',
        },
      }
    );

    // Extract and return the first "id" field
    const documentId = response.data?.data?.id;

    if (!documentId) {
      throw new Error('Document ID not found in response');
    }

    return documentId;
  } catch (error) {
    console.error('Error adding document to envelope:', error.response?.data || error.message);
    throw new Error(error.response?.data || error.message);
  }
};

const addSignerToEnvelope = async (envelopeId, name, email) => {
  try {
    const response = await axios.post(
      `https://app.clicksign.com/api/v3/envelopes/${envelopeId}/signers`,
      {
        data: {
          type: 'signers',
          attributes: {
            name: name,
            email: email,
            refusable: true,
            group: '3',
            communicate_events: {
              document_signed: 'email',
              signature_request: 'email',
              signature_reminder: 'email',
            },
          },
        },
      },
      {
        headers: {
          Authorization: process.env.CLICKSIGN_TOKEN, // Use an env variable for security
          'Content-Type': 'application/json',
          'User-Agent': 'insomnia/10.3.0',
        },
      }
    );

    // Extract and return the first "id" field from the response JSON
    const signerId = response.data?.data?.id;

    if (!signerId) {
      throw new Error('Signer ID not found in response');
    }

    return signerId;
  } catch (error) {
    console.error('Error adding signer to envelope:', error.response?.data || error.message);
    throw new Error(error.response?.data || error.message);
  }
};

const addRequirementToEnvelope = async (envelopeId, documentId, signerId) => {
  try {
    const response = await axios.post(
      `https://app.clicksign.com/api/v3/envelopes/${envelopeId}/requirements`,
      {
        data: {
          type: 'requirements',
          attributes: {
            action: 'agree',
            role: 'sign',
          },
          relationships: {
            document: {
              data: { type: 'documents', id: documentId },
            },
            signer: {
              data: { type: 'signers', id: signerId },
            },
          },
        },
      },
      {
        headers: {
          Authorization: process.env.CLICKSIGN_TOKEN, // Use an env variable for security
          'Content-Type': 'application/vnd.api+json',
          'User-Agent': 'insomnia/10.3.0',
        },
      }
    );

    // Extract and return the first "id" field from the response JSON
    const requirementId = response.data?.data?.id;

    if (!requirementId) {
      throw new Error('Requirement ID not found in response');
    }

    return requirementId;
  } catch (error) {
    console.error('Error adding requirement to envelope:', error.response?.data || error.message);
    throw new Error(error.response?.data || error.message);
  }
};

const addEvidenceRequirementToEnvelope = async (envelopeId, documentId, signerId) => {
  try {
    const response = await axios.post(
      `https://app.clicksign.com/api/v3/envelopes/${envelopeId}/requirements`,
      {
        data: {
          type: 'requirements',
          attributes: {
            action: 'provide_evidence',
            auth: 'email',
          },
          relationships: {
            document: {
              data: { type: 'documents', id: documentId },
            },
            signer: {
              data: { type: 'signers', id: signerId },
            },
          },
        },
      },
      {
        headers: {
          Authorization: process.env.CLICKSIGN_TOKEN, // Use an env variable for security
          'Content-Type': 'application/vnd.api+json',
          'User-Agent': 'insomnia/10.3.0',
        },
      }
    );

    // Extract and return the first "id" field from the response JSON
    const requirementId = response.data?.data?.id;

    if (!requirementId) {
      throw new Error('Requirement ID not found in response');
    }

    return requirementId;
  } catch (error) {
    console.error('Error adding evidence requirement to envelope:', error.response?.data || error.message);
    throw new Error(error.response?.data || error.message);
  }
};

const updateEnvelopeStatus = async (envelopeId, name) => {
  try {
    // Calculate the deadline date (30 days from now)
    const deadlineAt = new Date();
    deadlineAt.setDate(deadlineAt.getDate() + 30); // Add 30 days

    // Format the deadline to the required format
    const formattedDeadlineAt = deadlineAt.toISOString(); // Example: "2025-03-11T18:02:12.933-03:00"

    const response = await axios.patch(
      `https://app.clicksign.com/api/v3/envelopes/${envelopeId}`,
      {
        data: {
          id: envelopeId,
          type: 'envelopes',
          attributes: {
            status: 'running',
            name: name,
            locale: 'pt-BR',
            auto_close: true,
            remind_interval: 7,
            block_after_refusal: true,
            deadline_at: formattedDeadlineAt, // Set deadline to 30 days in the future
          },
        },
      },
      {
        headers: {
          Authorization: process.env.CLICKSIGN_TOKEN, // Use an env variable for security
          'Content-Type': 'application/vnd.api+json',
          'User-Agent': 'insomnia/10.3.0',
        },
      }
    );

    // Return the response data, including the updated envelope
    return response.data;
  } catch (error) {
    console.error('Error updating envelope status:', error.response?.data || error.message);
    throw new Error(error.response?.data || error.message);
  }
};

const createNotification = async (envelopeId) => {
  try {
    const response = await axios.post(
      `https://app.clicksign.com/api/v3/envelopes/${envelopeId}/notifications`,
      {
        data: {
          type: 'notifications',
          attributes: {
            message: '',
          },
        },
      },
      {
        headers: {
          Authorization: process.env.CLICKSIGN_TOKEN, // Use an env variable for security
          'Content-Type': 'application/vnd.api+json',
          'User-Agent': 'insomnia/10.3.0',
        },
      }
    );

    // Return the "id" from the response
    return response.data.data.id;
  } catch (error) {
    console.error('Error creating notification:', error.response?.data || error.message);
    throw new Error(error.response?.data || error.message);
  }
};

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}!`);
});