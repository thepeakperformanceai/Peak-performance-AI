const crypto = require('crypto');
const User = require('../models/User.model');
const Session = require('../models/Session.model');
const { buildMemberObject, shortSport } = require('../services/memberView.service');

const fail = (m, c) => { const e = new Error(m); e.statusCode = c; return e; };

/* ---- provisioning ---- */
const createMember = async (req, res, next) => {
  try {
    const { name, email, password, sex = '', age = null, sport = '' } = req.body;
    if (!name || !email || !password) throw fail('Member name, email and password are required.', 400);
    if (password.length < 8 || !/[A-Z]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
      throw fail('Password must be at least 8 characters and include a capital letter and a special character.', 400);
    }

    const cleanEmail = email.toLowerCase().trim();
    if (await User.findOne({ email: cleanEmail })) throw fail('An account with this email already exists.', 409);

    const member = new User({
      name: name.trim(), email: cleanEmail, password,      // owner-chosen; hashed by pre-save hook
      role: 'member', gym: req.user.gym, mustChangePassword: false,
      memberProfile: { sex: ['M','F'].includes(sex) ? sex : '', age: age ? Number(age) : null, sport }
    });
    await member.save();

    res.status(201).json({ message: 'Member created.', member: member.toPublic() });
  } catch (e) { next(e); }
};

/* ---- shared loader ---- */

const loadGymMembers = async (gymId) => {
  const members = await User.find({ role: 'member', gym: gymId }).lean();
  const sessions = await Session.find({ gym: gymId }).lean();
  const byMember = {};
  for (const s of sessions) (byMember[String(s.member)] = byMember[String(s.member)] || []).push(s);
  return members.map(mem => buildMemberObject(mem, byMember[String(mem._id)] || []));
};

/* ---- dashboard endpoints (shapes match the frontend) ---- */
const getMembers = async (req, res, next) => {
  try {
    const members = await loadGymMembers(req.user.gym);
    res.json(members.map(m => ({
      id: m.id, name: m.name, sex: m.sex, age: m.age,
      sport: m.sport, sessions: m.sessions, lastTested: m.lastTested
    })));
  } catch (e) { next(e); }
};

const getMemberDetail = async (req, res, next) => {
  try {
    const members = await loadGymMembers(req.user.gym);
    const member = members.find(m => m.id === req.params.id || String(m._id) === req.params.id);
    if (!member) throw fail('Member not found in your gym.', 404);
    res.json(member);
  } catch (e) { next(e); }
};

const getSquadComparison = async (req, res, next) => {
  try {
    const { sport = 'All', sex = 'All' } = req.query;
    const all = await loadGymMembers(req.user.gym);
    let members = all;
    if (sport !== 'All') {
      const target = sport === 'S&C' ? 'Strength & Conditioning' : sport;
      members = members.filter(m => m.sport === target);
    }
    if (sex !== 'All') members = members.filter(m => m.sex === sex);

    const avg = (arr, k) => arr.length
      ? parseFloat((arr.reduce((a, m) => a + m[k], 0) / arr.length).toFixed(1)) : 0;
    const bySport = (k) => {
      const g = {};
      for (const m of all) { if (m[k] == null) continue; (g[m.sport] = g[m.sport] || []).push(m[k]); }
      return Object.entries(g).map(([sp, v]) => ({
        sport: sp, shortName: shortSport(sp),
        value: parseFloat((v.reduce((a, x) => a + x, 0) / v.length).toFixed(1))
      }));
    };

    res.json({
      totalMembers: members.length,
      avgCMJ: avg(members.filter(m => m.latestCMJ != null), 'latestCMJ'),
      avgGrip: avg(members.filter(m => m.latestGrip != null), 'latestGrip'),
      avgAsym: avg(members.filter(m => m.latestAsym != null), 'latestAsym'),
      members: members.map(m => ({
        id: m.id, name: m.name, sex: m.sex, age: m.age, sport: m.sport,
        latestCMJ: m.latestCMJ, latestGrip: m.latestGrip, latestAsym: m.latestAsym
      })),
      groupAverages: { CMJ: bySport('latestCMJ'), Asymmetry: bySport('latestAsym') }
    });
  } catch (e) { next(e); }
};

module.exports = { createMember, getMembers, getMemberDetail, getSquadComparison, loadGymMembers };