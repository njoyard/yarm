/*jshint node:true */

"use strict";

var util = require("util"),
	config = require("../config").server;

var utils = {
	addHref: function(req, doc, prefix, id) {
		doc._href = util.format("%s://%s:%s/rest/%s/%s",
			req.protocol,
			req.host,
			config.port,
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