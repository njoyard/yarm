yarm
====

Yet Another REST Module for node.js and Express.

Usage
-----

```javascript
var app = require("express")(),
	yarm = require("yarm");

yarm.resource("greeting", {
	get: function(req, cb) {
		cb(null, { hello: "world" });
	}
});

app.use("/rest", yarm());
app.listen(80);
```

```sh
$ curl http://localhost/rest/greeting
{ "hello": "world" }
```

Defining resources
------------------

Resources are defined by calling `yarm.resource("name", definition)`. You can
define two main type of resources: documents and collections.

### Documents

Documents are resources that may be retrieved (GET method), removed (DELETE),
replaced (PUT) and updated (PATCH).

#### GET (and HEAD)

To enable the GET method on a resource,  you just need to define a `get` method
on the resource definition.

```javascript
yarm.resource("greeting", {
	get: function(req, cb) {
		cb(null, { hello: "world" });
	}
});
```

```sh
$ curl http://localhost/rest/greeting
{ "hello": "world" }
```

The `get` method receives the Express request object and a callback to call with
an optional `Error` instance, and with the resource representation to send to the
client.  This representation can be one of the following:

* A plain Javascript object to be sent as JSON
* A string, `Buffer` instance, or readable stream
* An instance of `yarm.ResponseBody`.  This enables setting the response mimetype.
* An instance of `yarm.ResponseFile`.  This enables sending files with a specified
  mimetype, using Express' `res.sendfile()`.
* `null` or `undefined` to send a 204 No Content response

Here are some examples:

```javascript
yarm.resource("html", {
	get: function(req, cb) {
		// You can use strings, Buffers or readable streams here
		cb(null, new yarm.ResponseBody("<div>Hello</div>", "text/html"));
	}
});

yarm.resource("song", {
	get: function(req, cb) {
		cb(null, new yarm.ResponseFile(
			"/home/bob/music/song.ogg",
			"audio/ogg"
		));
	}
});

yarm.resource("empty", {
	get: function(req, cb) {
		cb();
	}
});
```

Of course you can use the request object to determine the best response to send
to the client:

```javascript
yarm.resource("greeting", {
	get: function(req, cb) {
		if (req.accept("text, json") === "json") {
			cb(null, { hello: "world" });
		} else {
			cb(null, "Hello World");
		}
	}
});
```

When you pass an `Error` instance to the callback, yarm will send a 500 response
to the client, along with the error message.  You can customize the status code
by setting a `code` property on the `Error` instance.

```javascript
yarm.resource("teapot", {
	get: function(req, cb) {
		var err = new Error("I'm a teapot");
		err.code = 418;

		cb(err);
	}
});
```

#### DELETE

Removing a resource is enabled by defining a `del` method.  This method has the
same prototype as the `get` method.  You may pass content to the callback as its
second parameter, or you may prefer sending a 204 No Content response.

```javascript
var deleted = false;

yarm.resource("deletable", {
	del: function(req, cb) {
		deleted = true;

		// No content
		cb();
	},

	get: function(req, cb) {
		if (deleted) {
			cb();
		} else {
			cb(null, { hello: "world" });
		}
	}
});
```

#### PUT and PATCH

Replacing and updating a resource is enabled by defining a `put` method.  This
method will receive the request object, a boolean indicating whether this is a
PATCH request and a callback.  As for the other methods, you should call the
callback with an optional `Error` instance and with the response body as
parameters.

```javascript
var object = { hello: "world" };

yarm.resource("updateable", {
	put: function(req, isPatch, cb) {
		// You'd have to app.use(express.json()) here so that req.body is defined
		var body = req.body;

		if (isPatch) {
			Object.keys(body).forEach(function(key) {
				object[key] = body[key];
			});
		} else {
			object = body;
		}

		cb();
	},

	get: function(req, cb) {
		cb(null, object);
	}
});
```

```sh
$ curl http://localhost/rest/greeting
{ "hello": "world" }
$ curl -X PATCH --data "{ \"foo\": \"bar\" }" http://localhost/rest/greeting
$ curl http://localhost/rest/greeting
{ "hello": "world", "foo": "bar" }
$ curl -X PUT --data "{ \"foo\": \"bar\" }" http://localhost/rest/greeting
$ curl http://localhost/rest/greeting
{ "foo": "bar" }
```

There is currently no way to enable only one of the PUT and PATCH method at
a time with yarm.  You can still implement that manually however.

```javascript
yarm.resource("patchOnly", {
	put: function(req, isPatch, cb) {
		if (!isPatch) {
			var err = new Error("Not allowed");
			err.code = 406;
			cb(err);
			return;
		}

		// actual PATCH handling
	}
});
```

#### Other methods

yarm does not support other HTTP methods than GET, HEAD, PUT, PATCH and DELETE
on documents.

### Collections

Collections are resources that contain a set of other resources.  They may
be retrieved (GET) or appended to (POST).  Add a truthy `isCollection`
property to a resource definition to tell yarm it is a collection.

#### GET (and HEAD)

To enable GET requests on a collection, define two `count` and `list` methods.

The `count` method receives the request object and a callback as parameters,
and should call the callback with an optional `Error` instance and the total
number of resources in the collection as parameters.  The `list` method
receives the request object, the requested offset and limit, and a callback
as parameters, and should call the callback with an optional `Error` instance
and an array corresponding to the requested items as parameters.  A limit of
zero indicates that the client requests as many items as possible.

```javascript
yarm.resource("collection", {
	isCollection: true,

	count: function(req, cb) {
		cb(null, 3);
	},

	list: function(req, offset, limit, cb) {
		var items = [1, 2, 3];

		if (limit > 0) {
			items = items.slice(offset, offset + limit);
		} else {
			items = items.slice(offset);
		}

		cb(null, items);
	}
});
```

When handling GET requests, yarm will respond with a JSON object containing
a `_count` key with the collection item count, and a `_items` key with the
returned item array.

```sh
$ curl http://localhost/rest/collection
{
	"_count": 3,
	"_items": [1, 2, 3]
}
```

yarm supports two querystring parameters when GETting collections: `offset`
and `limit`.

```sh
$ curl http://localhost/rest/collection?offset=1&limit=1
{
	"_count": 3,
	"_items": [2]
}
```

When no limit is requested, yarm defaults to 10 items.  You can override this
default limit by passing an options object with a `defaultLimit` property when
initializing yarm.

```javascript
app.use("/rest", yarm({ defaultLimit: 2 }));
```

```sh
$ curl http://localhost/rest/collection
{
	"_count": 3,
	"_items": [1, 2]
}
```

#### POST

To enable POST requests on a collection, define a `post` method.  It will
receive the request object and a callback to call with an optional `Error`
instance and the response body as parameters.


```javascript
var array = [1, 2, 3];

yarm.resource("collection", {
	isCollection: true,

	count: function(req, cb) {
		cb(null, array.length);
	},

	list: function(req, offset, limit, cb) {
		var items;

		if (limit > 0) {
			items = array.slice(offset, offset + limit);
		} else {
			items = array.slice(offset);
		}

		cb(null, items);
	},

	post: function(req, cb) {
		array.push(req.body);
		cb();
	}
});
```

```sh
$ curl http://localhost/rest/collection
{
	"_count": 3,
	"_items": [1, 2, 3]
}
$ curl -X POST --data "4" http://localhost/rest/collection
$ curl http://localhost/rest/collection
{
	"_count": 4,
	"_items": [1, 2, 3, 4]
}
```

If you would like to insert items at a specific index in the collection,
you can implement it using a custom querystring parameter.

```javascript
var array = [1, 2, 3];

yarm.resource("collection", {
	/* ... */

	post: function(req, cb) {
		if (req.params("index")) {
			array.splice(Number(req.params("index")), 0, [req.body]);
		} else {
			array.push(req.body);
		}

		cb();
	}
});
```

```sh
$ curl http://localhost/rest/collection
{
	"_count": 3,
	"_items": [1, 2, 3]
}
$ curl -X POST --data "1.5" http://localhost/rest/collection?index=1
$ curl http://localhost/rest/collection
{
	"_count": 4,
	"_items": [1, 1.5, 2, 3]
}
```

#### Other methods

yarm does not support other HTTP methods than GET, HEAD and POST on
collections.

### Sub-resources

You can enable accessing sub-resources on any resource in yarm, no matter
whether the resource is a document or a collection.  To enable sub-resource
lookup on a resource, define a `sub` method on that resource.  This method
will receive the sub-resource name and a callback as arguments.  It should
call the callback with an optional `Error` instance and the sub-resource
definition as parameters.

```javascript
yarm.resource("greeting", {
	get: function(req, cb) {
		cb(null, { hello: "world" });
	},

	sub: function(name, cb) {
		if (name === "french") {
			cb(null, {
				get: function(req, cb) {
					cb(null, { bonjour: "tout le monde" });
				}
			});
		} else {
			cb();
		}
	}
});
```

```sh
$ curl http://localhost/rest/greeting
{ "hello": "world" }
$ curl http://localhost/rest/greeting/french
{ "bonjour": "tout le monde" }
```

When the `sub` method calls its callback argument without a resource definition,
or when a sub-resource is requested on a resource without a `sub` method, yarm
sends a 404 response to the client.

Of course you can nest sub-resource definitions.  In that case, yarm will chain
calls to each `sub` method, until it finds the requested resource, until a
resource in the tree has no such method, or until one calls its callback without
any resource definition.  In the two latter cases, yarm sends a 404 response to
the client.

```javascript
yarm.resource("greeting", {
	get: function(req, cb) {
		cb(null, { hello: "world" });
	},

	sub: function(name, cb) {
		if (name === "french") {
			cb(null, {
				get: function(req, cb) {
					cb(null, { bonjour: "tout le monde" });
				},

				sub: function(who, cb) {
					cb(null, {
						get: function(req, cb) {
							cb(null, { bonjour: who });
						}
					});
				}
			});
		} else {
			cb();
		}
	}
});
```

```sh
$ curl http://localhost/rest/greeting/french/alice
{ "bonjour": "alice" }
```