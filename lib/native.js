/*!
 * Root handlers
 */

let nativeGet = nativePropertyGet;
let nativePost = nativePropertyPost;

/*!
 * Property handlers
 */

function nativePropertyHook(req, next) {
  let path = req.params["*"].split("/");
  let obj = req.nativeRoot;
  let parent;
  let property;

  while (path.length) {
    property = path.shift();

    if (!(property in obj)) {
      delete req.nativeTarget;
      return next();
    }

    parent = obj;
    obj = obj[property];
  }

  req.nativeParent = parent;
  req.nativeProperty = property;
  req.nativeTarget = obj;

  next();
}

function nativeArrayCount(req, cb) {
  if (!("nativeTarget" in req)) {
    return cb.notFound();
  }

  cb(null, req.nativeTarget.length);
}

function nativeArrayList(req, offset, limit, cb) {
  if (!("nativeTarget" in req)) {
    return cb.notFound();
  }

  let target = req.nativeTarget;
  let arr;

  if (limit > 0) {
    arr = target.slice(offset, offset + limit);
  } else {
    arr = target.slice(offset);
  }

  cb(null, arr);
}

function nativeObjectCount(req, cb) {
  cb(null, Object.keys(req.nativeTarget).length);
}

function nativeObjectList(req, offset, limit, cb) {
  let keys = Object.keys(req.nativeTarget);

  if (limit > 0) {
    keys = keys.slice(offset, offset + limit);
  } else {
    keys = keys.slice(offset);
  }

  cb(null, keys);
}

function nativePropertyGet(req, cb) {
  if (!("nativeTarget" in req)) {
    return cb.notFound;
  }

  let target = req.nativeTarget;

  if (Array.isArray(target)) {
    if (req.options.rawArrays) {
      cb(null, target);
    } else {
      cb.list(nativeArrayCount, nativeArrayList);
    }
  } else if (typeof target === "object") {
    if (req.options.objectCollections) {
      cb.list(nativeObjectCount, nativeObjectList);
    } else {
      cb(null, target);
    }
  } else {
    cb(null, target);
  }
}

function nativePropertyPut(req, isPatch, cb) {
  let parent = req.nativeParent;
  let property = req.nativeProperty;
  let target = req.nativeTarget;

  let value = req.body;

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
  if (!("nativeTarget" in req)) {
    return cb.notFound();
  }

  let target = req.nativeTarget;
  let created;

  if (Array.isArray(target)) {
    let value = req.body;

    if ("_value" in value) {
      value = value._value;
    }

    created = value;

    target.push(value);
  } else if (typeof target === "object") {
    if (
      !("_key" in req.body) ||
      !("_value" in req.body) ||
      typeof req.body._key !== "string"
    ) {
      return cb.badRequest();
    }

    created = target[req.body._key] = req.body._value;
  } else {
    cb.methodNotAllowed();
  }

  if (req.options.postResponse) {
    cb(null, created);
  } else {
    cb.created();
  }
}

function nativePropertyDelete(req, cb) {
  if (!("nativeTarget" in req)) {
    return cb.notFound();
  }

  let parent = req.nativeParent;
  let property = req.nativeProperty;

  if (Array.isArray(parent) && !req.options.sparseArrays) {
    parent.splice(property, 1);
  } else {
    delete parent[property];
  }

  cb();
}

/*!
 * Native resource definition helper
 */

module.exports = function(name, obj) {
  let resource = this.sub(name);

  resource
    .hook(function nativeHook(req, next) {
      req.nativeRoot = req.nativeTarget = obj;
      next();
    })
    .get(nativeGet)
    .post(nativePost);

  resource
    .sub("*")
    .hook(nativePropertyHook)
    .get(nativePropertyGet)
    .put(nativePropertyPut)
    .post(nativePropertyPost)
    .del(nativePropertyDelete);

  return resource;
};
