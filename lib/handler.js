/*jshint node:true */

"use strict";
function Handler(pattern) {
	this.spec = {};
	this.subs = [];
	this.hooks = [];

	this.raw = pattern;
	this.regexp = new RegExp("^" + pattern.replace(/:[^\/]+/, "([^\\/]+)") + "$");

	var pmatch = pattern.match(/:[^\/]+/g);
	if (pmatch) {
		this.params = pmatch.map(function(match) { return match.replace(/^:/, ""); });
	} else {
		this.params = [];
	}
}


"get put post del sub list count".split(" ").forEach(function(method) {
	Handler.prototype[method] = function(handler) {
		this.spec[method] = handler;
		return this;
	};
});


Handler.prototype.match = function(path) {
	if (typeof path === "string") {
		return this.match(path.replace(/^\/|\/$/, "").split("/").map(decodeURIComponent));
	}

	if (path.length === 0) {
		return { spec: this.spec, params: {}, hooks: [] };
	} else {
		var first = path.shift();

		return this.subs.reduce(function(data, subHandler) {
			var rematch = first.match(subHandler.regexp);
			if (rematch) {
				var subdata = subHandler.match(path.slice(0));

				if (subdata.spec) {
					data.spec = subdata.spec;

					// Save hooks and parameters in case this one wins
					data.hooks = subHandler.hooks.concat(subdata.hooks);

					data.params = {};
					subHandler.params.forEach(function(name, index) {
						data.params[name] = rematch[index + 1];
					});

					Object.keys(subdata.params).forEach(function(name) {
						data.params[name] = subdata.params[name];
					});
				}
			}

			return data;
		}, {});
	}
};


Handler.prototype._sub = function(pattern) {
	var sub;
	
	if (pattern[0] === ":") {
		sub = this.subs.filter(function(sub) {
			return sub.raw[0] === ":";
		})[0];
	} else {
		sub = this.subs.filter(function(sub) {
			return sub.raw === pattern;
		})[0];
	}

	if (!sub) {
		sub = new Handler(pattern);
		this.subs.push(sub);
	}

	return sub;
};


Handler.prototype.sub = function(pattern, hook) {
	if (typeof pattern === "string") {
		return this.sub(pattern.replace(/^\/|\/$/g, "").split("/"), hook);
	}

	var sub = this._sub(pattern.shift());

	if (pattern.length > 0) {
		return sub.sub(pattern, hook);
	} else {
		if (hook) {
			sub.hooks.push(hook);
		}

		return sub;
	}
};


Handler.prototype.remove = function(pattern) {
	if (typeof pattern === "string") {
		return this.remove(pattern.replace(/^\/|\/$/g, "").split("/"));
	}

	var sub = this._sub(pattern.shift());

	if (pattern.length > 0) {
		sub.remove(pattern);
	} else {
		this.subs.splice(this.subs.indexOf(sub), 1);
	}
};

module.exports = Handler;
