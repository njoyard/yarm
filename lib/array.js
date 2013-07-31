/*jshint node:true */

"use strict";
var resource = require("./resource");


function makeArrayResource(array) {
	return {
		isCollection: true,

		sub: function(id, cb) {
			process.nextTick(function() {
				cb(null, {
					get: function(req, cb) {
						process.nextTick(function() {
							cb(null, array[id]);
						});
					}
				});
			});
		},

		count: function(req, cb) {
			process.nextTick(function() {
				cb(null, array.length);
			});
		},

		list: function(req, offset, limit, cb) {
			var arr;

			if (limit > 0) {
				arr = array.slice(offset, offset + limit);
			} else {
				arr = array.slice(offset);
			}
			
			process.nextTick(function() {
				cb(null, arr);
			});
		}
	};
}


/**
 * Define a REST resource that gives read access to an array
 *
 * @param name resource name
 * @param array array
 */
function arrayResource(name, array) {
	resource(name, makeArrayResource(array));
}


arrayResource.make = makeArrayResource;
module.exports = arrayResource;
