/*jshint node:true */

"use strict";

var mongoose = require("mongoose"),
	util = require("util"),

	resource = require("./resource"),
	utils = require("./utils"),

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
function addHrefs(req, obj, path) {
	obj._href = utils.getHref(req, path);

	if (obj.schema && typeof obj.schema.eachPath === "function") {
		obj.schema.eachPath(function(subpath, type) {
			var val = getPath(obj, subpath);

			if (!val) {
				return;
			}

			if (type instanceof DocumentArraySchema) {
				val.forEach(function(subobj) {
					addHrefs(req, subobj, path + "/" + subpath.replace(rxAllDots, "/") + "/" + subobj._id);
				});
			} else if (typeof val === "object" &&  !("_href" in val)) {
				addHrefs(req, val, path + "/" + subpath.replace(rxAllDots, "/"));
			}
		});
	} else {
		Object.keys(obj).forEach(function(key) {
			var val = obj[key];

			if (typeof val === "object" && !("_href" in val)) {
				addHrefs(req, val, path + "/" + key);
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
	var sub = this._elem[path];
	if (sub) {
		return {
			elem: sub,
			link: { field: path }
		};
	}
};

MongooseDocument.prototype.get = function(req, cb) {
	var value = this._elem.toObject(this._options.toObject);
	value._href = this._href(req);

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
	this._elem.push(req.body);
	this._save(function(err) {
		cb(err);
	});
};


/*!
 * Entry points: public resource creation helpers
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
					addHrefs(req, obj, name + "/" + item[options.getKey(name)]);

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


module.exports = mongooseResource;