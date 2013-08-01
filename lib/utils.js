/*jshint node:true */

"use strict";

var util = require("util");

function extractRoute(req) {
	var url = req.url,
		orig = req.originalUrl;

	return orig.substring(0, orig.lastIndexOf(url));
}

var utils = {
	addHref: function(req, doc, prefix, id) {
		doc._href = util.format("%s://%s%s/%s/%s",
			req.protocol,
			req.headers.host,
			extractRoute(req),
			prefix,
			id
		);
	},

	ResponseBody: function(body, mimetype) {
		if (typeof this === "undefined") {
			return new utils.ResponseBody(body, mimetype);
		}

		this.body = body;
		this.mimetype = mimetype;
	},

	ResponseFile: function(path, mimetype) {
		if (typeof this === "undefined") {
			return new utils.ResponseFile(path, mimetype);
		}

		this.path = path;
		this.mimetype = mimetype;
	}
};


module.exports = utils;