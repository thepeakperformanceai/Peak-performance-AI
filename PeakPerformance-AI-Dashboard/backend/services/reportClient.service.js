const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');

/**
 * Sends the member's uploaded files + athlete profile to the MAIN backend's
 * service endpoint, which runs the AI pipeline and returns the report content.
 * Nothing is saved on the main side — we persist the result in OUR database.
 *
 * @param {Array} files    multer files ([{ path, originalname, mimetype }])
 * @param {Object} profile athlete profile object
 * @returns {Promise<{reportContent, dashboardMetrics, athleteProfile}>}
 */
const generateViaMainBackend = async (files, profile) => {
  const base = process.env.MAIN_BACKEND_URL;
  const key = process.env.SERVICE_API_KEY;
  if (!base || !key) {
    throw new Error('Report engine not configured (MAIN_BACKEND_URL / SERVICE_API_KEY).');
  }

  const form = new FormData();
  for (const f of files) {
    form.append('files', fs.createReadStream(f.path), f.originalname);
  }
  form.append('profile', JSON.stringify(profile));

  const { data } = await axios.post(
    `${base.replace(/\/$/, '')}/report/generate-content`,
    form,
    {
      headers: { ...form.getHeaders(), 'x-service-key': key },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      timeout: 120000
    }
  );
  return data;   // { reportContent, dashboardMetrics, athleteProfile, ... }
};

module.exports = { generateViaMainBackend };
