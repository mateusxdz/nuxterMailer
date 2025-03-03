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
const { Pool } = require('pg');
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

const pool = new Pool({
  host: '46.202.150.172',
  port: 5432,
  user: 'sulprev_user',
  password: 'Labs34673467@',
  database: 'sulprev',
  max: 10, // Maximum number of connections in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // Return error if connection takes longer than 2s
});

app.post('/sulprev/query-db', async (req, res) => {
  const { query, params } = req.body;

  try {
    const result = await pool.query(query, params || []);
    res.status(200).json(result.rows);
  } catch (error) {
    console.error('Database query error:', error);
    res.status(500).json({ error: 'Database query failed', details: error.message });
  } finally {
    try {
      await dbClient.end();
    } catch (endError) {
      console.error('Error closing DB connection:', endError);
    }
  }
});

app.post('/sulprev/process-envelope', async (req, res) => {
  try {
    const { name, email, pdfPath } = req.body;
    console.log(`--------name:  ${name}!`);
    console.log(`--------email:  ${email}!`);
    console.log(`--------pdfPath:  ${pdfPath}!`);
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

app.post('/sulprev/simulate-previdencia', async (req, res) => {
  const {
    contribuicao_mensal,
    idade_inicio_beneficio,
    aporte_inicial,
    modalidade,
    percentual_saldo,
    prazo_determinado,
    expectativa_vida
  } = req.body;

  try {
    // Validate inputs
    if (!contribuicao_mensal || !idade_inicio_beneficio || !aporte_inicial || !modalidade) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    // Prepare query parameters
    const queryParams = [
      contribuicao_mensal,
      idade_inicio_beneficio,
      aporte_inicial,
      modalidade,
      percentual_saldo || null,
      prazo_determinado || null,
      expectativa_vida || null
    ];

    // SQL query
    const query = `
      SELECT * 
      FROM simular_previdencia(
        $1, $2, $3, $4, $5, $6, $7
      );
    `;

    const result = await pool.query(query, queryParams || []);

    // Send the response with the result
    res.status(200).json({
      message: 'Simulation completed successfully',
      data: result.rows
    });
  } catch (error) {
    console.error('Error executing SQL query:', error);
    res.status(500).json({ error: error.toString() });
  } finally {
    try {
      await dbClient.end();
    } catch (endError) {
      console.error('Error closing DB connection:', endError);
    }
  }
});

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

app.post('/sulprev/save-page-1', async (req, res) => {
  const { p1_nomeCompleto, p1_dataNascimento, p1_cpf, p1_sexo, p1_estadoCivil,
    p1_nacionalidade, p1_nomeMae, p1_nomePai, p1_numeroFilhos,
    p1_nomeInstituidor, p1_cnpj, p1_numeroInstituidor } = req.body;

  try {
    // Insert into pessoa table
    const pessoaQuery = `
      INSERT INTO pessoa (nome_completo, data_nascimento, cpf, sexo, estado_civil, 
                          nacionalidade, nome_mae, nome_pai, numero_filhos) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING pessoa_id
    `;
    const pessoaValues = [p1_nomeCompleto, p1_dataNascimento, p1_cpf, p1_sexo,
      p1_estadoCivil, p1_nacionalidade, p1_nomeMae, p1_nomePai,
      p1_numeroFilhos];
    const pessoaResult = await dbClient.query(pessoaQuery, pessoaValues);
    const pessoaId = pessoaResult.rows[0].pessoa_id;

    // Insert into instituidor table
    const instituidorQuery = `
      INSERT INTO instituidor (nome, cnpj) 
      VALUES ($1, $2) RETURNING instituidor_id
    `;
    const instituidorValues = [p1_nomeInstituidor, p1_cnpj];
    const instituidorResult = await dbClient.query(instituidorQuery, instituidorValues);
    const instituidorId = instituidorResult.rows[0].instituidor_id;

    // Insert into adesao table (assuming adesao table is related to pessoa and instituidor)
    const adesaoQuery = `
      INSERT INTO adesao (pessoa_id, instituidor_id) 
      VALUES ($1, $2) RETURNING adesao_id
    `;
    const adesaoValues = [pessoaId, instituidorId];
    await dbClient.query(adesaoQuery, adesaoValues);

    res.status(200).json({ message: 'Page 1 data inserted successfully!' });
  } catch (error) {
    console.error('Error inserting page 1 data:', error);
    res.status(500).json({ error: error.toString() });
  }
});

app.post('/sulprev/save-page-2', async (req, res) => {
  const { p2_naturezaDoDocumento, p2_noDoDocumento, p2_orgaoExpedidor, p2_dataDeExpedicao,
    p2_naturalidade, p2_cpfDoRepresentanteLegal } = req.body;

  try {
    // Insert into documento table
    const documentoQuery = `
      INSERT INTO documento (natureza, numero, orgao_expedidor, data_expedicao) 
      VALUES ($1, $2, $3, $4) RETURNING documento_id
    `;
    const documentoValues = [p2_naturezaDoDocumento, p2_noDoDocumento, p2_orgaoExpedidor,
      p2_dataDeExpedicao];
    const documentoResult = await dbClient.query(documentoQuery, documentoValues);
    const documentoId = documentoResult.rows[0].documento_id;

    // Insert into representante_legal table
    const representanteLegalQuery = `
      INSERT INTO representante_legal (nome_completo, cpf) 
      VALUES ($1, $2) RETURNING representante_legal_id
    `;
    const representanteLegalValues = [p2_naturalidade, p2_cpfDoRepresentanteLegal];
    await dbClient.query(representanteLegalQuery, representanteLegalValues);

    res.status(200).json({ message: 'Page 2 data inserted successfully!' });
  } catch (error) {
    console.error('Error inserting page 2 data:', error);
    res.status(500).json({ error: error.toString() });
  }
});

app.post('/sulprev/save-page-3', async (req, res) => {
  const { p3_nomeRepresentanteLegal, p3_filiacao, p3_naturalidade, p3_cpfDoRepresentanteLegal,
    p3_idadeEntradaBeneficio, p3_valorContribuicaoMensal, p3_valorContribuicaoInstituidor,
    p3_capitalSegurado, p3_contribuicao, p3_contribuicaoTotal } = req.body;

  try {
    // Insert into adesao table
    const adesaoQuery = `
      INSERT INTO adesao (idade_entrada_beneficio, valor_contribuicao_mensal, 
                          valor_contribuicao_instituidor, capital_segurado, 
                          contribuicao_participante, contribuicao_total) 
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING adesao_id
    `;
    const adesaoValues = [p3_idadeEntradaBeneficio, p3_valorContribuicaoMensal,
      p3_valorContribuicaoInstituidor, p3_capitalSegurado,
      p3_contribuicao, p3_contribuicaoTotal];
    const adesaoResult = await dbClient.query(adesaoQuery, adesaoValues);
    const adesaoId = adesaoResult.rows[0].adesao_id;

    // Insert into representante_legal table
    const representanteLegalQuery = `
      INSERT INTO representante_legal (nome_completo, filiacao, cpf, adesao_id) 
      VALUES ($1, $2, $3, $4) RETURNING representante_legal_id
    `;
    const representanteLegalValues = [p3_nomeRepresentanteLegal, p3_filiacao,
      p3_cpfDoRepresentanteLegal, adesaoId];
    await dbClient.query(representanteLegalQuery, representanteLegalValues);

    res.status(200).json({ message: 'Page 3 data inserted successfully!' });
  } catch (error) {
    console.error('Error inserting page 3 data:', error);
    res.status(500).json({ error: error.toString() });
  }
});

app.post('/sulprev/save-page-5', async (req, res) => {
  const { p5_cep, p5_enderecoResidencial, p5_uf, p5_numero, p5_complemento, p5_bairro,
    p5_cidade, p5_dddETelefoneFixo, p5_dddETelefoneCelular, p5_justifique,
    p5_residenteBrasil, p5_pessoaExposta } = req.body;

  try {
    // Insert into pessoa table (additional fields)
    const pessoaQuery = `
      UPDATE pessoa
      SET cep = $1, endereco_residencial = $2, uf = $3, numero = $4, complemento = $5, 
          bairro = $6, cidade = $7, ddd_telefone_fixo = $8, ddd_telefone_celular = $9, 
          justificativa_exposicao = $10, residente_brasil = $11, pessoa_politicamente_exposta = $12
      WHERE cpf = $13
    `;
    const pessoaValues = [p5_cep, p5_enderecoResidencial, p5_uf, p5_numero, p5_complemento,
      p5_bairro, p5_cidade, p5_dddETelefoneFixo, p5_dddETelefoneCelular,
      p5_justifique, p5_residenteBrasil === 'true', p5_pessoaExposta === 'true',
      req.body.p1_cpf];
    await dbClient.query(pessoaQuery, pessoaValues);

    res.status(200).json({ message: 'Page 5 data inserted successfully!' });
  } catch (error) {
    console.error('Error inserting page 5 data:', error);
    res.status(500).json({ error: error.toString() });
  }
});

app.post('/sulprev/save-page-6', async (req, res) => {
  const { p6_ocupacaoPrincipal, p6_estadoCivil, p6_categoria, p6_obrigacoesFiscais,
    p6_residenteBrasil, p6_selectedRegime, p6_selectedSecondRegime,
    p6_vinculadoAoSegurado, p6_cpfDoSegurado, p6_grauDeParentesco } = req.body;

  try {
    // Insert into adesao table
    const adesaoQuery = `
      UPDATE adesao
      SET regime_previdencia = $1
      WHERE pessoa_id = (SELECT pessoa_id FROM pessoa WHERE cpf = $2)
    `;
    const adesaoValues = [p6_selectedRegime, req.body.p1_cpf];
    await dbClient.query(adesaoQuery, adesaoValues);

    // Insert into declaracao table
    const declaracaoQuery = `
      INSERT INTO declaracao (adesao_id, regime_previdencia, vinculado_ao_segurado, 
                              cpf_segurado, grau_parentesco) 
      VALUES ($1, $2, $3, $4, $5)
    `;
    const declaracaoValues = [adesaoId, p6_selectedSecondRegime, p6_vinculadoAoSegurado,
      p6_cpfDoSegurado, p6_grauDeParentesco];
    await dbClient.query(declaracaoQuery, declaracaoValues);

    res.status(200).json({ message: 'Page 6 data inserted successfully!' });
  } catch (error) {
    console.error('Error inserting page 6 data:', error);
    res.status(500).json({ error: error.toString() });
  }
});

app.post('/sulprev/charge-user', async (req, res) => {
  const { correlationID, value, name, email, phone, taxID } = req.body;

  try {
    const openPixResponse = await axios.post('https://api.openpix.com.br/api/openpix/v1/charge', {
      correlationID,
      value,
      customer: { name, email, phone, taxID }
    }, {
      headers: {
        Authorization: process.env.OPENPIX_AUTHORIZATION, // Use environment variable for API key
        'Content-Type': 'application/json'
      }
    });

    const charge = openPixResponse.data.charge;

    res.status(200).json({
      value: charge.value,
      identifier: charge.identifier,
      status: charge.status,
      brCode: charge.brCode,
      pixKey: charge.pixKey,
      paymentLinkUrl: charge.paymentLinkUrl,
      qrCodeImage: charge.qrCodeImage,
      globalID: charge.globalID
    });
  } catch (error) {
    console.error("Error creating charge:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to create charge", details: error.response?.data || error.message });
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