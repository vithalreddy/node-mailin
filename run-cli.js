#!/usr/bin/env node
'use strict';

const forever = require('forever-monitor');
const logger = require('./lib/logger');
const path = require('path');

const pkg = require('./package.json');

let restartCount = 0;
const nodeMailinProcess = new forever.Monitor(path.join(__dirname, 'cli.js'), {
	max: 1000,
	minUptime: 10000,
	args: process.argv.slice(2)
});

nodeMailinProcess.on('error', function(err) {
	logger.error('Error caused Node-Mailin to crash.');
	logger.error('Please report this to ' + pkg.bugs.url);
	logger.error(err);
	logger.info();
	logger.info();
});

nodeMailinProcess.on('restart', function() {
	logger.warn('It is likely that an error caused Node-Mailin to crash.');
	logger.warn('Please report this to ' + pkg.bugs.url);
	logger.warn('Node-Mailin restarted.');

	++restartCount;
	logger.warn('Restart count: ' + restartCount);

	logger.info();
	logger.info();
});

nodeMailinProcess.on('exit', function() {
	logger.info('Node-Mailin stopped.');
});

nodeMailinProcess.start();
