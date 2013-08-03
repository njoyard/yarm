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


/* Generate a mongoose query operator from a ?query= request parameter */
function createQueryOperator(req) {
	return {
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
	};
}


/* Apply ?query= query operator to mongoose query */
function applyMongooseQuery(req, query) {
	if (req.param("query")) {
		query.find(createQueryOperator(req));
	}

	return query;
}


/* Match a mongoose query criterion to a document */
function matchQueryCriterion(crit, doc) {
	return Object.keys(crit).every(function(path) {
		var value = getPath(doc, path) || "",
			match = crit[path];

		if (typeof match === "string") {
			return value === match;
		} else if ("$regex" in match) {
			return !!value.match(match.$regex);
		} else {
			throw new Error("Unsupported query criterion");
		}
	});
}


/* Match a mongoose query operator to a document */
function matchQueryOperator(operator, doc) {
	if ("$or" in operator) {
		return operator.$or.some(function(op) {
			return matchQueryOperator(op, doc);
		});
	} else if ("$and" in operator) {
		return operator.$and.every(function(op) {
			return matchQueryOperator(op, doc);
		});
	} else {
		return matchQueryCriterion(operator, doc);
	}
}

/* Apply ?query= query operator to a document array */
function queryDocumentArray(req, docArray) {
	if (req.param("query")) {
		return docArray.filter(matchQueryOperator.bind(null, createQueryOperator(req)));
	}

	return docArray;
}


/* Make a path regexp from an override path pattern */
function makePathRegexp(pattern) {
	pattern = pattern.replace(rxAllDots, ".")
	                 .replace(rxAllDollars, "[^.]+")
	                 .replace(rxAllAsterisks, ".+");

	return new RegExp("^" + pattern + "$");
}


/* Apply overrides to a resource definition */
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


/* Get property path value in a document */
function getPath(obj, path) {
	if (typeof obj.get === "function") {
		return obj.get(path);
	}

	var parts = path.split(".");

	while (parts.length) {
		if (!obj) {
			return;
		}

		obj = obj[parts.shift()];
	}

	return obj;
}


/* Fancy toObject on Documents, adds _href and handles DocumentArrays inside it */
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


/* Create a resource from a given path in a mongoose Document */
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

/* Create a resource from a mongoose Document */
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


/* Create a resource from a mongoose DocumentArray at doc[path] */
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
					cb(null, queryDocumentArray(req, docArray).length);
				});
			},

			list: function(req, offset, limit, cb) {
				var sdocs = queryDocumentArray(req, docArray);

				if (limit > 0) {
					sdocs = sdocs.slice(offset, offset+limit);
				} else {
					sdocs = sdocs.slice(offset);
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
 * GET requests on the root resource or on subdocument arrays support a
 * "query" querystring argument, which must contain criteria in the form
 * "fieldname:value" separated by "AND" and "OR" operators.  Field names can
 * be paths, values can also be regexes (when starting and ending with a slash)
 * and AND operators take precedence over OR operators.  This will return all
 * employees either with a name starting with "Bob " and a salary of 35000, or
 * who live in Seattle.
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
				return applyMongooseQuery(req, options.query()).count(cb);
			},

			list: function(req, offset, limit, cb) {
				var query = applyMongooseQuery(req, options.query()).skip(offset).limit(limit);

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
