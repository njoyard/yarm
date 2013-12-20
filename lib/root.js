/*jshint node:true*/
"use strict";

var utils = require("./utils");

var paths = [],
	regexpSlashes = /\//g,
	regexpTrimSlashes = /^\/|\/$/g,
	regexpTrailingStar = /\*$/,
	regexpAllNamedParameters = /:[^\/]+/g;



/*!
 * Path matcher
 */


function Path(pattern) {
	this.raw = pattern;

	var regexp = "^\\/" + pattern
			.replace(regexpSlashes, "\\/")
			.replace(regexpAllNamedParameters, "([^\\/]+)")
			.replace(regexpTrailingStar, "(.*)$");

	this.startRegexp = new RegExp(regexp);
	this.trailingStar = !!(pattern.match(regexpTrailingStar));
	this.fullRegexp = this.trailingStar ? this.startRegexp : new RegExp(regexp + "$");


	this.names = (pattern.match(regexpAllNamedParameters) || []).map(function(name) {
		return name.substr(1);
	});

	this.hooks = [];
	this.spec = {};
	this.options = {};
	this.optionsHooked = false;

	if (this.trailingStar) {
		this.sub = undefined;
	}
}


"get list count post put del".split(" ").forEach(function(method) {
	Path.prototype[method] = function(handler) {
		this.spec[method] = handler;
		return this;
	};
});


Path.prototype.hook = function(hook) {
	this.hooks.push(hook);
	return this;
};

Path.prototype.sub = function(pattern, hook) {
	pattern = pattern.replace(regexpTrimSlashes, "");

	var path = new Path(this.raw + "/" + pattern);
	paths.push(path);

	if (hook) {
		path.hook(hook);
	}

	return path;
};

Path.prototype.remove = function(pattern) {
	pattern = pattern.replace(regexpTrimSlashes, "");
	var full = this.raw + "/" + pattern;

	paths = paths.filter(function(path) {
		return path.raw.substr(0, full.length) !== full;
	});
};

Path.prototype.set = function(key, value) {
	this.options[key] = value;

	if (!this.optionsHooked) {
		var path = this;

		this.optionsHooked = true;
		this.hooks.push(function(req, next) {
			req.options = req.options || {};

			Object.keys(path.options).forEach(function(key) {
				req.options[key] = path.options[key];
			});

			next();
		});
	}

	return this;
};



/*!
 * Base hooks
 */




function getHref(subpath) {
	/*jshint validthis:true */
	var req = this;
	var path = req.path.replace(regexpTrimSlashes, "");

	if (subpath) {
		path = path + "/" + subpath.replace(regexpTrimSlashes, "");
	}

	return utils.getHref(req, path);
}


var defaultHooks = [
	/* Add getHref helper */
	function(req, next) {
		req.getHref = getHref;
		next();
	}
];



/*!
 * Root resource
 */


var root = {
	sub: function(pattern, hook) {
		var path = new Path(pattern.replace(regexpTrimSlashes, ""));
		paths.push(path);

		if (hook) {
			path.hook(hook);
		}

		return path;
	},

	remove: function(pattern) {
		var full = pattern.replace(regexpTrimSlashes, "");

		paths = paths.filter(function(path) {
			return path.raw.substr(0, full.length) !== full;
		});
	},

	match: function(req) {
		var hooks = defaultHooks.slice(0);
		var matching, matched;

		paths.forEach(function(path) {
			if (req.path.match(path.startRegexp)) {
				hooks = hooks.concat(path.hooks);
			}

			var match = req.path.match(path.fullRegexp);
			if (match) {
				matched = match;
				matching = path;
			}
		});

		if (matching) {
			req.params = req.params || {};

			if (matching.trailingStar) {
				req.params["*"] = matched.pop();
			}

			matched.forEach(function(value, index) {
				if (index > 0) {
					req.params[matching.names[index - 1]] = value;
				}
			});

			return { spec: matching.spec, hooks: hooks };
		}
	}
};

module.exports = root;