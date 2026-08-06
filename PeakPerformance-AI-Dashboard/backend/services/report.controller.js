const fs = require('fs');
const Session = require('../models/Session.model');
const { generateViaMainBackend } = require('../services/reportClient.service');
const { buildMemberObject } = require('../services/memberView.service');

const fail = (m, c) => { const e = new Error(m); e.statusCode = c; return e; };
const cleanup = (files = []) => files.forEach(f => { try { fs.unlinkSync(f.path); } catch (_) {} });

/**
 * POST /api/report/generate   (member)
 * Member uploads their assessment file(s). We forward to the main backend's
 * engine, then store the returned report as a Session in THIS database.
 */
const generateReport = async (req, res, next) => {
  let files = [];
  try {
    if (!req.files || req.files.length === 0) throw fail('No files uploaded.', 400);
    files = req.files;

    // Profile: use what the member/owner sent, backfilled from their member profile
    let profile = {};
    if (req.body.profile) {
      try { profile = JSON.parse(req.body.profile); } catch (_) { throw fail('Invalid profile JSON.', 400); }
    }
    profile.name = profile.name || req.user.name;
    profile.age = profile.age || req.user.memberProfile?.age || undefined;
    profile.sport = profile.sport || req.user.memberProfile?.sport || undefined;
    // trainingLevel is required by the engine; default if not supplied
    profile.trainingLevel = profile.trainingLevel || 'Semi-Professional';

    const result = await generateViaMainBackend(files, profile);
    cleanup(files);

    const session = await Session.create({
      member: req.user._id,
      gym: req.user.gym,
      athleteName: result.athleteProfile?.name || profile.name,
      age: result.athleteProfile?.age ?? profile.age ?? null,
      sport: result.athleteProfile?.sport || profile.sport || '',
      dashboardMetrics: result.dashboardMetrics || {},
      reportContent: result.reportContent || {}
    });

    res.status(201).json({
      message: 'Report generated.',
      sessionId: session._id,
      reportContent: session.reportContent,
      dashboardMetrics: session.dashboardMetrics
    });
  } catch (error) {
    cleanup(files);
    // Surface a useful message if the main backend rejected us
    if (error.response) {
      error.statusCode = error.response.status;
      error.message = error.response.data?.error || 'Report engine error.';
    }
    next(error);
  }
};

/**
 * GET /api/report/mine   (member) — this member's own sessions/reports
 */
const myReports = async (req, res, next) => {
  try {
    const sessions = await Session.find({ member: req.user._id })
      .sort({ createdAt: -1 })
      .select('athleteName sport dashboardMetrics createdAt');
    res.json(sessions);
  } catch (e) { next(e); }
};

/**
 * GET /api/report/:id   (member owns it, or owner of the same gym)
 */
const getReport = async (req, res, next) => {
  try {
    const session = await Session.findById(req.params.id);
    if (!session) throw fail('Report not found.', 404);
    const isOwnerOfGym = req.user.role === 'gymOwner' && String(session.gym) === String(req.user.gym);
    const isMine = String(session.member) === String(req.user._id);
    if (!isOwnerOfGym && !isMine) throw fail('Report not found.', 404);
    res.json(session);
  } catch (e) { next(e); }
};

/**
 * GET /api/report/my-progress   (member)
 * Returns THIS member's own dashboard object (bio + history + charts +
 * workoutSplit + latest report content) — powers the member's own view.
 * Also returns hasReports so the frontend can gate first-login on generation.
 */
const myProgress = async (req, res, next) => {
  try {
    const sessions = await Session.find({ member: req.user._id }).lean();
    const view = buildMemberObject(req.user, sessions);
    res.json({ hasReports: sessions.length > 0, ...view });
  } catch (e) { next(e); }
};

module.exports = { generateReport, myReports, getReport, myProgress };
