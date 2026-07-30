const pdfParse = require('pdf-parse');
const fs = require('fs');
const path = require('path');

/**
 * Extracts text from PDF and detects PDF type (HumanTrak or Dynamo)
 */
const extractPdfText = async (filePath) => {
  try {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(dataBuffer);
    const text = data.text;

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
      pages: data.numpages
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
