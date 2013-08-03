/*jshint node:true */

"use strict";

var mongoose = require("mongoose"),
	resource = require("./resource"),
	utils = require("./utils"),

	DocumentArray = mongoose.Types.DocumentArray,
	Embedded = mongoose.Types.Embedded,
	DocumentArraySchema = mongoose.Schema.Types.DocumentArray,
	EmbeddedSchema = mongoose.Schema.Types.Embedded,

	rxAllDots = /\./g,
	rxAllDollars = /\$/g,
	rxAllAsterisks = /\*/g,
	rxQueryRegex = /^\/(.*)\/$/;


/*
	query syntax :
		a:value OR b:value AND c:value ...

	ANDs have precedence over ORs
	values can be plain strings or /regexp/
	fields names can also be dot-separated paths
 */
function applyQuery(req, query) {
	if (req.param("query")) {
		query.find({
			$or: req.param("query").split(" OR ").map(function(orOperand) {
				return {
					$and: orOperand.split(" AND ").map(function(andOperand) {
						var split = andOperand.split(":"),
							field = split[0],
							value = split[1],
							operator = {},
							matches;

						matches = value.match(rxQueryRegex);
						if (matches) {
							operator[field] = { $regex: new RegExp(matches[1]) };
						} else {
							operator[field] = value;
						}

						return operator;
					})
				};
			})
		});
	}

	return query;
}

function queryDocumentArray(
	
)


function makePathRegexp(pattern) {
	pattern = pattern.replace(rxAllDots, ".")
	                 .replace(rxAllDollars, "[^.]+")
	                 .replace(rxAllAsterisks, ".+");

	return new RegExp("^" + pattern + "$");
}


function applyOverrides(resourcePath, overrides, context, definition) {
	overrides.forEach(function(override) {
		if (override.regexp.exec(resourcePath)) {
			Object.keys(override.methods).forEach(function(method) {
				if (!override.methods[method]) {
					delete definition[method];
				} else {
					definition[method] = override.methods[method].bind(null, context);
				}
			});
		}
	});

	return definition;
}


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


function getObject(req, doc, urlpath, options) {
	var obj = doc.toObject(options.toObject);

	utils.addHref(req, obj, urlpath);

	if (doc.schema) {
		doc.schema.eachPath(function(path, type) {
			var suburlpath = path.replace(rxAllDots, "/");

			if (type instanceof DocumentArraySchema) {
				var objs = getPath(obj, path);

				if (objs) {
					objs.forEach(function(subobj) {
						utils.addHref(req, subobj, urlpath + "/" + suburlpath + "/" + subobj._id);
					});
				}
			}
		});
	}

	return obj;
}


/**
 * Mongoose document property resource helper
 */
function mongooseValueResource(urlpath, doc, path, options) {
	var value = doc.get(path);

	return applyOverrides(
		urlpath,
		options.overrides,
		value,
		{
			get: function(req, cb) {
				process.nextTick(function() {
					cb(null, value);
				});
			},

			put: function(req, patch, cb) {
				doc.set(path, req.body);
				doc.save(function(err) {
					cb(err, doc.get(path));
				});
			}
		}
	);
}

/**
 * Mongoose document resource helper
 */
function mongooseDocResource(urlpath, doc, options) {
	return applyOverrides(
		urlpath,
		options.overrides,
		doc,
		{
			sub: function(id, cb) {
				var subitem = doc.get(id),
					suburlpath = urlpath + "/" + id;

				if (subitem instanceof DocumentArray) {
					subitem = mongooseDocArrayResource(suburlpath, doc, id, options);
				} else if (subitem instanceof Embedded) {
					subitem = mongooseDocResource(suburlpath, subitem, options);
				} else {
					subitem = mongooseValueResource(suburlpath, doc, id, options);
				}

				process.nextTick(function() {
					cb(null, subitem);
				});
			},

			get: function(req, cb) {
				var body = getObject(req, doc, urlpath, options);

				process.nextTick(function() {
					cb(null, body);
				});
			},

			put: function(req, patch, cb) {
				var resource = this;

				doc.update(req.body, function(err) {
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
		}
	);
}


/**
 * Mongoose document array resource helper
 */
function mongooseDocArrayResource(urlpath, doc, path, options) {
	var docArray = doc.get(path);

	return applyOverrides(
		urlpath,
		options.overrides,
		docArray,
		{
			sub: function(id, cb) {
				var subdoc = docArray.id(id);

				process.nextTick(function() {
					cb(null, subdoc ? mongooseDocResource(urlpath + "/" + id, subdoc, options) : null);
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
						return getObject(req, sdoc, urlpath + "/" + sdoc._id, options);
					}));
				});
			},

			post: function(req, cb) {
				docArray.push(req.body);
				doc.save(cb);
			}
		}
	);
}


/**
 * Define a REST resource that gives access to a Mongoose model collection
 *
 * @param name resource name
 * @param model Mongoose model
 * @param options resource options object
 *
 * Possible option keys:
 *   "sort"		  mongodb sort query, defaults to no sort
 *   "query"      optional, function to create a mongoose query.  Defaults
 *                to calling model.find().
 *   "toObject"   options to pass to MongooseDocument#toObject calls
 *   "overrides"  method overrides, see below
 *
 * GET requests on the root resource support a "query" querystring argument,
 * which must contain criteria in the form "fieldname:value" separated by
 * "AND" and "OR" operators.  Field names can be paths, values can also be
 * regexes (when starting and ending with a slash) and AND operators take
 * precedence over OR operators.  This will return all employees either
 * with a name starting with "Bob " and a salary of 35000, or who live in
 * Seattle.
 *
 *    ?query=name:/^Bob / AND salary:35000 OR home.city:Seattle
 *
 *
 * Method overrides are possible by passing an object whose keys are resource
 * path patterns:
 *
 *     {
 *         "resourcename": {
 *              get: function(obj, req, cb) { ... } 
 *         },
 *         "resourcename/property": {
 *              // Disable get
 *              get: undefined
 *         },
 *     }
 *
 * A "$" character in a path pattern will match any single path element:
 *
 *     {
 *         // Will match /resourcename/a/foo/b
 *         // but not /resourcename/a/foo/bar/b
 *         "resourcename/a/$/b": {
 *              get: function(obj, req, cb) { ... } 
 *         }
 *     }
 * 
 * A "*" character in a path pattern will match one or more path elements:
 *
 *     {
 *         // Will match /resourcename/a/foo/b and /resourcename/a/foo/bar/b
 *         // but not /resourcename/a/b
 *         // (additional space added to prevent closing this comment)
 *         "resourcename/a/* /b": {
 *              get: function(obj, req, cb) { ... } 
 *         }
 *     }
 *
 * All methods overrides work exactly the same as normal yarm methods, except
 * they receive the current object (Model, Document, DocumentArray or property
 * value) they first argument in addition.
 */
function mongooseResource(name, model, options) {
	options = options || {};
	options.query = options.query || function() { return model.find(); };
	options.overrides = Object.keys(options.overrides || {}).map(function(pattern) {
		return {
			regexp: makePathRegexp(pattern),
			methods: options.overrides[pattern]
		};
	});

	resource(name, applyOverrides(
		name,
		options.overrides,
		model,
		{
			sub: function(id, cb) {
				options.query().find({ _id: id }).findOne(function(err, item) {
					cb(err, item ? mongooseDocResource(name + "/" + id, item, options) : null);
				});
			},

			count: function(req, cb) {
				return applyQuery(req, options.query()).count(cb);
			},

			list: function(req, offset, limit, cb) {
				var query = applyQuery(req, options.query()).skip(offset).limit(limit);

				if (options.sort) {
					query = query.sort(options.sort);
				}

				return query.exec(function(err, items) {
					cb(err, items.map(function(item) {
						return getObject(req, item, name + "/" + item._id, options);
					}));
				});
			},

			post: function(req, cb) {
				model.create(req.body, cb);
			}
		}
	));
}


module.exports = mongooseResource;
