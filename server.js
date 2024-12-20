const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const bodyParser = require('body-parser');

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

const port = 3000;
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
