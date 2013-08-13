/*jshint node:true */

"use strict";

var mongodb = require("mongodb"),
	mongoose = require("mongoose"),
	util = require("util"),

	resource = require("./resource"),
	utils = require("./utils"),

	ObjectId = mongodb.BSONPure.ObjectID,
	Schema = mongoose.Schema,
	CastError = mongoose.SchemaType.CastError,
	DocumentArray = mongoose.Types.DocumentArray,
	DocumentArraySchema = mongoose.Schema.Types.DocumentArray,

	rxAllDots = /\./g,
	rxAllDollars = /\$/g,
	rxAllAsterisks = /\*/g,
	rxQueryRegex = /^\/(.*)\/$/;



/*!
 * Generic helpers
 */


/* Get property path value in a document or in a plain object */
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
					definition[method] = undefined;
				} else {
					definition[method] = override.methods[method].bind(null, context);
				}
			});
		}
	});
}


/* Recursively add _href properties */
function addHrefs(req, item, repr, path) {
	repr._href = utils.getHref(req, path);

	if (item.schema && typeof item.schema.eachPath === "function") {
		// TODO handle virtuals ?
		item.schema.eachPath(function(subpath, type) {
			var val = getPath(item, subpath),
				rval = getPath(repr, subpath);

			if (typeof val === "undefined" || typeof rval === "undefined") {
				return;
			}

			if (type instanceof DocumentArraySchema) {
				val.forEach(function(subitem, index) {
					addHrefs(req, subitem, rval[index], path + "/" + subpath.replace(rxAllDots, "/") + "/" + subitem._id);
				});
			} else if (typeof val === "object" &&  !(val instanceof ObjectId) && !("_href" in rval)) {
				addHrefs(req, val, rval, path + "/" + subpath.replace(rxAllDots, "/"));
			}
		});
	} else {
		Object.keys(item).forEach(function(key) {
			var val = item[key],
				rval = repr[key];

			if (typeof val === "undefined" || typeof rval === "undefined") {
				return;
			}

			if (typeof val === "object" && !("_href" in rval)) {
				addHrefs(req, val, rval, path + "/" + key);
			}
		});
	}
}



/*!
 * Search query helpers
 */


/* Generate a mongoose query operator from a ?query= request parameter */
function createQueryOperator(query) {
	return {
		$or: query.split(" OR ").map(function(orOperand) {
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


/* Match a mongoose query criterion to a document */
function matchQueryCriterion(crit, doc) {
	return Object.keys(crit).every(function(path) {
		var value = getPath(doc, path) || "",
			match = crit[path];

		if (typeof match === "string") {
			return value.toString() === match;
		} else if ("$regex" in match) {
			return !!value.toString().match(match.$regex);
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



/*!
 * Aggregate helpers
 */


/* Create an aggregate pipeline from the base pipeline, the request query if
   any, and contextual additions */
function createAggregatePipeline(req, pipeline, additions) {
	pipeline = pipeline.slice(0);

	if (req && req.param("query")) {
		pipeline.push({ $match: createQueryOperator(req.param("query")) });
	}

	for (var i = 0, len = additions.length; i < len; i++) {
		pipeline.push(additions[i]);
	}

	return pipeline;
}



/*!
 * Resource constructors
 */


/**
 * Base constructor for Mongoose document elements
 *
 * @param rootDoc root Mongoose document
 * @param elem document element (field value, subdocument, document array...)
 * @param context request context
 *
 * context has the following properties:
 *  "root"      root mongoose document
 *  "path"      URI path from REST root
 *  "chain"     chain of parent mongoose elements
 *  "link"      link to parent: { objectid: ObjectId } for DocumentArray elements,
 *              { field: "field" } for document paths,  { key: "key" } for value
 *              subfields
 *  "options"   mongooseResource options
 */
function MongooseDocumentElement(elem, context) {
	this._elem = elem;

	this._root = context.root;
	this._path = context.path;
	this._chain = context.chain;
	this._link = context.link;
	this._options = context.options;

	var overrideContext = this._chain.slice(0);
	overrideContext.push(this._elem);

	applyOverrides(this._path, this._options.overrides, overrideContext, this);
}


/**
 * Create a document element with the right constructor
 */
MongooseDocumentElement.create = function(item, ctx) {
	if (item instanceof DocumentArray) {
		return new MongooseDocumentArray(item, ctx);
	} else if (item.schema instanceof Schema) {
		return new MongooseDocument(item, ctx);
	} else if (item) {
		return new MongooseValue(item, ctx);
	}
};


/**
 * Compute element URL
 */
MongooseDocumentElement.prototype._href = function(req) {
	return utils.getHref(req, this._path);
};


/**
 * Set this element to `value`, uses the parent chain and link
 */
MongooseDocumentElement.prototype._set = function(value) {
	var current = this._root,
		chain = this._chain,
		link = this._link,
		length = chain.length;

	if (length === 1) {
		// Empty chain (except for model), this is a root document
		current.set(value);
		return;
	}

	var parent = chain[length - 1];

	if ("objectid" in link) {
		if (!value) {
			parent.splice(parent.indexOf(parent.id(link.objectid)), 1);
		} else {
			parent.id(link.objectid).set(value);
		}
	} else if ("key" in link) {
		parent[link.key] = value;
	} else if ("field" in link) {
		parent.set(link.field, value);
	} else {
		throw new Error("Invalid link");
	}
};


/** 
 * Subresource getter
 */
MongooseDocumentElement.prototype.sub = function(id, cb) {
	var sub = this._subpath(id);

	if (sub) {
		var chain = this._chain.slice(0),
			link;

		if ("field" in sub.link && "field" in this._link) {
			// Keep same parent chain and append new field to link path
			link = { "field": this._link.field + "." + sub.link.field };
		} else {
			// Append this element to parent chain and take new link path
			chain.push(this._elem);
			link = sub.link;
		}

		sub = MongooseDocumentElement.create(
			sub.elem,
			{
				root: this._root,
				path: this._path + "/" + id,
				chain: chain,
				link: link,
				options: this._options
			}
		);
	}

	process.nextTick(function() { cb(null, sub); });
};


/**
 * Save this element in db, actually saves the root element
 */
MongooseDocumentElement.prototype._save = function(cb) {
	this._root.save(cb);
};


/** 
 * Constructor for simple value resources
 */
function MongooseValue(value, context) {
	MongooseDocumentElement.call(this, value, context);
}

util.inherits(MongooseValue, MongooseDocumentElement);

MongooseValue.prototype._subpath = function(path) {
	var sub = this._elem[path];
	if (sub) {
		return {
			elem: sub,
			link: { key: path }
		};
	}
};

MongooseValue.prototype.get = function(req, cb) {
	var value = this._elem;

	process.nextTick(function() { cb(null, value); });
};

MongooseValue.prototype.put = function(req, isPatch, cb) {
	this._set(req.body._value);
	this._save(function(err) {
		cb(err);
	});
};

MongooseValue.prototype.del = function(req, cb) {
	this._set();
	this._save(function(err) {
		cb(err);
	});
};


/**
 * Constructor for document resources
 */
function MongooseDocument(doc, context) {
	MongooseDocumentElement.call(this, doc, context);
}

util.inherits(MongooseDocument, MongooseDocumentElement);

MongooseDocument.prototype._subpath = function(path) {
	var sub = this._elem[path] || this._elem.get(path);
	if (sub) {
		return {
			elem: sub,
			link: { field: path }
		};
	}
};

MongooseDocument.prototype.get = function(req, cb) {
	var value = this._elem.toObject(this._options.toObject);
	addHrefs(req, this._elem, value, this._path);

	process.nextTick(function() { cb(null, value); });
};

MongooseDocument.prototype.put = function(req, isPatch, cb) {
	this._set(req.body);
	this._save(function(err) {
		cb(err);
	});
};

MongooseDocument.prototype.del = function(req, cb) {
	if (this._root === this._elem) {
		this._elem.remove(function(err) {
			cb(err);
		});
	} else {
		this._set();
		this._save(function(err) {
			cb(err);
		});
	}
};


/**
 * Constructor for document array resources
 */
function MongooseDocumentArray(docArray, context) {
	MongooseDocumentElement.call(this, docArray, context);
	
	this._queryResult = null;
	this._key = context.options.getKey(context.path);
}

util.inherits(MongooseDocumentArray, MongooseDocumentElement);

MongooseDocumentArray.prototype._subpath = function(path) {
	var key = this._key,
		elem = this._elem,
		sub;

	if (key === "_id") {
		sub = elem.id(path);
		return {
			elem: sub,
			link: { objectid: sub._id }
		};
	} else {
		for (var i = 0, len = elem.length; i < len; i++) {
			sub = elem[i];
			if (sub[key] ===  path) {
				return {
					elem: sub,
					link: { objectid: sub._id }
				};
			}
		}
	}
};

MongooseDocumentArray.prototype._applyQuery = function(req) {
	if (req.param("query")) {
		// Cache query result
		if (!this._queryResult) {
			this._queryResult = this._elem.filter(
				matchQueryOperator.bind(
					null,
					createQueryOperator(req.param("query"))
				)
			);
		}

		return this._queryResult;
	} else {
		return this._elem;
	}
};

MongooseDocumentArray.prototype.count = function(req, cb) {
	var len = this._applyQuery(req).length;

	process.nextTick(function() { cb(null, len); });
};

MongooseDocumentArray.prototype.list = function(req, offset, limit, cb) {
	var arr = this._applyQuery(req);

	if (limit > 0) {
		arr = arr.slice(offset, offset + limit);
	} else {
		arr = arr.slice(offset);
	}

	process.nextTick(function() { cb(null, arr); });
};

MongooseDocumentArray.prototype.post = function(req, cb) {
	var docArray = this._elem,
		index = NaN;

	if (req.param("index")) {
		index = Number(req.param("index"));
	}

	if (isNaN(index)) {
		index = docArray.length;
	}

	docArray.splice(Math.max(0, Math.min(docArray.length, index)), 0, req.body);
	this._save(function(err) {
		cb(err);
	});
};


/*!
 * Entry points: public resource creation helpers
 */

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
 *   "key"        identifier property, defaults to "_id"
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
 * they receive a array containing the of objects from the Model to the target
 * (ie. Model, then Document, then field for example) as an additional first
 * argument.
 */
function mongooseResource(name, Model, options) {
	options = options || {};
	options.key = options.key || "_id";
	options.query = options.query || function() { return Model.find(); };
	options.overrides = Object.keys(options.overrides || {}).map(function(pattern) {
		return {
			regexp: makePathRegexp(pattern),
			methods: options.overrides[pattern]
		};
	});

	if (typeof options.key === "string") {
		options.getKey = function(path) {
			return path === name ? options.key : "_id";
		};
	} else {
		options.key = Object.keys(options.key).map(function(pattern) {
			return {
				regexp: makePathRegexp(pattern),
				key: options.key[pattern]
			};
		});

		options.getKey = function(path) {
			for (var i = 0, len = options.key.length; i < len; i++) {
				var keydef = options.key[i];

				if (keydef.regexp.exec(path)) {
					return keydef.key;
				}
			}

			return "_id";
		};
	}

	var definition = {
		sub: function(id, cb) {
			var crit = {};
			crit[options.getKey(name)] = id;

			options.query().find(crit).findOne(function(err, item) {
				if (err instanceof CastError) {
					// Could not cast id to key type => not found
					cb();
					return;
				}

				cb(err, item ? MongooseDocumentElement.create(item, {
					root: item,
					path: name + "/" + id,
					chain: [Model],
					link: {},
					options: options
				}) : null);
			});
		},

		count: function(req, cb) {
			var query = options.query();
			if (req.param("query")) {
				// Cache query operator
				if (!req._queryOperator) {
					req._queryOperator = createQueryOperator(req.param("query"));
				}

				query = query.find(req._queryOperator);
			}

			query.count(cb);
		},

		list: function(req, offset, limit, cb) {
			var query = options.query();
			if (req.param("query")) {
				// Cache query operator
				if (!req._queryOperator) {
					req._queryOperator = createQueryOperator(req.param("query"));
				}

				query = query.find(req._queryOperator);
			}

			query = query.skip(offset).limit(limit);

			if (options.sort) {
				query = query.sort(options.sort);
			}

			return query.exec(function(err, items) {
				cb(err, items.map(function(item) {
					var obj = item.toObject(options.toObject);
					addHrefs(req, item, obj, name + "/" + item[options.getKey(name)]);

					return obj;
				}));
			});
		},

		post: function(req, cb) {
			Model.create(req.body, cb);
		}
	};

	applyOverrides(name, options.overrides, Model, definition);
	resource(name, definition);
}


function mongooseAggregateResource(name, model, pipeline, options) {
	options = options || {};
	options.subResources = options.subResources || {};

	resource(name, {
		count: function(req, cb) {
			var aggregateArgs = createAggregatePipeline(req, pipeline, [
				{ $group: { _id: 0, count: { $sum: 1 } } }
			]);

			aggregateArgs.push(function(err, result) {
				if (err) {
					cb(err);
				} else {
					cb(null, result.length ? result[0].count : 0);
				}
			});

			model.aggregate.apply(model, aggregateArgs);
		},

		list: function(req, offset, limit, cb) {
			var aggregateArgs = createAggregatePipeline(req, pipeline, [
				{ $skip: offset },
				{ $limit: limit }
			]);

			aggregateArgs.push(function(err, items) {
				if (err) {
					cb(err);
				} else {
					items.forEach(function(item) {
						addHrefs(req, item, item, name + "/" + item._id);
					});

					cb(null, items);
				}
			});
			model.aggregate.apply(model, aggregateArgs);
		},

		sub: function(id, cb) {
			var oid, match;

			try {
				oid = new ObjectId(id);
				match = { $or: [{ "_id": id }, { "_id": oid }] };
			} catch(e) {
				// Invalid ObjectID
				match = { "_id": id };
			}

			var aggregateArgs = createAggregatePipeline(null, pipeline, [
				{ $match: match },
				{ $limit: 1 }
			]);

			aggregateArgs.push(function(err, result) {
				if (err) {
					cb(err);
				} else if (result.length) {
					var item = result[0];

					cb(null, {
						get: function(req, cb) {
							addHrefs(req, item, item, name + "/" + item._id);
							cb(null, item);
						},

						sub: function(id, cb) {
							if (id in options.subResources) {
								cb(null, options.subResources[id](item));
							} else {
								cb();
							}
						}
					});
				} else {
					cb();
				}
			});

			model.aggregate.apply(model, aggregateArgs);
		}
	});
}


mongooseResource.aggregate = mongooseAggregateResource;
module.exports = mongooseResource;
