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

#### GET

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
			})
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
$ curl -X PUT --data "{ \"foo\": \"bar\" }" http://localhost/rest/greeting
$ curl http://localhost/rest/greeting
{ "foo": "bar" }
```

There is no way to enable only one of the PUT and PATCH method at a time with
yarm.  You can still implement that manually however:

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

### Collections

More to come soon...