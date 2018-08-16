#!/usr/bin/env node
'use strict';

const logger = require('./lib/logger');
const nodeMailin = require('./index');
const program = require('commander');

function collectOptions(keyValue, options) {
	if (!keyValue || keyValue.indexOf(':') < 0) {
		logger.error('Ignoring option ' + keyValue);
		return options;
	}
	options = options || {};
	var split = keyValue.split(':');
	options[split[0]] = split[1];
	return options;
}

function list(val) {
	return val.split(',');
}

const pkg = require('./package.json');

program
	.version(pkg.version)
	.option(
		'-p, --port <n>',
		'The port to which the nodeMailin smtp server should listen to. Default to 25.',
		parseInt
	)
	.option(
		'-i, --host <n>',
		'The host ip on which the nodeMailin smtp server should accept connections. Default to any valid address.'
	)
	// .option(
	// 	'-w, --webhook [url]',
	// 	'The webhook url to which the parsed emails are posted. Default to http://localhost:3000/webhook.'
	// )
	.option(
		'-l, --log-file [file path]',
		"The log file path. Default to '/var/log/nodeMailin.log'."
	)
	.option(
		'--disable-dkim',
		'Disable dkim checking. The dkim field in the webhook payload will be set to false.'
	)
	.option(
		'--disable-spf',
		'Disable spf checking. The spf field in the webhook payload will be set to false.'
	)
	.option(
		'--disable-spam-score',
		'Disable spam score computation. The spamScore field in the webhook payload will be set to 0.0.'
	)
	.option('--verbose', 'Set the logging level to verbose.')
	.option('--debug', 'Printout debug info such as the smtp commands.')
	.option('--profile', 'Enable basic memory usage profiling.')
	.option('--enable-dns-validation', 'Enable DNS domain lookup')
	.option(
		'--disabled-smtp-commands [value]',
		'smtp disabled commands list, comma separated',
		list
	)
	.option(
		'--smtp [value]',
		'smtp options split with :, check https://github.com/nodemailer/smtp-server',
		collectOptions,
		{}
	);

/* Hack the argv object so that commander thinks that this script is called
 * 'nodeMailin'. The help info will look nicer. */
process.argv[1] = 'nodeMailin';
program.parse(process.argv);

logger.info('nodeMailin v' + pkg.version);

var smtpOptions = program.smtp;
smtpOptions.disabledCommands = program.disabledSmtpCommands;

nodeMailin.start(
	{
		port: program.port || 25,
		host: program.host || '0.0.0.0',
		// webhook: program.webhook || 'http://localhost:3000/webhook',
		logFile: program.logFile || '/var/log/nodeMailin.log',
		disableDkim: program.disableDkim,
		disableSpf: program.disableSpf,
		disableSpamScore: program.disableSpamScore,
		verbose: program.verbose,
		debug: program.debug,
		profile: program.profile,
		disableDNSValidation: !program.enableDnsValidation,
		smtpOptions: smtpOptions
	},
	function(err) {
		if (err) process.exit(1);

		// logger.info('Webhook url: ' + nodeMailin.configuration.webhook);

		if (nodeMailin.configuration.logFile)
			logger.info('Log file: ' + nodeMailin.configuration.logFile);

		if (nodeMailin.configuration.disableDkim)
			logger.info('Dkim checking is disabled');
		if (nodeMailin.configuration.disableSpf)
			logger.info('Spf checking is disabled');
		if (nodeMailin.configuration.disableSpamScore)
			logger.info('Spam score computation is disabled');
	}
);
