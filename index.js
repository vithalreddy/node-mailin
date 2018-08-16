"use strict";
const semver = require("semver");
const pkg = require("./package.json");

/* Check compatibility with versions of node. */
if (!semver.satisfies(process.version, ">=8.0.0")) {
  console.log(
    "\n*****\nYour current node version (" +
      process.version +
      ") is not compatible with Node-Mailin v" +
      pkg.version +
      " which requires " +
      pkg.engine +
      "\nPlease Consider Upgrading your Node version" +
      "\nLove,\nthe Node-Mailin maintainers. \n*****Node-Mailin******\n"
  );
}

const nodeMailin = require("./lib/node-mailin");
module.exports = nodeMailin;
