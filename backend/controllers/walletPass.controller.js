// Wallet card (Apple / Google Wallet pass) for a report.
//
//   GET  /api/report/:id/wallet-pass            what the pass will say + whether one exists
//   GET  /api/report/:id/wallet-pass/strip.png  preview of the strip image (logged in)
//   POST /api/report/:id/wallet-pass            create the pass, or update the athlete's
//                                               existing pass after a retest
//   GET  /api/wallet/strip/:token.png           public strip image Passcreator downloads

const Report = require('../models/Report.model');
const { ownerFilter } = require('../middleware/auth.middleware');
const { renderStrip } = require('../services/walletStrip.service');
const walletPass = require('../services/walletPass.service');

const notFound = () => {
  const err = new Error('Report not found');
  err.statusCode = 404;
  return err;
};

const escapeRegex = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The athlete's latest earlier report that already has a pass (same login, same name). */
const previousPassReport = (req, report) => Report.findOne(ownerFilter(req, {
  _id: { $ne: report._id },
  athleteName: new RegExp(`^\\s*${escapeRegex(String(report.athleteName || '').trim())}\\s*$`, 'i'),
  'walletPass.identifier': { $exists: true }
})).sort({ createdAt: -1 });

const publicBaseUrl = (req) => {
  const env = (process.env.PUBLIC_API_URL || '').trim().replace(/\/+$/, '');
  if (env) return env;
  const proto = (req.get('x-forwarded-proto') || req.protocol || 'https').split(',')[0].trim();
  return `${proto}://${req.get('host')}`;
};

const sendPng = (res, png, maxAge) => {
  res.set('Content-Type', 'image/png');
  res.set('Cache-Control', `public, max-age=${maxAge}`);
  res.send(png);
};

const getWalletPass = async (req, res, next) => {
  try {
    const report = await Report.findOne(ownerFilter(req, { _id: req.params.id }));
    if (!report) throw notFound();
    const values = walletPass.passValues(report);
    const previous = report.walletPass?.identifier ? null : await previousPassReport(req, report);
    res.json({
      values,
      walletPass: report.walletPass?.identifier
        ? { link: report.walletPass.link, email: report.walletPass.email, sentAt: report.walletPass.sentAt, updatedAt: report.walletPass.updatedAt }
        : null,
      // A retest: the new results go onto the pass the athlete already has.
      updatesPreviousPass: previous ? { reportId: previous._id, testDate: previous.testDate, link: previous.walletPass.link } : null,
      configured: !!(process.env.PASSCREATOR_API_KEY && process.env.PASSCREATOR_TEMPLATE_ID)
    });
  } catch (error) {
    next(error);
  }
};

const previewStrip = async (req, res, next) => {
  try {
    const report = await Report.findOne(ownerFilter(req, { _id: req.params.id }));
    if (!report) throw notFound();
    sendPng(res, renderStrip(report.scoring), 0);
  } catch (error) {
    next(error);
  }
};

const publicStrip = async (req, res, next) => {
  try {
    const token = String(req.params.token || '').replace(/\.png$/i, '');
    if (!/^[a-f0-9]{48}$/.test(token)) throw notFound();
    const report = await Report.findOne({ 'walletPass.imageToken': token });
    if (!report) throw notFound();
    sendPng(res, renderStrip(report.scoring), 3600);
  } catch (error) {
    next(error);
  }
};

const createOrUpdateWalletPass = async (req, res, next) => {
  try {
    const report = await Report.findOne(ownerFilter(req, { _id: req.params.id }));
    if (!report) throw notFound();

    const { email, fix, retestBy, sendEmail } = req.body || {};
    const values = walletPass.passValues(report, { email, fix, retestBy });
    renderStrip(report.scoring); // fails early (no OVR) before anything is sent

    const imageToken = report.walletPass?.imageToken || walletPass.newImageToken();
    // Save the image key first: Passcreator downloads the strip from the public
    // URL during the call below, so the key has to be in the database already.
    if (report.walletPass?.imageToken !== imageToken) {
      report.walletPass = { ...(report.walletPass || {}), imageToken };
      report.markModified('walletPass');
      await report.save();
    }
    const stripUrl = `${publicBaseUrl(req)}/api/wallet/strip/${imageToken}.png`;
    const body = walletPass.passBody(values, stripUrl, { sendEmail: !!sendEmail });

    let identifier = report.walletPass?.identifier;
    let link = report.walletPass?.link;
    let action;
    if (identifier) {
      await walletPass.updatePass(identifier, body);
      action = 'updated';
    } else {
      const previous = await previousPassReport(req, report);
      if (previous) {
        identifier = previous.walletPass.identifier;
        link = previous.walletPass.link;
        await walletPass.updatePass(identifier, body);
        action = 'updated-after-retest';
      } else {
        ({ identifier, link } = await walletPass.createPass(body));
        action = 'created';
      }
    }

    const now = new Date();
    report.walletPass = {
      identifier,
      link,
      imageToken,
      email: values.email || report.walletPass?.email || '',
      sentAt: sendEmail && values.email ? now : report.walletPass?.sentAt,
      createdAt: report.walletPass?.createdAt || now,
      updatedAt: now
    };
    report.markModified('walletPass');
    await report.save();

    res.json({ action, link, values, emailed: !!(sendEmail && values.email) });
  } catch (error) {
    next(error);
  }
};

module.exports = { getWalletPass, previewStrip, publicStrip, createOrUpdateWalletPass, publicBaseUrl };
