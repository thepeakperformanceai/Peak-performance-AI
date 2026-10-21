// controllers/methodology.controller.js
// "How your OVR is calculated": public methodology pages, and the personal
// breakdown of a report (owner, or anyone holding its private link).

const crypto = require('crypto');
const Report = require('../models/Report.model');
const { ownerFilter } = require('../middleware/auth.middleware');
const { methodology, reportBreakdown, SPORTS } = require('../services/methodology.service');

const notFound = (msg) => {
  const err = new Error(msg);
  err.statusCode = 404;
  return err;
};

/** GET /api/methodology — the sports that have a methodology page (public). */
const listSports = (req, res) => {
  const { CLIENT_PAGES } = require('../services/clientMethodology.service');
  res.json({
    sports: [...Object.entries(SPORTS), ...Object.entries(CLIENT_PAGES).map(([k, p]) => [k, p.name])]
      .map(([key, name]) => ({ key, name, path: `/how-we-score/${key}` }))
  });
};

/** GET /api/methodology/:sport — public, generated from the scoring configs. */
const getMethodology = (req, res, next) => {
  try {
    res.set('Cache-Control', 'public, max-age=300');
    res.json(methodology(String(req.params.sport || '').toLowerCase()));
  } catch (e) {
    next(e);
  }
};

const breakdownOr404 = (report) => {
  const b = reportBreakdown(report);
  if (!b) throw notFound('This report has no score breakdown (it was made before engine scoring).');
  return b;
};

/** GET /api/report/:id/breakdown — logged in, own reports (admins: all). */
const getBreakdown = async (req, res, next) => {
  try {
    const report = await Report.findOne(ownerFilter(req, { _id: req.params.id }));
    if (!report) throw notFound('Report not found');
    res.json({ breakdown: breakdownOr404(report), shareToken: report.breakdownToken || null });
  } catch (e) {
    next(e);
  }
};

/**
 * POST /api/report/:id/breakdown-link — creates (or returns) the private,
 * unguessable link for this report's breakdown. DELETE turns it off.
 */
const createLink = async (req, res, next) => {
  try {
    const report = await Report.findOne(ownerFilter(req, { _id: req.params.id }));
    if (!report) throw notFound('Report not found');
    breakdownOr404(report);
    if (!report.breakdownToken) {
      report.breakdownToken = crypto.randomBytes(24).toString('base64url');   // 192 bits
      await report.save();
    }
    res.json({ token: report.breakdownToken, path: `/breakdown/${report.breakdownToken}` });
  } catch (e) {
    next(e);
  }
};

const deleteLink = async (req, res, next) => {
  try {
    const report = await Report.findOne(ownerFilter(req, { _id: req.params.id }));
    if (!report) throw notFound('Report not found');
    report.breakdownToken = undefined;
    await report.save();
    res.json({ deleted: true });
  } catch (e) {
    next(e);
  }
};

/** GET /api/breakdown/:token — public, but only with the private link. */
const getSharedBreakdown = async (req, res, next) => {
  try {
    const token = String(req.params.token || '');
    if (!/^[A-Za-z0-9_-]{32}$/.test(token)) throw notFound('Link not found');
    const report = await Report.findOne({ breakdownToken: token });
    if (!report) throw notFound('Link not found');
    res.set('Cache-Control', 'private, no-store');
    res.set('X-Robots-Tag', 'noindex');
    res.json({ breakdown: breakdownOr404(report) });
  } catch (e) {
    next(e);
  }
};

module.exports = { listSports, getMethodology, getBreakdown, createLink, deleteLink, getSharedBreakdown };
