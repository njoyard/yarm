/*jshint node:true */

"use strict";
var resource = require("./resource");


function makeObjectResource(obj) {
	return {
		isCollection: true,

		sub: function(id, cb) {
			process.nextTick(function() {
				cb(null, obj[id]);
			});
		},

		count: function(req, cb) {
			process.nextTick(function() {
				cb(null, Object.keys(obj).length);
			});
		},

		list: function(req, offset, limit, cb) {
			var keys = Object.keys(obj);

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
}


/**
 * Define a REST resource that gives read access to an object
 *
 * @param name resource name
 * @param obj object
 */
function objectResource(name, obj) {
	resource(name, makeObjectResource(obj));
}


objectResource.make = makeObjectResource;
module.exports = objectResource;
