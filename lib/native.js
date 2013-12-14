/*jshint node:true */

"use strict";
/*var resource = require("./resource");


function createNativeResource(obj, setter) {
	if (Array.isArray(obj)) {
		return createArrayResource(obj, setter);
	} else if (typeof obj === "object") {
		return createObjectResource(obj, setter);
	} else {
		return createPrimitiveResource(obj, setter);
	}
}


function createArrayResource(array, setter) {
	return {
		sub: function(key, cb) {
			var sub = null;

			if (key in array) {
				sub = createNativeResource(array[key], function(value) {
					array[key] = value;
				});
			} else {
				sub = createNativeResource(undefined, function(value) {
					array[key] = value;
				});
			}

			process.nextTick(function() {
				cb(null, sub);
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
		},

		put: function(req, isPatch, cb) {
			var prev, err;

			if (isPatch) {
				req.body.forEach(function(value, index) {
					array[index] = value;
				});
			} else {
				prev = array;

				try {
					array = req.body;
					setter(array);
				} catch(e) {
					err = e;
					array = prev;
				}
			}

			process.nextTick(function() {
				cb(err);
			});
		},

		post: function(req, cb) {
			if (req.param("index")) {
				array.splice(Number(req.param("index")), 1, req.body);
			} else {
				array.push(req.body);
			}

			process.nextTick(function() {
				cb(null, req.body);
			});
		},

		del: function(req, cb) {
			var prev = array,
				err;

			try {
				array = undefined;
				setter(array);
			} catch(e) {
				err = e;
				array = prev;
			}

			process.nextTick(function() {
				cb(err);
			});
		}
	};
}


function createObjectResource(obj, setter) {
	return {
		sub: function(key, cb) {
			var sub = null;

			if (key in obj) {
				sub = createNativeResource(obj[key], function(value) {
					obj[key] = value;
				});
			} else {
				sub = createNativeResource(undefined, function(value) {
					obj[key] = value;
				});
			}

			process.nextTick(function() {
				cb(null, sub);
			});
		},

		count: function(req, cb) {
			process.nextTick(function() {
				cb(null, Object.keys(obj).length);
			});
		},

		list: function(req, offset, limit, cb) {
			var arr = Object.keys(obj);

			if (limit > 0) {
				arr = arr.slice(offset, offset + limit);
			} else {
				arr = arr.slice(offset);
			}

			process.nextTick(function() {
				cb(null, arr);
			});
		},

		put: function(req, isPatch, cb) {
			var prev, err;

			if (isPatch) {
				Object.keys(req.body).forEach(function(key) {
					obj[key] = req.body[key];
				});
			} else {
				prev = obj;

				try {
					obj = req.body;
					setter(obj);
				} catch(e) {
					err = e;
					obj = prev;
				}
			}

			process.nextTick(function() {
				cb(err);
			});
		},

		del: function(req, cb) {
			var prev = obj,
				err;

			try {
				obj = undefined;
				setter(obj);
			} catch(e) {
				err = e;
				obj = prev;
			}

			process.nextTick(function() {
				cb(err);
			});
		}
	};
}


function createPrimitiveResource(value, setter) {
	return {
		get: function(req, cb) {
			process.nextTick(function() {
				cb(null, JSON.stringify(value));
			});
		},

		put: function(req, isPatch, cb) {
			var prev = value,
				err;

			if (typeof req.body !== typeof value) {
				err = new Error("Invalid value type");
				err.code = 400;
			} else {
				try {
					value = req.body;
					setter(value);
				} catch(e) {
					err = e;
					value = prev;
				}
			}

			process.nextTick(function() {
				cb(err);
			});
		},

		del: function(req, cb) {
			var prev = value,
				err;

			try {
				value = undefined;
				setter(value);
			} catch(e) {
				err = e;
				value = prev;
			}

			process.nextTick(function() {
				cb(err);
			});
		}
	};
}


function nativeResource(name, obj, setter) {
	var root = obj;

	setter = setter || function(value) { root = value };

	resource(name, createNativeResource(obj, setter));
}


nativeResource.create = createNativeResource;
module.exports = nativeResource;
*/