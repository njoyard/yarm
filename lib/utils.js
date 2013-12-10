/*jshint node:true */

"use strict";

var util = require("util");

function extractRoute(req) {
	var url = req.url,
		orig = req.originalUrl;

	return orig.substring(0, orig.lastIndexOf(url));
}

var utils = {
	getHref: function(req, urlpath) {
		return util.format("%s://%s%s/%s",
			req.protocol,
			req.headers.host,
			extractRoute(req),
			urlpath
		);
	},

	addHref: function(req, doc, urlpath) {
		doc._href = this.getHref(req, urlpath);
	}
};


module.exports = utils;