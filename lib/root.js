/*jshint node:true*/
"use strict";

var utils = require("./utils");

var regexpSlashes = /\//g,
	regexpTrimSlashes = /^\/|\/$/g,
	regexpTrailingStar = /\*$/,
	regexpAllNamedParameters = /:[^\/]+/g;




/*!
 * Generic helpers
 */


var compiledCache = {};
function compilePattern(pattern, matchSubPaths) {
	var cacheKey = matchSubPaths ? pattern + "[/*]" : pattern;

	if (!(cacheKey in compiledCache)) {
		var compiled = {
			raw: pattern,
			key: cacheKey
		};

		var regexp = "^\\/" + pattern
				.replace(regexpSlashes, "\\/")
				.replace(regexpAllNamedParameters, "([^\\/]+)")
				.replace(regexpTrailingStar, "(.*)$");

		compiled.trailingStar = !!(pattern.match(regexpTrailingStar));

		if (!compiled.trailingStar && matchSubPaths) {
			compiled.regexp = new RegExp(regexp + "(\\/.*)?$");
		} else {
			compiled.regexp = new RegExp(compiled.trailingStar ? regexp : (regexp + "$"));
		}

		compiled.names = (pattern.match(regexpAllNamedParameters) || []).map(function(name) {
			return name.substr(1);
		});

		if (compiled.trailingStar) {
			compiled.names.push("*");
		}

		compiledCache[cacheKey] = compiled;
	}

	return compiledCache[cacheKey];
}


function addHandler(handlers, compiled, method, handler) {
	var item = Object.create(compiled);

	item.method = method;
	item.handler = handler;
	handlers.push(item);

	return item;
}


function addHook(handlers, compiled, hook, strict) {
	if (!strict && !compiled.trailingStar) {
		compiled = compilePattern(compiled.raw, true);
	}

	var item = Object.create(compiled);

	item.hook = hook;
	handlers.push(item);

	return item;
}


function addOptions(handlers, compiled, options) {
	var item = Object.create(compiled);

	item.options = options;
	handlers.push(item);

	return item;
}



/*!
 * Path matcher
 */


function Path(root, pattern) {
	this.root = root;
	this.compiled = compilePattern(pattern);

	if (this.compiled.trailingStar) {
		this.sub = undefined;
		this.remove = undefined;
	}
}


"get list count post put del".split(" ").forEach(function(method) {
	Path.prototype[method] = function(handler) {
		addHandler(this.root.handlers, this.compiled, method, handler);
		return this;
	};
});


Path.prototype.hook = function(hook, strict) {
	addHook(this.root.handlers, this.compiled, hook, strict);
	return this;
};


Path.prototype.readonly = function(subsToo) {
	var path = this;

	"post put del".split(" ").forEach(function(method) {
		path[method](undefined);
		if (subsToo) {
			path.sub("*")[method](undefined);
		}
	});

	return this;
};


Path.prototype.sub = function(pattern, hook) {
	pattern = pattern.replace(regexpTrimSlashes, "");
	return this.root.sub(this.compiled.raw + "/" + pattern, hook);
};


Path.prototype.remove = function(pattern) {
	pattern = pattern.replace(regexpTrimSlashes, "");
	return this.root.remove(this.compiled.raw + "/" + pattern);
};


Path.prototype.set = function(key, value, strict) {
	if (typeof key === "object") {
		strict = value;
	}

	var compiled = this.compiled;
	if (!strict && !compiled.trailingStar) {
		compiled = compilePattern(compiled.raw, true);
	}

	var hook = this.root.handlers.filter(function(h) {
		return h.options && h.raw === compiled.raw;
	})[0];

	if (!hook) {
		hook = addOptions(this.root.handlers, compiled, {});
	}

	if (typeof key === "object") {
		Object.keys(key).forEach(function(k) {
			hook.options[k] = key[k];
		});
	} else {
		hook.options[key] = value;
	}

	return this;
};



/*!
 * Base hooks
 */


function getParamHook(names, match) {
	// Strip full match
	var values = match.slice(1);

	return function paramHook(req, next) {
		req.params = req.params || {};
		names.forEach(function(name) {
			var value = values.shift();

			if (name === "*") {
				req.params[name] = value;
			} else {
				req.params[name] = decodeURIComponent(value);
			}
		});

		next();
	};
}


function getOptionsHook() {
	var hook = function optionsHook(req, next) {
		req.options = req.options || {};

		Object.keys(hook.options).forEach(function(key) {
			req.options[key] = hook.options[key];
		});

		next();
	};

	hook.options = {};

	return hook;
}


function getHref(subpath) {
	/*jshint validthis:true */
	var req = this;
	var path = req.path.replace(regexpTrimSlashes, "");

	if (subpath) {
		path = path + "/" + subpath.replace(regexpTrimSlashes, "");
	}

	return utils.getHref(req, path);
}


function matchPattern(pattern, path) {
	/*jshint validthis:true */
	var compiled = compilePattern(pattern);
	var req = this;

	var match = (path || req.path).match(compiled.regexp);

	if (match) {
		var values = match.slice(1);
		var params = {};

		compiled.names.forEach(function(name) {
			params[name] = values.shift();
		});

		return params;
	}

	return false;
}


var defaultHooks = [
	/* Add request helpers */
	function requestHelpersHook(req, next) {
		req.getHref = getHref;
		req.match = matchPattern;

		next();
	}
];



/*!
 * Root resource
 */

function rootResource() {
	var root = {
		handlers: [],

		sub: function(pattern, hook) {
			var path = new Path(root, pattern.replace(regexpTrimSlashes, ""));

			if (hook) {
				path.hook(hook);
			}

			return path;
		},

		remove: function(pattern) {
			pattern = pattern.replace(regexpTrimSlashes, "");

			function filterFunc(h) {
				var raw = h.raw;

				if (raw.substr(0, pattern.length) === pattern) {
					if (raw.length === pattern.length || raw[pattern.length] === "/") {
						return false;
					}
				}

				return true;
			}

			root.handlers = root.handlers.filter(filterFunc);
		},

		match: function(req) {
			var matchingHooks = defaultHooks.slice(0);
			var spec = {};
			var matchedPatterns = [];

			/* Add options hook */
			var optionsHook = getOptionsHook();
			matchingHooks.push(optionsHook);

			/* Find handlers matching requested path */
			root.handlers.forEach(function(h) {
				var match = req.path.match(h.regexp);

				if (match) {
					/* Add parameter hook only once for each pattern */
					if (h.names.length > 0 && matchedPatterns.indexOf(h.raw) === -1) {
						matchingHooks.push(getParamHook(h.names, match));
						matchedPatterns.push(h.raw);
					}

					if (h.options) {
						var options = optionsHook.options;
						Object.keys(h.options).forEach(function(key) {
							options[key] = h.options[key];
						});
					}

					if (h.hook) {
						matchingHooks.push(h.hook);
					}

					if (h.method) {
						// get and count/list override each other
						if (h.method === "get") {
							delete spec.count;
							delete spec.list;
						}

						if (h.method === "count" || h.method === "list") {
							delete spec.get;
						}

						spec[h.method] = h.handler;
					}
				}
			});

			if (Object.keys(spec).length) {
				return { spec: spec, hooks: matchingHooks };
			}
		}
	};

	return root;
}


module.exports = rootResource;
