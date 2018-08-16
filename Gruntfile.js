'use strict';

const fs = require('fs');

module.exports = function(grunt) {
	grunt.loadNpmTasks('grunt-jsbeautifier');
	grunt.loadNpmTasks('grunt-contrib-jshint');

	grunt.loadNpmTasks('grunt-mocha-test');

	// Project configuration.
	grunt.initConfig({
		pkg: grunt.file.readJSON('package.json'),
		jsfiles: [
			'Gruntfile.js',
			'index.js',
			'lib/**/*.js',
			'test/**/*.js',
			'!node_modules/**/*.js'
		],
		jsbeautifier: {
			files: ['<%= jsfiles %>'],
			options: {
				js: {
					spaceAfterAnonFunction: true
				}
			}
		},
		jshint: {
			options: {
				curly: false,
				eqeqeq: true,
				indent: 4,
				latedef: true,
				newcap: true,
				nonew: true,
				undef: true,
				unused: true,
				trailing: true,
				white: true,
				globalstrict: false,
				node: true,
				devel: true,
				globals: {
					FormData: true,
					Promise: true,
					before: false,
					after: false,
					it: false,
					describe: false,
					beforeEach: false
				}
			},
			files: ['<%= jsfiles %>']
		},
		mochaTest: {
			test: {
				options: {
					reporter: 'spec'
				},
				src: ['test/**/*Spec.js']
			}
		},
		watch: {
			files: ['<%= jsfiles %>'],
			tasks: ['test']
		}
	});

	grunt.registerTask('lint', ['jsbeautifier', 'jshint']);
	grunt.registerTask('test', ['lint', 'mochaTest']);
};
