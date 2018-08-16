"use strict";

const shell = require("shelljs");
const dkim = require("dkim");
const Spamc = require("spamc");
var SPFValidator = require("spf-validator");

const logger = require("./logger");
const spamc = new Spamc();

/* Verify spamc/spamassassin availability. */

const isSpamcAvailable = shell.which("spamassassin") && shell.which("spamc");

!isSpamcAvailable &&
  logger.warn(
    "Either spamassassin or spamc are not available. Spam score computation is disabled."
  );

/* Provides high level mail utilities such as checking dkim, spf and computing
 * a spam score. */
module.exports = {
  /* @param rawEmail is the full raw mime email as a buffer. */
  validateDkim: function(rawEmail, callback) {
    dkim.verify(rawEmail, (err, data) => {
      if (err) {
        return callback(err);
      } else {
        return callback(null, true);
      }
    });
  },

  validateSpf: function(ip, host = "", email = "", callback) {
    const domain = email.replace(/.*@/, "");
    logger.verbose(`validsting spf for host ${domain} and ip ${ip}`);
    const validator = new SPFValidator(domain);
    validator.hasRecords((err, hasRecords) => callback(err, hasRecords));
  },

  /* @param rawEmail is the full raw mime email as a string. */
  computeSpamScore: function(rawEmail, callback) {
    if (!isSpamcAvailable) {
      return callback(null, 0.0);
    }

    spamc.report(rawEmail, function(err, result) {
      logger.verbose(result);
      if (err) logger.error(err);
      if (err) return callback(new Error("Unable to compute spam score."));
      callback(null, result.spamScore);
    });
  }
};
