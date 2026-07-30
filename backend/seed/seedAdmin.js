const User = require('../models/User.model');

const parseAdminEntries = () => {
  const entries = new Map();
  const sharedPassword = (process.env.AUTH_PASSWORD || '').trim();

  const addEntry = (email, password) => {
    const normalizedEmail = (email || '').toLowerCase().trim();
    const normalizedPassword = (password || '').trim();
    if (normalizedEmail && normalizedPassword) {
      entries.set(normalizedEmail, normalizedPassword);
    }
  };

  // Two+ admins, same password: AUTH_EMAILS + AUTH_PASSWORD
  if (process.env.AUTH_EMAILS && sharedPassword) {
    process.env.AUTH_EMAILS.split(',').forEach((email) => {
      addEntry(email, sharedPassword);
    });
  }

  // Per-admin passwords: email:password pairs
  if (process.env.AUTH_ADMINS) {
    process.env.AUTH_ADMINS.split(',').forEach((part) => {
      const trimmed = part.trim();
      if (!trimmed) return;

      const separator = trimmed.indexOf(':');
      if (separator === -1) {
        addEntry(trimmed, sharedPassword);
        return;
      }

      addEntry(trimmed.slice(0, separator), trimmed.slice(separator + 1));
    });
  }

  const legacyEmail = process.env.AUTH_EMAIL || process.env.AUTH_USERNAME;
  if (legacyEmail && sharedPassword) {
    legacyEmail.split(',').forEach((email) => addEntry(email, sharedPassword));
  }

  return [...entries.entries()].map(([email, password]) => ({ email, password }));
};

const seedAdminUser = async () => {
  const admins = parseAdminEntries();

  if (!admins.length) {
    console.warn('No admins configured — set AUTH_EMAILS + AUTH_PASSWORD, AUTH_ADMINS, or AUTH_EMAIL + AUTH_PASSWORD');
    return;
  }

  const syncPasswords = process.env.AUTH_PASSWORD_SYNC === 'true';

  try {
    const removed = await User.deleteMany({ email: { $regex: /,/ } });
    if (removed.deletedCount) {
      console.log(`✓ Removed ${removed.deletedCount} malformed admin account(s)`);
    }
  } catch (error) {
    console.error('Malformed admin cleanup failed:', error.message);
  }

  for (const { email, password } of admins) {
    try {
      const existing = await User.findOne({ email });

      if (!existing) {
        await User.create({ email, password });
        console.log(`✓ Admin user seeded for ${email}`);
        continue;
      }

      if (syncPasswords) {
        existing.password = password;
        await existing.save();
        console.log(`✓ Admin password synced from env for ${email}`);
      }
    } catch (error) {
      console.error(`Admin seed failed for ${email}:`, error.message);
    }
  }
};

module.exports = seedAdminUser;
