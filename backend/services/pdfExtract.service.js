const pdfParse = require('pdf-parse');
const visionExtract = require('./visionExtract.service');
const fs = require('fs');
const path = require('path');

/**
 * Extracts text from PDF and detects PDF type (HumanTrak or Dynamo)
 */
const extractPdfText = async (filePath) => {
  try {
    const dataBuffer = fs.readFileSync(filePath);
    let data;
    try {
      data = await pdfParse(dataBuffer);
    } catch (parseErr) {
      const msg = (parseErr && parseErr.message || '').toLowerCase();
      const structural = msg.includes('xref') || msg.includes('invalid') ||
                         msg.includes('corrupt') || msg.includes('startxref') ||
                         msg.includes('stream') || msg.includes('fetch');
      if (structural) {
        const vision = await visionExtract.transcribeScannedPdf(filePath);
        return { text: vision.text, type: 'ManualIntake', pages: vision.pages || 1, scanned: true, header: vision.header, recovered: true };
      }
      throw parseErr;
    }
    const text = data.text;

    // A scanned / handwritten sheet has no text layer — pdf-parse returns ~nothing.
    // Route those to vision extraction instead of the text/regex path.
    const hasTextLayer = text.replace(/\s/g, '').length > 20;

    if (!hasTextLayer) {
      const vision = await visionExtract.transcribeScannedPdf(filePath);
      return {
        text: vision.text,
        type: 'ManualIntake',
        pages: data.numpages,
        scanned: true,
        header: vision.header
      };
    }

    // Detect PDF type based on content
    let pdfType = 'unknown';
    if (text.toLowerCase().includes('humantrak') || text.toLowerCase().includes('human trak')) {
      pdfType = 'HumanTrak';
    } else if (text.toLowerCase().includes('dynamo') || text.toLowerCase().includes('isokinetic')) {
      pdfType = 'Dynamo';
    }

    return {
      text: text.trim(),
      type: pdfType,
      pages: data.numpages,
      scanned: false
    };
  } catch (error) {
    throw new Error(`PDF extraction failed: ${error.message}`);
  }
};

/**
 * Processes all uploaded PDFs and returns structured data
 */
const processPdfs = async (files) => {
  try {
    const results = [];
    
    for (const file of files) {
      const extracted = await extractPdfText(file.path);
      results.push({
        filename: file.originalname,
        type: extracted.type,
        text: extracted.text,
        pages: extracted.pages,
        scanned: extracted.scanned || false,
        header: extracted.header || null,
        path: file.path
      });
    }

    return results;
  } catch (error) {
    throw new Error(`PDF processing failed: ${error.message}`);
  }
};

/**
 * Cleans up temporary PDF files
 */
const cleanupTempFiles = (files) => {
  try {
    files.forEach(file => {
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
    });
  } catch (error) {
    console.error('Cleanup error:', error.message);
  }
};

module.exports = {
  extractPdfText,
  processPdfs,
  cleanupTempFiles
};