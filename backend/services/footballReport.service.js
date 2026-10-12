// services/footballReport.service.js
// Football reports from manually entered test results (Football OVR Scoring
// Spec v1). The pipeline lives in scoredReport.service.js, shared with padel;
// this keeps football's original function names.

const { forSport, findUnsupportedNumbers } = require('./scoredReport.service');

const football = forSport('football');

module.exports = {
  TEST_INFO: football.TEST_INFO,
  SYSTEM_PROMPT: football.SYSTEM_PROMPT,
  validateFootballInput: football.validateInput,
  buildGeminiPayload: football.buildGeminiPayload,
  findUnsupportedNumbers,
  generateNarrative: football.generateNarrative,
  buildReportContent: football.buildReportContent,
  runFootballPipeline: football.runPipeline
};
