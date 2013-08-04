yarm
====

Yet Another REST Module for node.js and Express.

[![Build Status](https://travis-ci.org/njoyard/yarm.png)](http://travis-ci.org/njoyard/yarm)

**Table of Contents**

- [Usage](#usage)
- [Defining resources](#defining-resources)
	- [Handling GET and HEAD requests](#handling-get-and-head-requests)
		- [Documents](#documents)
		- [Collections](#collections)
	- [Handling DELETE requests](#handling-delete-requests)
	- [Handling PUT and PATCH requests](#handling-put-and-patch-requests)
	- [Handling POST requests](#handling-post-requests)
	- [Sub-resources](#sub-resources)
- [Built-in resource definition helpers](#built-in-resource-definition-helpers)
	- [Native resources](#native-resources)
	- [Mongoose resources](#mongoose-resources)
		- [Basics](#basics)
		- [Subresource types](#subresource-types)
		- [Options](#options)
			- [`query`](#query)
			- [`sort`](#sort)
			- [`toObject`](#toobject)
			- [`key`](#key)
- [Miscellaneous](#miscellaneous)
	- [Removing resources](#removing-resources)
	- [Calling callbacks](#calling-callbacks)

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

Resources are defined by calling `yarm.resource("name", definition)`.  The
definition should have methods to handle the different HTTP request verbs.  When
a request is made on a resource that does not have the corresponding methods,
yarm sends a 405 Not Allowed response to the client.

### Handling GET and HEAD requests

yarm allows two main kinds of resources when handling GET and HEAD requests:
documents and collections.  Documents are basic resources, while collections are
sets of documents.  yarm distinguishes between the two based on the methods
available on the resource definition.

#### Documents

To enable document-type GET handling,  you just need to set a `get` method on
the resource definition.

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
an optional `Error` instance, and with the resource representation to send to
the client.  This representation can be one of the following:

* A plain Javascript object to be sent as JSON
* A string, `Buffer` instance, or readable stream
* An instance of `yarm.ResponseBody`.  This enables setting the response
  mimetype.
* An instance of `yarm.ResponseFile`.  This enables sending files with a
  specified mimetype, using Express' `res.sendfile()`.
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

#### Collections

To enable collection-type GET handling, define two `count` and `list` methods.

```javascript
yarm.resource("collection", {
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

The `count` method receives the request object and a callback as parameters, and
should call the callback with an optional `Error` instance and the total number
of resources in the collection as parameters.  The `list` method receives the
request object, the requested offset and limit, and a callback as parameters,
and should call the callback with an optional `Error` instance and an array
corresponding to the requested items as parameters.  A limit of zero indicates
that the client requests as many items as possible.  Note that yarm will not
check whether what you send from `list` abides by the requested offset and
limit.  It won't even check whether you sent an actual array.

When handling GET requests on collections, yarm will respond with a JSON object
containing a `_count` key with the total collection item count, and a `_items`
key with the item array sent by `list`.

```sh
$ curl http://localhost/rest/collection
{
	"_count": 3,
	"_items": [1, 2, 3]
}
```

yarm supports two querystring parameters when GETting collections: `offset` and
`limit`.

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

Note that when a `get` method also exists on the resource definition, it will
take precedence over the `count` and `list` methods and the resource will be
handled as a document.

### Handling DELETE requests

Deleting a resource is enabled by defining a `del` method.  This method has the
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

### Handling PUT and PATCH requests

Replacing and updating a resource is enabled by defining a `put` method.  This
method will receive the request object, a boolean indicating whether this is a
PATCH request and a callback.  As for the other methods, you should call the
callback with an optional `Error` instance and with the response body as
parameters.

```javascript
var object = { hello: "world" };

yarm.resource("updateable", {
	put: function(req, isPatch, cb) {
		// app.use(express.json()) is needed here so that req.body is defined
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

Note: you should add the `--header "Content-Type: application/json"` option to
the curl command line for those examples to work as intented.  I omitted it for
the sake of readability.

There is currently no way to enable only one of the PUT and PATCH method at a
time with yarm.  You can still implement that manually however.

```javascript
yarm.resource("patchOnly", {
	put: function(req, isPatch, cb) {
		if (!isPatch) {
			var err = new Error("Not allowed");
			err.code = 405;
			cb(err);
			return;
		}

		// actual PATCH handling
	}
});
```

### Handling POST requests

To enable POST requests on a resource, define a `post` method.  It will receive
the request object and a callback to call with an optional `Error` instance and
the response body as parameters.  POST requests may make more sense on
collections than documents, but in the end it's up to you.


```javascript
var array = [1, 2, 3];

yarm.resource("collection", {
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

If you would like to insert items at a specific index in the collection, you can
implement it using a custom querystring parameter.

```javascript
var array = [1, 2, 3];

yarm.resource("collection", {
	/* ... */

	post: function(req, cb) {
		if (req.params("index")) {
			array.splice(Number(req.params("index")), 0, req.body);
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

### Sub-resources

You can enable accessing sub-resources on any resource in yarm, no matter
whether the resource is a document or a collection.  To enable sub-resource
lookup on a resource, define a `sub` method on that resource.  This method will
receive the sub-resource name and a callback as arguments.  It should call the
callback with an optional `Error` instance and the sub-resource definition as
parameters.

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

Built-in resource definition helpers
------------------------------------

### Native resources

```javascript
yarm.nativeResource("array", [1, 2, 3]);

yarm.nativeResource("object", { key: "value" });

yarm.nativeResource("number", 42);
```

### Mongoose resources

#### Basics

`yarm.mongooseResource()` enables you to automatically define a collection
resource from a mongoose Model.  Note that this helper is only available when
mongoose is present.

```javascript
yarm.mongooseResource("model", Model);
```

```sh
$ curl http://localhost/rest/model
{
	"_count": 1,
	"_items": [
		{
			"_id": "51fc0639a6c35ee82600019d",
			"_href": "http://localhost/rest/model/51fc0639a6c35ee82600019d",
			"field": "value",
			"subDoc": {
				"field": "value"
			}
		}
	]
}
```

Resources created this way are collections.  You can request individual
documents with their _id field.  Note that the `_href` field is automatically
generated on each request.

```sh
$ curl http://localhost/rest/model/51fc0639a6c35ee82600019d
{
	"_id": "51fc0639a6c35ee82600019d",
	"_href": "http://localhost/rest/model/51fc0639a6c35ee82600019d",
	"field": "value",
	"subDoc": {
		"field": "subvalue"
	}
}
```

More generally, `yarm.mongooseResource` enables requesting the whole document
tree at any depth.

```sh
$ curl http://localhost/rest/model/51fc0639a6c35ee82600019d/field
value
$ curl http://localhost/rest/model/51fc0639a6c35ee82600019d/subDoc
{ "field": "subvalue" }
$ curl http://localhost/rest/model/51fc0639a6c35ee82600019d/subDoc/field
subValue
```

Requests on the toplevel collection accept a `query` querystring parameter to
filter returned documents.  The value of this parameter must be a set of
`field:value` criteria separated by `AND` and `OR` operators.  Note that `AND`
operators take precedence over `OR` operators.  `field:value` criteria match
fields with the exact value passed, but you can also pass regular expressions.

	?query=field1:value OR field2:/^foo/ AND subdoc.field:/^bar/

There is currently no strict syntax checks on queries.  Malformed queries may
make yarm throw exceptions.

#### Subresource types

`yarm.mongooseResource` generates 4 kinds of resource definitions when dealing
with mongoose Models.

##### Model resources

This is the toplevel resource defined to access the underlying mongodb
Collection.  It supports GET requests as described above, but you can also add
new documents to the collection with POST requests.  The default handler will
call Model#create with the request body.

Individual documents are accessible as subresources.

##### Document resources

This is the resource type defined to access individual collection documents and
embedded documents.

GET requests on document resources will return the JSON representation of the
document, including a `_href` field with the full request URL.

PUT and PATCH requests on document resources will attempt to update documents by
calling `Document#update` with the request body.

DELETE requests on document resources will attempt to delete documents by
calling `Document#remove`.  This may not work on embedded documents unless you
manually define a remove method.

##### DocumentArray resources

This is the resource type defined when accessing mongoose DocumentArrays fields.
DocumentArray resources are collections.

GET requests on DocumentArray resources work a lot like those on the toplevel
Model resource.  They support the `query` querystring parameter with the same
syntax, but please note that filtering in this case is handled by yarm, not
by mongoose queries.  The whole DocumentArray is always fetched, which can be an
issue when dealing with large DocumentArrays.  You may want to use aggregates
instead in this case.

POST requests on DocumentArray resources will attempt to add a new subdocument 
by pushing the request body on the DocumentArray and saving the owner document.

Individual subdocuments are made accessible as subresources.

##### Document value resources

This is the resource type defined when accessing document fields that are
neither embedded documents nor DocumentArrays.

GET requests on value resources return the raw value or a JSON representation
when the value is an array.  You can use mongoose virtuals or toObject 
transforms to send custom representations of values.

```javascript
Schema.virtual("custom").get(function() {
	return new yarm.ResponseBody(this.field, "application/x-custom");
});

yarm.mongooseResource("model", Model, {
	toObject: {
		transform: function(doc, ret, options) {
			ret.image = new yarm.ResponseFile(this.imagePath, "image/png");
		}
	}
})
```

PUT and PATCH requests on value resources will attempt to update the owner
document by updating the field value and calling `Document#save`.  This may not
work on embedded documents unless you manually define a save method.

#### Options

`yarm.mongooseResource` accepts an options object as its third parameter to
customize its behaviour. The following options are available:

##### `query`

By default, `yarm.mongooseResource` queries mongoose collections by calling
`Model#find()`.  You can override this by passing a function that returns a
mongoose Query as the `query` option.  You may need this for example when
subdocuments need populating, or when you want to filter available documents.

```javascript
yarm.resource("populated", Model, {
	query: function() {
		return Model.find().populate("subdoc");
	}
});

yarm.resource("filtered", Model, {
	query: function() {
		return Model.find({ restAvailable: true });
	}
});
```

##### `sort`

You can pass a mongoose/mongodb sort operator as the `sort` option.  Note that
the same result can be achieved with the `query` option.

```javascript
yarm.resource("sorted", Model, {
	sort: { field: "desc" }
});

yarm.resource("sorted", Model, {
	query: function() {
		return Model.find().sort({ field: "desc" });
	}
});
```

##### `toObject`

`yarm.mongooseResource` calls the `toObject` method on mongoose documents before
returning them.  You can tell it which `toObject` options to use (see mongoose
documentation for the available options).

```javascript
yarm.resource("withVirtuals", Model, {
	toObject: { virtuals: true }
});
```

#### `overrides`

You can override any method in resource definitions generated by
`yarm.mongooseResource` by passing an object as the `override` option.  Keys in
this object are resource path patterns, and values contain the resource
definition methods to override.  Those methods are defined the same way as
[usual resource methods](#defining-resources), except they receive the target
object (Model, Document, DocumentArray or field value) as an additional first
argument.  You can also disable methods by setting them to `undefined`.

```javascript
yarm.mongooseResource("model", Model, {
	overrides: {
		// Overrides for 'field' in a specific document
		"model/51fc0639a6c35ee82600019d/field": {
			get: function(fieldValue, req, cb) {
				cb(null, "Field value is " + fieldValue);
			},

			put: undefined
		}
	}
});
```

You can use a "$" character in path patterns to match any single path element.

```javascript
yarm.mongooseResource("model", Model, {
	overrides: {
		// Overrides for 'field' in all documents
		"model/$/field": {
			get: function(fieldValue, req, cb) {
				cb(null, "Field value is " + fieldValue);
			}
		}
	}
});
```

You can also use a "*" character to match one or more path elements.

```javascript
yarm.mongooseResource("nodelete", Model, {
	overrides: {
		// Disable DELETE everywhere
		"*": {
			del: undefined
		},

		// Disable GET on any "secret" field
		"*/secret": {
			get: undefined
		}
	}
});
```

##### `key`

By default, `yarm.mongooseResource` uses the `_id` field to identifty individual
documents in the collection.  You may want to avoid ObjectIDs in your REST URLs,
in which case you can pass an alternate field name to use as the `key` option.

```javascript
yarm.resource("model", Model, {
	key: "name"
});
```

```sh
$ curl http://localhost/rest/model
{
	"_count": 1,
	"_items": [
		{
			"_id": "51fc0639a6c35ee82600019d",
			"_href": "http://localhost/rest/model/foo",
			"name": "foo",
			"field": "value"
		}
	]
}
$ curl http://localhost/rest/model/foo
{
	"_id": "51fc0639a6c35ee82600019d",
	"_href": "http://localhost/rest/model/foo",
	"name": "foo",
	"field": "value"
}
```

Note that when using the `key` option that way, the `_id` field will still be
used to access resources in DocumentArrays.  You can change that by using path
patterns (see the [`overrides`](#overrides) option above for path pattern
syntax details).

```javascript
yarm.mongooseResource("model", Model, {
	key: {
		"model": "name",
		"model/$/subDocArray": "title"
	}
})
```

#### Aggregate resources

`yarm.mongooseResource.aggregate` can be used to define resource from aggregate
pipelines on a model.  Aggregate resources are inherently more limited as they
are read only, but in a read-only scenario they can be really flexible as you
can `$project` documents at will.

```javascript
yarm.mongooseResource.aggregate("aggregate", Model, [
	{ $project : {
		author : 1,
		tags : 1,
	} },
	{ $unwind : "$tags" },
	{ $group : {
		_id : { tags : "$tags" },
		authors : { $addToSet : "$author" }
	} }
])
```

Aggregate resources are collections.  GET requests on aggregate resources
support a `?query=` parameter as for other collections, which is handled
directly in the aggregation pipeline (as well as `offset` and `limit`).

You can access aggregated documents as subresources by their `_id` field.  There
is no way to change this behaviour as you can already use the `$project` and
`$group` aggregation operators to customize the `_id` value.

Only GET/HEAD requests are supported for now.

Miscellaneous
-------------

### Removing resources

You can remove previously defined resources by calling
`yarm.resource.remove("name");`.

### Calling callbacks

You may want to use `process.nextTick()` instead of calling the resource method
callbacks directly.  This is mainly useful to avoid exceeding the call stack
limit when dealing deeply nested subresources.  One disadvantage is that it adds
an additional level of callback nesting in your code.

```javascript
yarm.resource("nextTick", {
	get: function(req, cb) {
		process.nextTick(function() {
			cb(null, { hello: "world" });
		});
	}
});
```
