const Report = require('../models/Report.model');
const Exercise = require('../models/Exercise.model');
const pdfExtractService = require('../services/pdfExtract.service');
const promptBuilder = require('../services/promptBuilder.service');
const aiEngine = require('../services/aiEngine.service');
const reportParser = require('../services/reportParser.service');
const profileParser = require('../services/profileParser.service');
const { ownerFilter } = require('../middleware/auth.middleware');
const { extractDashboardMetrics } = require('../services/metricExtract.service');
const footballReport = require('../services/footballReport.service');
const scoredReport = require('../services/scoredReport.service');


/**
 * POST /api/report/generate-content   (service-to-service, no user session)
 * Runs the SAME pipeline as generateReport but RETURNS the report content and
 * saves nothing. The gym-dashboard backend calls this, then stores the result
 * in its own database. Auth: x-service-key (serviceAuth middleware).
 */
const generateReportContent = async (req, res, next) => {
  let uploadedFiles = [];
  try {
    if (!req.files || req.files.length === 0) {
      const err = new Error('No PDF files uploaded'); err.statusCode = 400; throw err;
    }
    if (!req.body.profile) {
      const err = new Error('Athlete profile JSON is required'); err.statusCode = 400; throw err;
    }
    uploadedFiles = req.files;

    let athleteProfile;
    try { athleteProfile = JSON.parse(req.body.profile); }
    catch (e) { const err = new Error('Invalid athlete profile JSON'); err.statusCode = 400; throw err; }

    const pdfData = await pdfExtractService.processPdfs(uploadedFiles);

    const exercises = await Exercise.find().select('name targets');
    if (exercises.length === 0) {
      const err = new Error('No exercises found in database. Please seed exercises first.');
      err.statusCode = 500; throw err;
    }

    const systemPrompt = promptBuilder.getSystemPrompt();
    const userPrompt = promptBuilder.buildUserPrompt(athleteProfile, pdfData, exercises);
    const aiResponse = await aiEngine.generateReport(systemPrompt, userPrompt);

    const reportContent = reportParser.parseReportJson(aiResponse, exercises);
    const validatedReport = reportParser.validateAsymmetry(reportContent);
    const dashboardMetrics = extractDashboardMetrics(validatedReport);

    pdfExtractService.cleanupTempFiles(uploadedFiles);

    res.json({
      reportContent: validatedReport,
      dashboardMetrics,
      athleteProfile,
      sourcePdfData: pdfData.map(p => ({ type: p.type, text: p.text }))
    });
  } catch (error) {
    try { pdfExtractService.cleanupTempFiles(uploadedFiles); } catch (_) {}
    next(error);
  }
};

const generateReport = async (req, res, next) => {
  let uploadedFiles = [];

  try {
    if (!req.files || req.files.length === 0) {
      const err = new Error('No PDF files uploaded');
      err.statusCode = 400;
      throw err;
    }

    if (!req.body.profile) {
      const err = new Error('Athlete profile JSON is required');
      err.statusCode = 400;
      throw err;
    }

    uploadedFiles = req.files;

    let athleteProfile;
    try {
      athleteProfile = JSON.parse(req.body.profile);
    } catch (e) {
      const err = new Error('Invalid athlete profile JSON');
      err.statusCode = 400;
      throw err;
    }

    const pdfData = await pdfExtractService.processPdfs(uploadedFiles);
    console.log(`Extracted ${pdfData.length} PDFs`);

    const exercises = await Exercise.find().select('name targets');
    if (exercises.length === 0) {
      const err = new Error('No exercises found in database. Please seed exercises first.');
      err.statusCode = 500;
      throw err;
    }

    const systemPrompt = promptBuilder.getSystemPrompt();
    const userPrompt = promptBuilder.buildUserPrompt(athleteProfile, pdfData, exercises);

    const aiResponse = await aiEngine.generateReport(systemPrompt, userPrompt);
    const reportContent = reportParser.parseReportJson(aiResponse, exercises);
    const validatedReport = reportParser.validateAsymmetry(reportContent);

    const report = new Report({
      user: req.user._id,
      athleteName: athleteProfile.name,
      age: athleteProfile.age,
      sport: athleteProfile.sport,
      dob: athleteProfile.dob || validatedReport.dob || '',
      weight: athleteProfile.weight || validatedReport.weight || '',
      academy: athleteProfile.academy || validatedReport.academy || '',
      position: athleteProfile.position || '',
      trainingLevel: athleteProfile.trainingLevel,
      knownInjuries: athleteProfile.knownInjuries || '',
      customParams: athleteProfile.customParams || {},
      testDate: athleteProfile.testDate || new Date().toLocaleDateString(),
      practitioner: athleteProfile.practitioner || 'Not specified',
      reportContent: validatedReport,
      rawAiResponse: aiResponse,
      sourcePdfData: pdfData.map(p => ({ type: p.type, text: p.text }))
    });

    await report.save();
    console.log(`Report saved with ID: ${report._id}`);

    pdfExtractService.cleanupTempFiles(uploadedFiles);

    res.status(201).json({
      message: 'Report generated successfully',
      _id: report._id,
      reportId: report._id,
      athleteName: report.athleteName,
      age: report.age,
      sport: report.sport,
      dob: report.dob,
      weight: report.weight,
      academy: report.academy,
      position: report.position,
      trainingLevel: report.trainingLevel,
      knownInjuries: report.knownInjuries,
      testDate: report.testDate,
      practitioner: report.practitioner,
      reportContent: report.reportContent,
      createdAt: report.createdAt
    });
  } catch (error) {
    if (uploadedFiles.length > 0) {
      pdfExtractService.cleanupTempFiles(uploadedFiles);
    }
    next(error);
  }
};

/**
 * POST /api/report/football - Football report from manually entered results.
 * Scores the session with the scoring engine (every number), then asks Gemini
 * for the words only. VALD PDFs are optional and kept as reference; they are
 * not sent to Gemini.
 */
const generateFootballReport = async (req, res, next) => {
  const uploadedFiles = req.files || [];
  try {
    let profileIn, footballIn;
    try {
      profileIn = JSON.parse(req.body.profile || '{}');
      footballIn = JSON.parse(req.body.football || '{}');
    } catch (e) {
      const err = new Error('Invalid football report JSON');
      err.statusCode = 400;
      throw err;
    }

    const { profile, session } = footballReport.validateFootballInput(profileIn, footballIn);

    const pdfData = uploadedFiles.length ? await pdfExtractService.processPdfs(uploadedFiles) : [];

    const { scored, payload, rawResponse, reportContent } =
      await footballReport.runFootballPipeline(profile, session);

    const report = new Report({
      user: req.user._id,
      athleteName: profile.name,
      age: profile.age,
      sport: 'Football',
      dob: profile.dob,
      weight: `${profile.bodyweight} kg`,
      bodyweightKg: profile.bodyweight,
      sex: profile.sex,
      position: profile.position,
      trainingLevel: profile.trainingLevel,
      knownInjuries: profile.knownInjuries,
      customParams: profile.customParams,
      testDate: profile.testDate,
      practitioner: profile.practitioner,
      reportContent,
      rawAiResponse: rawResponse,
      sourcePdfData: pdfData.map(p => ({ type: p.type, text: p.text })),
      footballSession: session,
      scoring: scored,
      scoringPayload: payload,
      configVersion: scored.config_version
    });
    await report.save();
    console.log(`Football report saved with ID: ${report._id} (OVR ${scored.ovr.value ?? 'pending'}, ${scored.config_version})`);

    if (uploadedFiles.length) pdfExtractService.cleanupTempFiles(uploadedFiles);

    res.status(201).json(reportResponse(report, 'Report generated successfully'));
  } catch (error) {
    if (uploadedFiles.length) {
      try { pdfExtractService.cleanupTempFiles(uploadedFiles); } catch (_) {}
    }
    next(error);
  }
};

const reportResponse = (report, message) => ({
  message,
  _id: report._id,
  reportId: report._id,
  athleteName: report.athleteName,
  age: report.age,
  sport: report.sport,
  dob: report.dob,
  weight: report.weight,
  academy: report.academy,
  position: report.position,
  trainingLevel: report.trainingLevel,
  knownInjuries: report.knownInjuries,
  testDate: report.testDate,
  practitioner: report.practitioner,
  reportContent: report.reportContent,
  createdAt: report.createdAt
});

/**
 * Regenerate for a football report: re-scores the stored entry with the
 * current config (so new benchmarks apply) and rewrites the text.
 */
/**
 * POST /api/report/padel and /api/report/cricket - reports from manually
 * entered results. Same pipeline as football (scoring engine for every
 * number, Gemini for the words, number check), with each sport's tests,
 * flags and dominant / bowling arm.
 */
const makeScoredReportHandler = (sportKey) => async (req, res, next) => {
  const uploadedFiles = req.files || [];
  try {
    const pipeline = scoredReport.forSport(sportKey);
    const displayName = pipeline.sport.displayName;

    let profileIn, resultsIn;
    try {
      profileIn = JSON.parse(req.body.profile || '{}');
      resultsIn = JSON.parse(req.body.results || '{}');
    } catch (e) {
      const err = new Error(`Invalid ${sportKey} report JSON`);
      err.statusCode = 400;
      throw err;
    }

    const { profile, session } = pipeline.validateInput(profileIn, resultsIn);

    const pdfData = uploadedFiles.length ? await pdfExtractService.processPdfs(uploadedFiles) : [];

    const { scored, payload, rawResponse, reportContent } = await pipeline.runPipeline(profile, session);

    const report = new Report({
      user: req.user._id,
      athleteName: profile.name,
      age: profile.age,
      sport: displayName,
      dob: profile.dob,
      weight: `${profile.bodyweight} kg`,
      bodyweightKg: profile.bodyweight,
      sex: profile.sex,
      position: profile.position,
      dominantHand: profile.dominantHand,
      trainingLevel: profile.trainingLevel,
      knownInjuries: profile.knownInjuries,
      customParams: profile.customParams,
      testDate: profile.testDate,
      practitioner: profile.practitioner,
      reportContent,
      rawAiResponse: rawResponse,
      sourcePdfData: pdfData.map(p => ({ type: p.type, text: p.text })),
      scoringSport: sportKey,
      scoringSession: session,
      scoring: scored,
      scoringPayload: payload,
      configVersion: scored.config_version
    });
    await report.save();
    console.log(`${displayName} report saved with ID: ${report._id} (OVR ${scored.ovr.value ?? 'pending'}, ${scored.config_version})`);

    if (uploadedFiles.length) pdfExtractService.cleanupTempFiles(uploadedFiles);

    res.status(201).json(reportResponse(report, 'Report generated successfully'));
  } catch (error) {
    if (uploadedFiles.length) {
      try { pdfExtractService.cleanupTempFiles(uploadedFiles); } catch (_) {}
    }
    next(error);
  }
};

const generatePadelReport = makeScoredReportHandler('padel');
const generateCricketReport = makeScoredReportHandler('cricket');

/**
 * Regenerate for an engine-scored report of a non-football sport (padel):
 * re-scores the stored entry with the current config and rewrites the text.
 */
const regenerateScoredReport = async (existingReport, res) => {
  const pipeline = scoredReport.forSport(existingReport.scoringSport);
  const session = existingReport.scoringSession;
  const profile = {
    name: existingReport.athleteName,
    age: session.athlete.age,
    position: existingReport.position,
    dominantHand: existingReport.dominantHand,
    testDate: existingReport.testDate,
    additionalVald: existingReport.reportContent?.additionalVald || []
  };
  const { scored, payload, rawResponse, reportContent } = await pipeline.runPipeline(profile, session);

  existingReport.reportContent = reportContent;
  existingReport.rawAiResponse = rawResponse;
  existingReport.scoring = scored;
  existingReport.scoringPayload = payload;
  existingReport.configVersion = scored.config_version;
  await existingReport.save();
  console.log(`${existingReport.scoringSport} report re-scored with ID: ${existingReport._id} (${scored.config_version})`);

  res.json(reportResponse(existingReport, 'Report regenerated successfully'));
};

const regenerateFootballReport = async (existingReport, res) => {
  const profile = {
    name: existingReport.athleteName,
    age: existingReport.footballSession.athlete.age,
    position: existingReport.position,
    testDate: existingReport.testDate,
    additionalVald: existingReport.reportContent?.additionalVald || []
  };
  const { scored, payload, rawResponse, reportContent } =
    await footballReport.runFootballPipeline(profile, existingReport.footballSession);

  existingReport.reportContent = reportContent;
  existingReport.rawAiResponse = rawResponse;
  existingReport.scoring = scored;
  existingReport.scoringPayload = payload;
  existingReport.configVersion = scored.config_version;
  await existingReport.save();
  console.log(`Football report re-scored with ID: ${existingReport._id} (${scored.config_version})`);

  res.json(reportResponse(existingReport, 'Report regenerated successfully'));
};

/**
 * GET /api/report/:id - Get report by ID
 */
const getReport = async (req, res, next) => {
  try {
    const { id } = req.params;

    const report = await Report.findOne(ownerFilter(req, { _id: id }));

    if (!report) {
      const err = new Error('Report not found');
      err.statusCode = 404;
      throw err;
    }

    res.json({
      message: 'Report retrieved successfully',
      report
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/report/:id/export - Export report for PDF
 */
const exportReportPdf = async (req, res, next) => {
  try {
    const { id } = req.params;

    const report = await Report.findOne(ownerFilter(req, { _id: id }));

    if (!report) {
      const err = new Error('Report not found');
      err.statusCode = 404;
      throw err;
    }

    res.json({
      message: 'Report data for PDF export',
      report,
      filename: `PeakPerformance_${report.athleteName.replace(/\s+/g, '_')}_${report.testDate}.pdf`
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/report/:id/regenerate - Regenerate existing report
 */
const regenerateReport = async (req, res, next) => {
  try {
    const { id } = req.params;

    const existingReport = await Report.findOne(ownerFilter(req, { _id: id }));
    if (!existingReport) {
      const err = new Error('Report not found');
      err.statusCode = 404;
      throw err;
    }

    if (existingReport.footballSession) {
      return await regenerateFootballReport(existingReport, res);
    }
    if (existingReport.scoringSession && existingReport.scoringSport) {
      return await regenerateScoredReport(existingReport, res);
    }

    const exercises = await Exercise.find().select('name targets');
    if (exercises.length === 0) {
      const err = new Error('No exercises found in database');
      err.statusCode = 500;
      throw err;
    }

    const athleteProfile = {
      name: existingReport.athleteName,
      age: existingReport.age,
      sport: existingReport.sport,
      dob: existingReport.dob,
      weight: existingReport.weight,
      academy: existingReport.academy,
      position: existingReport.position,
      trainingLevel: existingReport.trainingLevel,
      knownInjuries: existingReport.knownInjuries,
      testDate: existingReport.testDate,
      practitioner: existingReport.practitioner,
      customParams: existingReport.customParams
    };

    const systemPrompt = promptBuilder.getSystemPrompt();

    // Reuse the real source PDF data captured at generation time so
    // regenerate re-analyzes actual VALD data instead of just the
    // previous report's finding titles.
    let userPrompt;
    if (existingReport.sourcePdfData && existingReport.sourcePdfData.length > 0) {
      userPrompt = promptBuilder.buildUserPrompt(athleteProfile, existingReport.sourcePdfData, exercises);
    } else {
      // Legacy report saved before sourcePdfData existed — fall back to
      // the old thin prompt, but flag it so it's obvious in logs.
      console.warn(`Report ${id} has no sourcePdfData — regenerating from finding titles only`);
      userPrompt = `Re-analyze and regenerate report for:
${JSON.stringify(athleteProfile)}

Previous findings indicated:
${existingReport.reportContent?.findings?.map(f => f.title).join(', ')}

Generate updated assessment based on same athlete profile.`;
    }

    const aiResponse = await aiEngine.generateReport(systemPrompt, userPrompt);
    console.log('Regenerated AI response received');

    const reportContent = reportParser.parseReportJson(aiResponse, exercises);
    const validatedReport = reportParser.validateAsymmetry(reportContent);

    existingReport.reportContent = validatedReport;
    existingReport.rawAiResponse = aiResponse;
    await existingReport.save();

    console.log(`Report regenerated with ID: ${existingReport._id}`);

    res.json({
      message: 'Report regenerated successfully',
      _id: existingReport._id,
      reportId: existingReport._id,
      athleteName: existingReport.athleteName,
      age: existingReport.age,
      sport: existingReport.sport,
      position: existingReport.position,
      trainingLevel: existingReport.trainingLevel,
      knownInjuries: existingReport.knownInjuries,
      testDate: existingReport.testDate,
      practitioner: existingReport.practitioner,
      reportContent: existingReport.reportContent,
      createdAt: existingReport.createdAt
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/report - Get all reports
 */
const getAllReports = async (req, res, next) => {
  try {
    const reports = await Report.find(ownerFilter(req))
      .select('athleteName age sport testDate createdAt _id')
      .sort({ createdAt: -1 });

    res.json({
      count: reports.length,
      reports
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/report/:id - Delete report
 */
const deleteReportById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const report = await Report.findOneAndDelete(ownerFilter(req, { _id: id }));

    if (!report) {
      const err = new Error('Report not found');
      err.statusCode = 404;
      throw err;
    }

    res.json({
      message: 'Report deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/report/extract - Extract athlete fields from PDFs (regex, no AI)
 */
const extractProfile = async (req, res, next) => {
  let uploadedFiles = [];
  try {
    if (!req.files || req.files.length === 0) {
      const err = new Error('No files uploaded');
      err.statusCode = 400;
      throw err;
    }
    uploadedFiles = req.files;
    const pdfData = await pdfExtractService.processPdfs(uploadedFiles);
    const combinedText = pdfData.map(p => p.text).join('\n');

    // Read this in Render logs to tune the regex to your real PDFs:
    console.log('--- AUTOFILL TEXT (first 1200 chars) ---');
    console.log(combinedText.slice(0, 1200));

    const profile = profileParser.parseProfileFromText(combinedText);
    pdfExtractService.cleanupTempFiles(uploadedFiles);
    res.json({ profile });
  } catch (error) {
    if (uploadedFiles.length > 0) pdfExtractService.cleanupTempFiles(uploadedFiles);
    next(error);
  }
};

module.exports = {
  generateReport,
  generateFootballReport,
  generatePadelReport,
  generateCricketReport,
  generateReportContent,
  getReport,
  exportReportPdf,
  regenerateReport,
  getAllReports,
  deleteReportById,
  extractProfile   // ← this line must be here
};