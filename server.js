const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const XLSX = require('xlsx');

const app = express();

// Middleware to parse incoming JSON and form data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ensure 'uploads' directory exists on Render ephemeral storage
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer Disk Storage Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    const allowedExts = ['.dxf', '.xlsx', '.xls', '.pdf'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Allowed extensions: .dxf, .xlsx, .xls, .pdf'));
    }
  }
});

// Serve static assets from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// In-Memory baseline state for EHV Cable Tracking Portal
let projectState = {
  totalRouteLength: "1250",
  clusterName: "Northern Cluster",
  voltageRating: "132kV / 400kV Single Core",
  jointBays: 2,
  systemPhase: "PHASE 2: ACTIVE TRACKING",
  cadFile: null,
  excelFile: null,
  pdfFile: null,
  boqItems: []
};

// GET current parameters
app.get('/api/parameters', (req, res) => {
  res.json({ success: true, data: projectState });
});

// POST save route parameters
app.post('/api/save-parameters', (req, res) => {
  const { totalRouteLength, clusterName, voltageRating } = req.body;
  if (totalRouteLength !== undefined) projectState.totalRouteLength = totalRouteLength;
  if (clusterName !== undefined) projectState.clusterName = clusterName;
  if (voltageRating !== undefined) projectState.voltageRating = voltageRating;

  res.json({
    success: true,
    message: "Route & Circuit parameters updated successfully.",
    data: projectState
  });
});

// POST Upload CAD (.DXF)
app.post('/api/upload-cad', upload.single('cadFile'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No CAD file uploaded." });
    }

    const content = fs.readFileSync(req.file.path, 'utf8');
    let estimatedLength = 1250;
    let detectedJointBays = 2;

    const polylineMatches = (content.match(/LWPOLYLINE|POLYLINE/g) || []).length;
    if (polylineMatches > 0) {
      estimatedLength = polylineMatches * 250;
      detectedJointBays = Math.max(1, Math.floor(estimatedLength / 600));
    }

    projectState.cadFile = req.file.originalname;
    projectState.totalRouteLength = String(estimatedLength);
    projectState.jointBays = detectedJointBays;

    res.json({
      success: true,
      message: "[ADMIN ACTION] CAD Route Drawing uploaded and parsed successfully.",
      file: req.file.originalname,
      routeLength: projectState.totalRouteLength,
      jointBays: projectState.jointBays
    });
  } catch (err) {
    console.error("CAD Error:", err);
    res.status(500).json({ success: false, message: "Error parsing CAD file: " + err.message });
  }
});

// POST Upload Excel BOQ (.XLSX)
app.post('/api/upload-excel', upload.single('excelFile'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No Excel BOQ file uploaded." });
    }

    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

    projectState.excelFile = req.file.originalname;
    projectState.boqItems = jsonData;

    res.json({
      success: true,
      message: "[ADMIN ACTION] Excel BOQ uploaded & parsed successfully.",
      file: req.file.originalname,
      rowCount: jsonData.length
    });
  } catch (err) {
    console.error("Excel Error:", err);
    res.status(500).json({ success: false, message: "Error parsing Excel file: " + err.message });
  }
});

// POST Upload EHV PDF Specs
app.post('/api/upload-pdf', upload.single('pdfFile'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No PDF file uploaded." });
    }

    projectState.pdfFile = req.file.originalname;

    res.json({
      success: true,
      message: "[ADMIN ACTION] EHV PDF Specification linked successfully.",
      file: req.file.originalname
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Error uploading PDF: " + err.message });
  }
});

// Catch-all route to serve single-page portal
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Dynamic Port Assignment for Render
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`EHV Cable Tracking server live on port ${PORT}`);
});
