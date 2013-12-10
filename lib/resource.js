/*jshint node:true */

"use strict";
var resources = {};


function Resource() {
	this.subs = {};
	this.catchall = null;

	var self = this;
	this.spec = {
		sub: function(name, cb) {
			if (name in self.subs) {
				cb(null, self.subs[name]);
			} else if (self.catchall) {
				self.catchall.call(null, name, cb);
			} else {
				cb();
			}
		}
	};
}

"get put post del sub".split(" ").forEach(function(method) {
	Resource.prototype[method] = function(handler) {
		this.spec[method] = handler;
		return this;
	};
});

Resource.prototype.list = function(counter, lister) {
	this.spec.count = counter;
	this.spec.list = lister;

	return this;
};


Resource.prototype.sub = function(handler) {
	if (typeof handler === "string") {
		var subres = new Resource();
		this.subs[handler] = subres;
		return subres;
	} else {
		this.catchall = handler;
		return this;
	}
};


function resource(name) {
	if (resources[name]) {
		throw new Error("Resource " + name + " is already defined");
	}

	var res = new Resource();
	resources[name] = res;
	return res;
}

resource.remove = function(name) {
	delete resources[name];
};

var root = (new Resource())
	.list(
		function rootCount(req, cb) {
			process.nextTick(function() {
				cb(null, Object.keys(resources).length);
			});
		},
		function rootList(req, offset, limit, cb) {
			var keys = Object.keys(resources);

			if (limit > 0) {
				keys = keys.slice(offset, offset + limit);
			} else {
				keys = keys.slice(offset);
			}
			
			process.nextTick(function() {
				cb(null, keys);
			});
		}
	)
	.sub(function rootSub(name, cb) {
		process.nextTick(function() {
			cb(null, resources[name]);
		});
	});

resource.rootCollection = root;
module.exports = resource;
