/*jshint node:true*/
"use strict";

var root = require("./root");


/*!
 * Root handlers
 */


function nativeGet(req, cb) {
	cb(null, req.nativeRoot);
}


var nativePost = nativePropertyPost;


/*!
 * Property handlers
 */


function nativePropertyHook(req, next) {
	var path = req.params["*"].split("/");
	var obj = req.nativeRoot;
	var parent;
	var property;

	while (path.length) {
		property = path.shift();

		if (!(property in obj)) {
			return next.notFound();
		}

		parent = obj;
		obj = obj[property];
	}

	req.nativeParent = parent;
	req.nativeProperty = property;
	req.nativeTarget = obj;

	next();
}


function nativePropertyGet(req, cb) {
	cb(null, req.nativeTarget);
}


function nativePropertyPut(req, isPatch, cb) {
	var parent = req.nativeParent;
	var property = req.nativeProperty;
	var target = req.nativeTarget;

	var value = req.body;

	if ("_value" in value) {
		value = value._value;
	}

	if (isPatch) {
		if (typeof target !== "object") {
			return cb.methodNotAllowed();
		}

		Object.keys(req.body).forEach(function(key) {
			target[key] = value[key];
		});
	} else {
		parent[property] = value;
	}

	cb();
}


function nativePropertyPost(req, cb) {
	var target = req.nativeTarget;

	if (Array.isArray(target)) {
		var value = req.body;

		if ("_value" in value) {
			value = value._value;
		}

		target.push(value);
	} else if (typeof target === "object") {
		if (!("_key" in req.body) || !("_value" in req.body) || typeof req.body._key !== "string") {
			return cb.badRequest();
		}

		target[req.body._key] = req.body._value;
	} else {
		cb.methodNotAllowed();
	}

	cb();
}


function nativePropertyDelete(req, cb) {
	var parent = req.nativeParent;
	var property = req.nativeProperty;

	delete parent[property];

	cb();
}




/*!
 * Native resource definition helper
 */


/* TODO Supported options:
 * 	objectCollections: serve objects as collections of their keys (defaults to false)
 *  arrayCollections: serve arrays as collections of their items (defaults to false)
 */
function nativeResource(name, obj) {
	var resource = root.sub(name);

	resource
		.hook(function nativeHook(req, next) {
			req.nativeRoot = req.nativeTarget = obj;
			next();
		})
		.get(nativeGet)
		.post(nativePost);

	resource.sub("*")
		.hook(nativePropertyHook)
		.get(nativePropertyGet)
		.put(nativePropertyPut)
		.post(nativePropertyPost)
		.del(nativePropertyDelete);

	return resource;
}


module.exports = nativeResource;