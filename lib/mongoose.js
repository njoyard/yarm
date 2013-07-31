/*jshint node:true */

"use strict";

var mongoose = require("mongoose"),
	resource = require("./resource"),
	utils = require("./utils"),

	DocumentArray = mongoose.Types.DocumentArray,
	Embedded = mongoose.Types.Embedded,
	DocumentArraySchema = mongoose.Schema.Types.DocumentArray,
	EmbeddedSchema = mongoose.Schema.Types.Embedded,

	rxAllDots = /\./g;


function getPath(obj, path) {
	var parts = path.split(".");

	while (parts.length) {
		if (!obj) {
			return;
		}

		obj = obj[parts.shift()];
	}

	return obj;
}


function getObject(req, doc, prefix) {
	var obj = doc.toObject({ virtuals: true });

	utils.addHref(req, obj, prefix, obj._id);
	prefix = prefix + "/" + obj._id;

	if (doc.schema) {
		doc.schema.eachPath(function(path, type) {
			var urlpath = path.replace(rxAllDots, "/");

			if (type instanceof DocumentArraySchema) {
				getPath(obj, path).forEach(function(subobj) {
					utils.addHref(req, subobj, prefix + "/" + urlpath, subobj._id);
				});
			}
		});
	}

	return obj;
}


/**
 * Mongoose document property resource helper
 */
function mongooseValueResource(prefix, doc, path) {
	return {
		get: function(req, cb) {
			process.nextTick(function() {
				cb(null, doc.get(path));
			});
		},

		put: function(req, data, patch, cb) {
			doc.set(path, data);
			doc.save(function(err) {
				cb(err, doc.get(path));
			});
		}
	};
}

/**
 * Mongoose document resource helper
 */
function mongooseDocResource(prefix, doc) {
	return {
		sub: function(id, cb) {
			var subitem = doc.get(id),
				subprefix = prefix + "/" + doc._id + "/" + id;

			if (subitem instanceof DocumentArray) {
				subitem = mongooseDocArrayResource(subprefix, doc, id);
			} else if (subitem instanceof Embedded) {
				subitem = mongooseDocResource(subprefix, subitem);
			} else {
				subitem = mongooseValueResource(subprefix, doc, id);
			}

			process.nextTick(function() {
				cb(null, subitem);
			});
		},

		get: function(req, cb) {
			var body = getObject(req, doc, prefix);

			process.nextTick(function() {
				cb(null, body);
			});
		},

		put: function(req, data, patch, cb) {
			var resource = this;

			doc.update(data, function(err) {
				if (err) {
					cb(err);
				} else {
					resource.get(req, cb);
				}
			});
		},

		del: function(req, cb) {
			doc.remove(cb);
		}
	};
}


/**
 * Mongoose document array resource helper
 */
function mongooseDocArrayResource(prefix, doc, path) {
	var docArray = doc.get(path);

	return {
		isCollection: true,

		sub: function(id, cb) {
			var subdoc = docArray.id(id);

			process.nextTick(function() {
				cb(null, subdoc ? mongooseDocResource(prefix, subdoc) : null);
			});
		},

		count: function(req, cb) {
			process.nextTick(function() {
				cb(null, docArray.length);
			});
		},

		list: function(req, offset, limit, cb) {
			var sdocs;

			if (limit > 0) {
				sdocs = docArray.slice(offset, offset+limit);
			} else {
				sdocs = docArray.slice(offset);
			}

			process.nextTick(function() {
				cb(null, sdocs.map(function(sdoc) {
					return getObject(req, sdoc, prefix);
				}));
			});
		},

		post: function(req, data, cb) {
			docArray.push(data);
			doc.save(cb);
		}
	};
}


/**
 * Define a REST resource that gives access to a Mongoose model collection
 *
 * @param name resource name
 * @param model Mongoose model
 */
function mongooseResource(name, model) {
	resource(name, {
		isCollection: true,

		sub: function(id, cb) {
			model.findById(id, function(err, item) {
				cb(err, item ? mongooseDocResource(name, item) : null);
			});
		},

		count: function(req, cb) {
			return model.count(cb);
		},

		list: function(req, offset, limit, cb) {
			return model.find({}).skip(offset).limit(limit).exec(function(err, items) {
				cb(err, items.map(function(item) {
					return getObject(req, item, name);
				}));
			});
		},

		post: function(req, data, cb) {
			model.create(data, cb);
		}
	});
}


module.exports = mongooseResource;
