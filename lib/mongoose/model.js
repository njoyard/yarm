import queryHelpers from "./query";
import mongoose from "mongoose";

const { SchemaType: { CastError } } = mongoose;

/*!
 * Misc helpers
 */

function getObject(req, item) {
  if (typeof item.toObject === "function") {
    item._request = req;
    return item.toObject(req.options.toObject);
  } else {
    return item;
  }
}

/*!
 * Document resource handlers
 */

function mongooseCollCount(req, cb) {
  let query = req.options.query();

  if (req.query["query"]) {
    // Cache query operator
    if (!req._queryOperator) {
      req._queryOperator = queryHelpers.create(req.query["query"]);
    }

    query = query.find(req._queryOperator);
  }

  query.count(function(err, count) {
    cb(err, count);
  });
}

function mongooseCollList(req, offset, limit, cb) {
  let { options } = req;
  let query = options.query();

  if (req.query["query"]) {
    // Cache query operator
    if (!req._queryOperator) {
      req._queryOperator = queryHelpers.create(req.query["query"]);
    }

    query = query.find(req._queryOperator);
  }

  query = query.skip(offset).limit(limit);

  if (req.query["sort"]) {
    query = query.sort(req.query["sort"]);
  } else if (options.sort) {
    query = query.sort(options.sort);
  }

  return query.exec(function(err, items) {
    if (err) {
      cb(err);
    } else {
      cb(
        null,
        items.map(function(item) {
          let obj = getObject(req, item);
          return obj;
        })
      );
    }
  });
}

function mongooseCollPost(req, cb) {
  let { mongoose: { model } } = req;

  model.create(req.body, function(err, doc) {
    if (err) {
      cb(err);
    } else {
      if (req.options.postResponse) {
        cb(null, getObject(req, doc));
      } else {
        cb.created();
      }
    }
  });
}

/*!
 * Document resource handlers
 */

function mongooseDocHook(req, next) {
  let { options } = req;

  let crit = {};
  crit[options.key] = req.params.id;
  req.mongoose.path += `/${req.params.id}`;

  options
    .query()
    .find(crit)
    .findOne(function(err, item) {
      if (err instanceof CastError) {
        // id is not valid, just continue without saving item
        return next();
      }

      if (err) {
        return next(err);
      }

      req.mongoose.doc = item;
      next();
    });
}

function mongooseDocGet(req, cb) {
  if (req.mongoose.doc) {
    cb(null, getObject(req, req.mongoose.doc));
  } else {
    cb.notFound();
  }
}

function mongooseDocPut(req, isPatch, cb) {
  let { mongoose: { doc } } = req;

  if (!doc) {
    return cb.notFound();
  }

  doc.set(req.body);
  doc.save(function(err) {
    cb(err);
  });
}

function mongooseDocDel(req, cb) {
  if (!req.mongoose.doc) {
    return cb.notFound();
  }

  req.mongoose.doc.remove(function(err) {
    cb(err);
  });
}

/*!
 * Document path resource handlers
 */

function mongoosePathHook(req, next) {
  let { mongoose: { doc, path: docpath }, options: { subkeys } } = req;

  if (!doc) {
    // We have no doc in the first place, don't try to find member
    return next();
  }

  let path = req.params["*"];
  let parts = path.split("/");

  let fullpath = docpath;
  let current = doc;
  let parent = doc;
  let link = {};

  while (parts.length > 0) {
    let part = parts.shift();
    fullpath += `/${part}`;

    let decoded = decodeURIComponent(part);

    if (current.isMongooseDocumentArray) {
      parent = current;

      let key = "_id";
      if (subkeys) {
        if (typeof subkeys === "string") {
          key = subkeys;
        } else {
          Object.keys(subkeys).forEach(function(pattern) {
            if (req.match(pattern, fullpath)) {
              key = subkeys[pattern];
            }
          });
        }
      }

      if (key !== "_id") {
        [current] = current.filter(function(item) {
          return item[key] === decoded;
        });

        link = { id: current._id };
      } else {
        current = current.id(decoded);
        link = { id: decoded };
      }
    } else {
      if ("field" in link) {
        link.field += `.${decoded}`;
      } else {
        parent = current;
        link = { field: decoded };
      }

      current = parent.get(link.field);
    }

    if (!current) {
      return next();
    }
  }

  req.mongoose.parent = parent;
  req.mongoose.item = current;
  req.mongoose.link = link;

  next();
}

function mongoosePathGet(req, cb) {
  if (!("item" in req.mongoose)) {
    return cb.notFound();
  }

  let { mongoose: { item } } = req;

  if (item.isMongooseDocumentArray) {
    cb.list(mongooseDocArrayCount, mongooseDocArrayList);
  } else {
    cb(null, getObject(req, item));
  }
}

function mongoosePathPut(req, isPatch, cb) {
  if (!("item" in req.mongoose)) {
    return cb.notFound();
  }

  let { body: value, mongoose: { parent, link, doc } } = req;

  if ("_value" in value) {
    value = value._value;
  }

  if ("id" in link) {
    parent.id(link.id).set(value);
  } else if ("field" in link) {
    parent.set(link.field, value);
  } else {
    return cb(new Error("Unknown link type"));
  }

  doc.save(function(err) {
    cb(err);
  });
}

function mongoosePathDel(req, cb) {
  if (!("item" in req.mongoose)) {
    return cb.notFound();
  }

  let { mongoose: { parent, link, doc } } = req;

  if ("id" in link) {
    parent.splice(parent.indexOf(parent.id(link.id)), 1);
  } else if ("field" in link) {
    parent.set(link.field, undefined);
  } else {
    return cb(new Error("Unknown link type"));
  }

  doc.save(function(err) {
    cb(err);
  });
}

function mongoosePathPost(req, cb) {
  if (!("item" in req.mongoose)) {
    return cb.notFound();
  }

  let { mongoose: { item } } = req;

  if (item.isMongooseDocumentArray) {
    mongooseDocArrayPost(req, cb);
  } else if (Array.isArray(item)) {
    if ("_value" in req.body) {
      req.body = req.body._value;
    }
    mongooseDocArrayPost(req, cb);
  } else {
    return cb.methodNotAllowed();
  }
}

/*!
 * Mongoose DocumentArray helpers
 */

function queryDocArray(req) {
  let { mongoose: { item: docArray } } = req;

  if (req.query["query"]) {
    // Cache query result
    if (!req.mongoose._queryResult) {
      req.mongoose._queryResult = docArray.filter(
        queryHelpers.match.bind(null, queryHelpers.create(req.query["query"]))
      );
    }

    return req.mongoose._queryResult;
  } else {
    return docArray;
  }
}

function mongooseDocArrayCount(req, cb) {
  let len = queryDocArray(req).length;
  cb(null, len);
}

function mongooseDocArrayList(req, offset, limit, cb) {
  let items = queryDocArray(req);

  if (limit > 0) {
    items = items.slice(offset, offset + limit);
  } else {
    items = items.slice(offset);
  }

  cb(null, items);
}

function mongooseDocArrayPost(req, cb) {
  let { mongoose: { doc, item: docArray } } = req;
  let index = NaN;

  if (req.query["index"]) {
    index = Number(req.query["index"]);
  }

  if (isNaN(index)) {
    index = docArray.length;
  }

  docArray.splice(Math.max(0, Math.min(docArray.length, index)), 0, req.body);

  doc.save(function(err) {
    if (err) {
      cb(err);
    } else {
      if (req.options.postResponse) {
        cb(null, getObject(req, docArray[index]));
      } else {
        cb.created();
      }
    }
  });
}

/*!
 * Mongoose resource definition helper
 */

function mongooseResource(name, Model) {
  /*jshint validthis:true*/
  let collResource = this.sub(name)
    .hook(function modelHook(req, next) {
      req.mongoose = { model: Model, path: name };
      next();
    })
    .count(mongooseCollCount)
    .list(mongooseCollList)
    .post(mongooseCollPost)
    .set("query", function mongooseDefaultQuery() {
      return Model.find();
    })
    .set("key", "_id");

  let docResource = collResource
    .sub(":id")
    .hook(mongooseDocHook)
    .get(mongooseDocGet)
    .put(mongooseDocPut)
    .del(mongooseDocDel);

  docResource
    .sub("*", mongoosePathHook)
    .get(mongoosePathGet)
    .put(mongoosePathPut)
    .del(mongoosePathDel)
    .post(mongoosePathPost);

  return collResource;
}

module.exports = mongooseResource;
