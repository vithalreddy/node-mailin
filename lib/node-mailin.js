"use strict";

const LanguageDetect = require("languagedetect");
const simpleParser = require("mailparse").simpleParser;
const _ = require("lodash");
const htmlToText = require("html-to-text");
const events = require("events");
const Promise = require("bluebird");
const fs = Promise.promisifyAll(require("fs"));
const path = require("path");
const shell = require("shelljs");
const util = require("util");
const SMTPServer = require("smtp-server").SMTPServer;
const uuid = require("uuid");
const dns = require("dns");
const extend = require("extend");
const promisify = util.promisify;

const logger = require("./logger");
const mailUtilities = Promise.promisifyAll(require("./mailUtilities"));

const NodeMailin = function() {
    events.EventEmitter.call(this);

    /* Set up the default options. */
    this.configuration = {
        host: "0.0.0.0",
        port: 25,
        tmp: ".tmp",
        logFile: null,
        disableDkim: false,
        disableSpf: false,
        disableSpamScore: true,
        verbose: false,
        debug: false,
        logLevel: "debug",
        profile: false,
        disableDNSValidation: true,
        smtpOptions: {
            banner: "NodeMailin Smtp Server",
            logger: false,
            disabledCommands: ["AUTH"]
        }
    };

    /* The simplesmtp server instance, 'exposed' as an undocuumented, private
     * member. It is not meant for normal usage, but is can be uuseful for
     * NodeMailin hacking.
     * The instance will be initialized only after that NodeMailin.start() has been called. */
    this._smtp = null;
};
util.inherits(NodeMailin, events.EventEmitter);

NodeMailin.prototype.start = function(options, callback) {
    const _this = this;

    options = options || {};
    if (_.isFunction(options)) {
        callback = options;
        options = {};
    }

    const configuration = this.configuration;
    extend(true, configuration, options);
    configuration.smtpOptions.secure = Boolean(configuration.smtpOptions.secure);

    callback = callback || function() {};

    /* Create tmp dir if necessary. */
    if (!fs.existsSync(configuration.tmp)) {
        shell.mkdir("-p", configuration.tmp);
    }

    /* Log to a file if necessary. */
    if (configuration.logFile) {
        logger.setLogFile(configuration.logFile);
    }

    /* Set log level if necessary. */
    if (configuration.logLevel) {
        logger.setLevel(configuration.logLevel);
    }

    if (configuration.verbose) {
        logger.setLevel("verbose");
        logger.info("Log level set to verbose.");
    }

    if (configuration.debug) {
        logger.info("Debug option activated.");
        logger.setLevel("debug");

        /* Enable debug for the simplesmtp server as well. */
        configuration.smtpOptions.debug = true;
    }

    /* Basic memory profiling. */
    if (configuration.profile) {
        logger.info("Enable memory profiling");
        setInterval(function() {
            const memoryUsage = process.memoryUsage();
            const ram = memoryUsage.rss + memoryUsage.heapUsed;
            const million = 1000000;
            logger.info(
                "Ram Usage: " +
                ram / million +
                "mb | rss: " +
                memoryUsage.rss / million +
                "mb | heapTotal: " +
                memoryUsage.heapTotal / million +
                "mb | heapUsed: " +
                memoryUsage.heapUsed / million
            );
        }, 5000);
    }

    function validateAddress(addressType, email, session) {
        return new Promise(function(resolve, reject) {
            if (configuration.disableDnsLookup) {
                return resolve();
            }
            try {
                let validateEvent,
                    validationFailedEvent,
                    dnsErrorMessage,
                    localErrorMessage;

                if (addressType === "sender") {
                    validateEvent = "validateSender";
                    validationFailedEvent = "senderValidationFailed";
                    dnsErrorMessage =
                        "450 4.1.8 <" +
                        email +
                        ">: Sender address rejected: Domain not found";
                    localErrorMessage =
                        "550 5.1.1 <" +
                        email +
                        ">: Sender address rejected: User unknown in local sender table";
                } else if (addressType === "recipient") {
                    validateEvent = "validateRecipient";
                    validationFailedEvent = "recipientValidationFailed";
                    dnsErrorMessage =
                        "450 4.1.8 <" +
                        email +
                        ">: Recipient address rejected: Domain not found";
                    localErrorMessage =
                        "550 5.1.1 <" +
                        email +
                        ">: Recipient address rejected: User unknown in local recipient table";
                } else {
                    // How are internal errors handled?
                    return reject(new Error("Address type not supported"));
                }

                if (!email) {
                    return reject(new Error(localErrorMessage));
                }

                let domain = /@(.*)/.exec(email)[1];

                let validateViaLocal = function() {
                    if (_this.listeners(validateEvent).length) {
                        _this.emit(validateEvent, session, email, function(err) {
                            if (err) {
                                _this.emit(validationFailedEvent, email);
                                return reject(err);
                            } else {
                                return resolve();
                            }
                        });
                    } else {
                        return resolve();
                    }
                };

                let validateViaDNS = function() {
                    try {
                        dns.resolveMx(domain, function(err, addresses) {
                            if (err || !addresses || !addresses.length) {
                                _this.emit(validationFailedEvent, email);
                                return reject(new Error(dnsErrorMessage));
                            }
                            validateViaLocal();
                        });
                    } catch (e) {
                        return reject(e);
                    }
                };

                if (configuration.disableDNSValidation) {
                    validateViaLocal();
                } else {
                    validateViaDNS();
                }
            } catch (e) {
                reject(e);
            }
        });
    }

    function dataReady(connection) {
        logger.info(
            connection.id +
            " Processing message from " +
            connection.envelope.mailFrom.address
        );

        return retrieveRawEmail(connection)
            .then(function(rawEmail) {
                return Promise.all([
                    rawEmail,
                    validateDkim(connection, rawEmail),
                    validateSpf(connection),
                    computeSpamScore(connection, rawEmail),
                    parseEmail(connection)
                ]);
            })
            .spread(function(
                rawEmail,
                isDkimValid,
                isSpfValid,
                spamScore,
                parsedEmail
            ) {
                return Promise.all([
                    connection,
                    rawEmail,
                    isDkimValid,
                    isSpfValid,
                    spamScore,
                    parsedEmail,
                    detectLanguage(connection, parsedEmail.text)
                ]);
            })
            .spread(finalizeMessage)
            .then(unlinkFile.bind(null, connection))
            .catch(function(error) {
                logger.error(
                    connection.id + " Unable to finish processing message!!",
                    error
                );
                logger.error(error);
                throw error;
            });
    }

    function retrieveRawEmail(connection) {
        return fs.readFileAsync(connection.mailPath).then(function(rawEmail) {
            return rawEmail; //returns buffer
        });
    }

    function validateDkim(connection, rawEmail) {
        if (configuration.disableDkim) {
            return Promise.resolve(false);
        }

        logger.verbose(connection.id + " Validating dkim.");

        return mailUtilities.validateDkimAsync(rawEmail).catch(function(err) {
            logger.error(
                connection.id + " Unable to validate dkim. Consider dkim as failed."
            );
            logger.error(err);
            return false;
        });
    }

    function validateSpf(connection) {
        if (configuration.disableSpf) {
            return Promise.resolve(false);
        }

        logger.verbose(connection.id + " Validating spf.");

        /* Get ip and host. */
        return mailUtilities
            .validateSpfAsync(
                connection.remoteAddress,
                connection.clientHostname,
                connection.envelope.mailFrom.address //from email address
            )
            .catch(function(err) {
                logger.error(
                    connection.id + " Unable to validate spf. Consider spf as failed."
                );
                logger.error(err);
                return false;
            });
    }

    function computeSpamScore(connection, rawEmail) {
        if (configuration.disableSpamScore) {
            return Promise.resolve(0.0);
        }

        return mailUtilities.computeSpamScoreAsync(rawEmail).catch(function(err) {
            logger.error(
                connection.id + " Unable to compute spam score. Set spam score to 0."
            );
            logger.error(err);
            return 0.0;
        });
    }

    function parseEmail(connection) {
        return new Promise(async function(resolve, reject) {
            try {
                logger.verbose(connection.id + " Parsing email.");
                /* Stream the written email to the parser. */
                let src = fs.createReadStream(connection.mailPath);
                const mail = await simpleParser(src);
                // logger.verbose(util.inspect(mail, {
                // depth: 5
                // }));
                /* Make sure that both text and html versions of the
                 * body are available. */
                if (!mail.text && !mail.html) {
                    mail.text = "";
                    mail.html = "<div></div>";
                } else if (!mail.html) {
                    mail.html = _this._convertTextToHtml(mail.text);
                } else if (!mail.text) {
                    mail.text = _this._convertHtmlToText(mail.html);
                }
                // console.log(mail);
                return resolve(mail);
            } catch (err) {
                console.log(`parseEmail err: `, err);
                reject(err);
            }
        });
    }

    function detectLanguage(connection, text) {
        logger.verbose(connection.id + " Detecting language.");

        let language = "";
        let languageDetector = new LanguageDetect();
        let potentialLanguages = languageDetector.detect(text, 2);
        if (potentialLanguages.length !== 0) {
            logger.verbose(
                "Potential languages: " +
                util.inspect(potentialLanguages, {
                    depth: 5
                })
            );

            /* Use the first detected language.
             * potentialLanguages = [['english', 0.5969], ['hungarian', 0.40563]] */
            language = potentialLanguages[0][0];
        } else {
            logger.info(
                connection.id + " Unable to detect language for the current message."
            );
        }

        return language;
    }

    function finalizeMessage(
        connection,
        rawEmail,
        isDkimValid,
        isSpfValid,
        spamScore,
        parsedEmail,
        language
    ) {
        /* Finalize the parsed email object. */
        parsedEmail.dkim = isDkimValid ? "pass" : "failed";
        parsedEmail.spf = isSpfValid ? "pass" : "failed";
        parsedEmail.spamScore = spamScore;
        parsedEmail.language = language;

        /* Make fields exist, even if empty. That will make
         * json easier to use on the webhook receiver side. */
        parsedEmail.cc = parsedEmail.cc || [];
        parsedEmail.from = parsedEmail.from || [];
        parsedEmail.to = parsedEmail.to || [];
        parsedEmail.attachments = parsedEmail.attachments || [];

        /* Add the connection authentication to the parsedEmail. */
        parsedEmail.connection = connection;

        /* Add envelope data to the parsedEmail. */
        parsedEmail.envelopeFrom = connection.envelope.mailFrom;
        parsedEmail.envelopeTo = connection.envelope.rcptTo;

        _this.emit("message", connection, parsedEmail, rawEmail);

        return parsedEmail;
    }

    function unlinkFile(connection) {
        /* Don't forget to unlink the tmp file. */
        return fs.unlinkAsync(connection.mailPath).then(function() {
            logger.info(
                connection.id +
                " End processing message, deleted " +
                connection.mailPath
            );
            return;
        });
    }

    let _session;

    function onData(stream, session, callback) {
        _session = session;
        let connection = _.cloneDeep(session);
        connection.id = uuid.v4();
        let mailPath = path.join(configuration.tmp, connection.id);
        connection.mailPath = mailPath;

        _this.emit("startData", connection);
        logger.verbose("Connection id " + connection.id);
        logger.info(
            connection.id +
            " Receiving message from " +
            connection.envelope.mailFrom.address
        );

        _this.emit("startMessage", connection);

        stream.pipe(fs.createWriteStream(mailPath));

        stream.on("data", function(chunk) {
            _this.emit("data", connection, chunk);
        });

        stream.on("end", function() {
            dataReady(connection);
            callback();
        });

        stream.on("close", function() {
            _this.emit("close", connection);
        });

        stream.on("error", function(error) {
            _this.emit("error", connection, error);
        });
    }

    function onAuth(auth, session, streamCallback) {
        if (
            _this.emit(
                "authorizeUser",
                session,
                auth.username,
                auth.password,
                streamCallback
            )
        ) {
            streamCallback(new Error("Unauthorized user"));
        }
    }

    function onMailFrom(address, session, streamCallback) {
        let ack = function(error) {
            streamCallback(error);
        };
        validateAddress("sender", address.address, session)
            .then(ack)
            .catch(ack);
    }

    function onRcptTo(address, session, streamCallback) {
        let ack = function(error) {
            streamCallback(error);
        };
        validateAddress("recipient", address.address, session)
            .then(ack)
            .catch(ack);
    }

    const smtpOptions = _.extend({}, configuration.smtpOptions || {}, {
        onData: onData,
        onAuth: onAuth,
        onMailFrom: onMailFrom,
        onRcptTo: onRcptTo
    });

    const server = new SMTPServer(smtpOptions);

    this._smtp = server;

    server.listen(configuration.port, configuration.host, function(err) {
        if (!err) {
            logger.info(
                "NodeMailin Smtp server listening on port " + configuration.port
            );
        } else {
            callback(err);
            logger.error(
                "Could not start server on port " + configuration.port + "."
            );
            if (configuration.port < 1000) {
                logger.error("Ports under 1000 require root privileges.");
            }

            if (configuration.logFile) {
                logger.error(
                    "Do you have write access to log file " + configuration.logFile + "?"
                );
            }

            logger.error(err.message);
        }
    });

    server.on("close", function() {
        logger.info("Closing smtp server");
        _this.emit("close", _session);
    });

    server.on("error", function(error) {
        if (error.code == "ETIMEDOUT") {
            logger.warn(error);
        } else if (error.code == "ECONNRESET") {
            logger.warn(error);
        } else {
            logger.error(error);
            _this.emit("error", _session, error);
        }
    });

    callback();
};

NodeMailin.prototype.stop = function(callback) {
    callback = callback || function() {};
    logger.info("Stopping NodeMailin.");

    /* FIXME A bug in the RAI module prevents the callback to be called, so
     * call end and call the callback directly. */
    this._smtp.close(callback);
    callback();
};

NodeMailin.prototype._convertTextToHtml = function(text) {
    /* Replace newlines by <br>. */
    text = text.replace(/(\n\r)|(\n)/g, "<br>");
    /* Remove <br> at the begining. */
    text = text.replace(/^\s*(<br>)*\s*/, "");
    /* Remove <br> at the end. */
    text = text.replace(/\s*(<br>)*\s*$/, "");

    return text;
};

NodeMailin.prototype._convertHtmlToText = function(html) {
    return htmlToText.fromString(html);
};

module.exports = new NodeMailin();