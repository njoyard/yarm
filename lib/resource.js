/*jshint node:true */

"use strict";
var resources = {};

function resource(name, res) {
	if (resources[name]) {
		throw new Error("Resource " + name + " is already defined");
	}

	resources[name] = res;
}

resource.remove = function(name) {
	delete resources[name];
};

resource.rootCollection = {
	sub: function(name, cb) {
		process.nextTick(function() {
			cb(null, resources[name]);
		});
	},

	count: function(req, cb) {
		process.nextTick(function() {
			cb(null, Object.keys(resources).length);
		});
	},

	list: function(req, offset, limit, cb) {
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
};

module.exports = resource;
