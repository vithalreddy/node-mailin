'use strict';

const xor = require('lodash/xor');
const express = require('express');
const fs = require('fs');
const nodeMailin = require('../lib/node-mailin');
const multiparty = require('multiparty');
const SMTPConnection = require('smtp-connection');
const shell = require('shelljs');

const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
chai.use(chaiAsPromised);

let should = null;
should = chai.Should();

let server = express(),
	conn;
let doing = 0;

before(function(done) {
	conn = server.listen(3000, function(err) {
		if (err) console.log(err);
		should.not.exist(err);

		console.log('Http server listening on port 3000');

		nodeMailin.start(
			{
				// verbose: true,
				smtpOptions: {
					secure: false
				}
			},
			function(err) {
				should.not.exist(err);
				done();
			}
		);
	});
});

beforeEach(function() {
	nodeMailin.removeAllListeners();
});

describe('nodeMailin', function() {
	it('should convert an HTML-only message to text', function(done) {
		this.timeout(10000);

		nodeMailin.on('message', function(connection, data) {
			// console.log(data);
			try {
				data.text.should.eql(
					`HELLO WORLD\nThis is a line that needs to be at least a little longer than 80 characters so\nthat we can check the character wrapping functionality.\n\nThis is a test of a link [https://github.com/vithalreddy/node-mailin].`
				);
				done();
			} catch (e) {
				done(e);
			}
		});

		/* Make an smtp client to send an email. */
		const client = new SMTPConnection({
			port: 2500,
			ignoreTLS: true
		});

		client.connect(function() {
			client.send(
				{
					from: {
						name: 'Me',
						address: 'me@stackfame.com'
					},
					to: [
						{
							name: '',
							address: 'to@stackfame.com'
						}
					]
				},
				fs.createReadStream('./test/fixtures/test-html-only.eml'),
				function(err) {
					if (err) {
						done(err);
					}
				}
			);
		});
	});

	it('should not validate sender domain DNS by default', function(done) {
		this.timeout(10000);

		nodeMailin.on('message', function(connection, data) {
			data.html.should.eql('<b>Hello world!</b>');
			done();
		});

		/* Make an smtp client to send an email. */

		const client = new SMTPConnection({
			port: 2500,
			ignoreTLS: true
		});

		client.connect(function() {
			client.send(
				{
					from: {
						name: 'Me',
						address: 'me@stackfame.com'
					},
					to: [
						{
							name: 'First Receiver',
							address: 'first@stackfame.com'
						},
						{
							name: '',
							address: 'second@stackfame.com'
						}
					]
				},
				fs.createReadStream('./test/fixtures/test.eml'),
				function(err) {
					done(err);
				}
			);
		});
	});

	/* This test should run as the last test since it restarts nodeMailin with
     * different options. */
	it('should validate sender domain DNS if requested', function(done) {
		this.timeout(10000);

		nodeMailin.stop(function(err) {
			try {
				if (err) console.log(err);
				should.not.exist(err);
			} catch (e) {
				return done(e);
			}

			nodeMailin.start(
				{
					disableDNSValidation: false,
					smtpOptions: {
						disabledCommands: ['AUTH'],
						secure: false
					}
				},
				function(err) {
					try {
						if (err) console.log(err);
						should.not.exist(err);
					} catch (e) {
						return done(e);
					}

					var doneEvents = [];
					var registerDoneEvent = function(eventName) {
						doneEvents.push(eventName);
						var remaining = xor(doneEvents, [
							'senderValidationFailed',
							'error'
						]);
						if (remaining.length === 0) {
							done();
						}
					};

					nodeMailin.on('senderValidationFailed', function(err) {
						err = err || undefined;
						try {
							should.exist(err);
							err.should.equal('envelopefrom@foo.fifoo');
							registerDoneEvent('senderValidationFailed');
						} catch (e) {
							return done(e);
						}
					});

					/* Make an smtp client to send an email. */
					const client = new SMTPConnection({
						port: 2500,
						ignoreTLS: true
					});

					var errorFunction = function(err) {
						err = err || undefined;
						try {
							should.exist(err);
							console.log(err);
							err.response
								.indexOf(
									'Sender address rejected: Domain not found'
								)
								.should.not.equal(-1);
							registerDoneEvent('error');
						} catch (e) {
							return done(e);
						}
					};

					client.connect(function() {
						client.send(
							{
								from: {
									name: 'Me',
									address: 'envelopefrom@foo.fifoo'
								},
								to: [
									{
										name: 'First Receiver',
										address: 'first@stackfame.com'
									},
									{
										name: '',
										address: 'second@stackfame.com'
									}
								]
							},
							fs.createReadStream('./test/fixtures/test.eml'),
							errorFunction
						);
					});
				}
			);
		});
	});
});
