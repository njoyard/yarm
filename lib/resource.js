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

resource.resources = resources;

module.exports = resource;
